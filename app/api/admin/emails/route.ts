export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { EMAIL_BATCH_INTERVAL_MIN, EMAIL_BATCH_SIZE, nextBatchAt, processEmailQueue, refreshBroadcast } from "@/lib/email-queue";

type Target = "all" | "verified" | "unverified" | "no_location" | "country" | "custom";

interface Recipient {
  email: string;
  fullName: string;
}

/** Build the recipient list for a target selection. */
async function resolveRecipients(
  target: Target,
  country?: string,
  customEmails?: string[]
): Promise<Recipient[]> {
  if (target === "custom") {
    const list = (customEmails || [])
      .map((e) => e.trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!list.length) return [];
    const known = await prisma.user.findMany({
      where: { email: { in: list } },
      select: { email: true, fullName: true },
    });
    const byEmail = new Map(known.map((u) => [u.email.toLowerCase(), u.fullName]));
    return list.map((email) => ({ email, fullName: byEmail.get(email.toLowerCase()) || "" }));
  }

  const where: Record<string, unknown> = { role: "user", status: "active" };
  if (target === "verified") where.verified = true;
  if (target === "unverified") where.verified = false;
  if (target === "no_location") where.OR = [{ country: null }, { country: "" }];
  if (target === "country" && country) where.country = country;

  const users = await prisma.user.findMany({
    where,
    select: { email: true, fullName: true },
    orderBy: { createdAt: "asc" },
  });
  return users.filter((u) => u.email).map((u) => ({ email: u.email, fullName: u.fullName || "" }));
}

/** De-duplicate a recipient list by lowercased email, keeping the first name seen. */
function dedupe(list: Recipient[]): Recipient[] {
  const seen = new Map<string, Recipient>();
  for (const r of list) {
    const key = r.email.toLowerCase();
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

// ── GET: recipient counts (default), broadcast history (?list=1), detail (?id=) ──
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  // History list
  if (searchParams.get("list")) {
    const broadcasts = await prisma.emailBroadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ broadcasts });
  }

  // Single broadcast detail — status breakdown + who failed
  const id = searchParams.get("id");
  if (id) {
    const broadcast = await prisma.emailBroadcast.findUnique({ where: { id } });
    if (!broadcast) return NextResponse.json({ message: "Not found" }, { status: 404 });
    const [failed, sent] = await Promise.all([
      prisma.emailRecipient.findMany({
        where: { broadcastId: id, status: "failed" },
        select: { email: true, fullName: true, error: true },
        orderBy: { email: "asc" },
      }),
      prisma.emailRecipient.findMany({
        where: { broadcastId: id, status: "sent" },
        select: { email: true, fullName: true },
        orderBy: { email: "asc" },
      }),
    ]);
    return NextResponse.json({ broadcast, failed, sent });
  }

  // Default: recipient counts per target
  const [all, verified, unverified, noLocation, countryRows] = await Promise.all([
    prisma.user.count({ where: { role: "user", status: "active" } }),
    prisma.user.count({ where: { role: "user", status: "active", verified: true } }),
    prisma.user.count({ where: { role: "user", status: "active", verified: false } }),
    prisma.user.count({
      where: { role: "user", status: "active", OR: [{ country: null }, { country: "" }] },
    }),
    prisma.user.groupBy({
      by: ["country"],
      where: { role: "user", status: "active" },
      _count: { country: true },
    }),
  ]);

  const countries = countryRows
    .filter((r) => r.country)
    .map((r) => ({ country: r.country as string, count: r._count.country }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ all, verified, unverified, noLocation, countries });
}

/**
 * POST actions:
 *   start   — create a broadcast + its recipient rows (status pending)
 *   process — attempt the next BATCH of pending recipients, recording who got it
 *   resend  — reset this broadcast's failed recipients back to pending
 * The client calls start once, then process repeatedly until done.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const action: string = body.action || "start";

    // ── START ──────────────────────────────────────────────────────────────
    if (action === "start") {
      const { subject, message, target = "all", country, emails } = body;
      if (!subject?.trim() || !message?.trim()) {
        return NextResponse.json({ message: "Subject and message are required" }, { status: 400 });
      }
      const recipients = dedupe(await resolveRecipients(target as Target, country, emails));
      if (recipients.length === 0) {
        return NextResponse.json({ message: "No recipients matched" }, { status: 400 });
      }

      const broadcast = await prisma.emailBroadcast.create({
        data: {
          subject: subject.trim(),
          message: message.trim(),
          target,
          country: target === "country" ? country || null : null,
          createdById: session.user.id,
          createdByName: session.user.name || null,
          total: recipients.length,
          status: "sending",
        },
      });

      await prisma.emailRecipient.createMany({
        data: recipients.map((r) => ({
          broadcastId: broadcast.id,
          email: r.email,
          fullName: r.fullName || null,
        })),
      });

      // Sending happens server-side in batches; the first one starts now.
      after(() => processEmailQueue().then(() => undefined).catch((e) => console.error("[email-queue] start failed:", e)));
      return NextResponse.json({ broadcastId: broadcast.id, total: recipients.length, batchSize: EMAIL_BATCH_SIZE, intervalMin: EMAIL_BATCH_INTERVAL_MIN });
    }

    // ── RESEND (failed → pending) ────────────────────────────────────────────
    if (action === "resend") {
      const { broadcastId } = body;
      const broadcast = broadcastId
        ? await prisma.emailBroadcast.findUnique({ where: { id: broadcastId } })
        : null;
      if (!broadcast) return NextResponse.json({ message: "Broadcast not found" }, { status: 404 });

      const reset = await prisma.emailRecipient.updateMany({
        where: { broadcastId, status: "failed" },
        data: { status: "pending", error: null },
      });
      await prisma.emailBroadcast.update({
        where: { id: broadcastId },
        data: { status: reset.count > 0 ? "sending" : broadcast.status },
      });
      if (reset.count) after(() => processEmailQueue().then(() => undefined).catch((e) => console.error("[email-queue] resend failed:", e)));
      return NextResponse.json({ pending: reset.count });
    }

    // ── PROCESS: send the next queued slice if the batch window allows ──────────
    if (action === "process") {
      const { broadcastId } = body;
      const broadcast = broadcastId
        ? await prisma.emailBroadcast.findUnique({ where: { id: broadcastId } })
        : null;
      if (!broadcast) return NextResponse.json({ message: "Broadcast not found" }, { status: 404 });

      const run = await processEmailQueue();
      const agg = await refreshBroadcast(broadcastId);
      return NextResponse.json({
        sent: run.sent,
        failed: run.failed,
        remaining: agg.pending,
        sentTotal: agg.sentCount,
        failedTotal: agg.failedCount,
        done: agg.pending === 0,
        paused: run.paused,
        nextBatchAt: agg.pending ? (run.nextBatchAt ?? (await nextBatchAt())) : null,
        batchSize: EMAIL_BATCH_SIZE,
        intervalMin: EMAIL_BATCH_INTERVAL_MIN,
      });
    }

    return NextResponse.json({ message: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Email broadcast error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
