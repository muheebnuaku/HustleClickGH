export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { sendEmail, broadcastEmail, isRateLimitError } from "@/lib/email";
import { logActivity, getIp } from "@/lib/activity-log";

type Target = "all" | "verified" | "unverified" | "no_location" | "country" | "custom";

interface Recipient {
  email: string;
  fullName: string;
}

// How many recipients to attempt per POST — kept small so a chunk never nears
// the 60s serverless limit even on slow SMTP.
const BATCH = 15;

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

/** Recompute a broadcast's aggregate counts + status from its recipient rows. */
async function refreshBroadcast(broadcastId: string, aborted: boolean) {
  const [sentCount, failedCount, pending] = await Promise.all([
    prisma.emailRecipient.count({ where: { broadcastId, status: "sent" } }),
    prisma.emailRecipient.count({ where: { broadcastId, status: "failed" } }),
    prisma.emailRecipient.count({ where: { broadcastId, status: "pending" } }),
  ]);
  const status = aborted
    ? "stopped"
    : pending > 0
    ? "sending"
    : failedCount > 0
    ? "partial"
    : "completed";
  await prisma.emailBroadcast.update({
    where: { id: broadcastId },
    data: { sentCount, failedCount, status },
  });
  return { sentCount, failedCount, pending, status };
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

      return NextResponse.json({ broadcastId: broadcast.id, total: recipients.length });
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
      return NextResponse.json({ pending: reset.count });
    }

    // ── PROCESS next batch ───────────────────────────────────────────────────
    if (action === "process") {
      const { broadcastId } = body;
      const broadcast = broadcastId
        ? await prisma.emailBroadcast.findUnique({ where: { id: broadcastId } })
        : null;
      if (!broadcast) return NextResponse.json({ message: "Broadcast not found" }, { status: 404 });

      const batch = await prisma.emailRecipient.findMany({
        where: { broadcastId, status: "pending" },
        take: BATCH,
        orderBy: { createdAt: "asc" },
      });

      let sent = 0;
      let failed = 0;
      let aborted: string | null = null;

      // Sequential — shared SMTP mailboxes rate-limit parallel connections.
      for (const r of batch) {
        const mail = broadcastEmail(broadcast.subject, broadcast.message, r.fullName || undefined);
        const result = await sendEmail({ to: r.email, subject: mail.subject, html: mail.html });
        if (result.ok) {
          sent++;
          await prisma.emailRecipient.update({
            where: { id: r.id },
            data: { status: "sent", error: null, attempts: { increment: 1 } },
          });
        } else {
          failed++;
          await prisma.emailRecipient.update({
            where: { id: r.id },
            data: {
              status: "failed",
              error: (result.error || "unknown error").slice(0, 300),
              attempts: { increment: 1 },
            },
          });
          // A usage/rate block hits every remaining recipient too — stop and
          // leave the rest pending so they can be resent once it clears.
          if (isRateLimitError(result.error)) {
            aborted = result.error || "Sending limit reached";
            break;
          }
        }
      }

      const agg = await refreshBroadcast(broadcastId, Boolean(aborted));
      const done = agg.pending === 0 || Boolean(aborted);

      if (done) {
        logActivity({
          type: "email_broadcast",
          userId: session.user.id,
          userName: session.user.name,
          severity: agg.failedCount > 0 || aborted ? "error" : "success",
          metadata: {
            broadcastId,
            subject: broadcast.subject,
            total: broadcast.total,
            sent: agg.sentCount,
            failed: agg.failedCount,
            aborted,
          },
          ip: getIp(request),
        });
      }

      return NextResponse.json({
        sent,
        failed,
        remaining: agg.pending,
        sentTotal: agg.sentCount,
        failedTotal: agg.failedCount,
        done,
        aborted,
      });
    }

    return NextResponse.json({ message: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Email broadcast error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
