export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { sendEmail, broadcastEmail } from "@/lib/email";
import { logActivity, getIp } from "@/lib/activity-log";

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
    // Use real names where we know them
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
  return users.filter((u) => u.email);
}

// Recipient counts so the admin UI can show how many each option reaches
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

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
 * Send one chunk of a broadcast. The client calls this repeatedly with an
 * increasing offset so large sends never hit the serverless timeout, and it can
 * show progress. Returns nextOffset = null when finished.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const {
      subject,
      message,
      target = "all",
      country,
      emails,
      offset = 0,
      limit = 20,
    } = await request.json();

    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json({ message: "Subject and message are required" }, { status: 400 });
    }

    const recipients = await resolveRecipients(target as Target, country, emails);
    const total = recipients.length;
    if (total === 0) {
      return NextResponse.json({ message: "No recipients matched", total: 0, sent: 0, nextOffset: null });
    }

    const chunk = recipients.slice(offset, offset + limit);
    let sent = 0;
    let failed = 0;

    // Sequential: shared SMTP mailboxes rate-limit parallel connections
    for (const r of chunk) {
      const mail = broadcastEmail(subject.trim(), message.trim(), r.fullName || undefined);
      const ok = await sendEmail({ to: r.email, subject: mail.subject, html: mail.html });
      ok ? sent++ : failed++;
    }

    const nextOffset = offset + limit < total ? offset + limit : null;

    if (nextOffset === null) {
      logActivity({
        type: "email_broadcast",
        userId: session.user.id,
        userName: session.user.name,
        severity: "info",
        metadata: { subject, target, total },
        ip: getIp(request),
      });
    }

    return NextResponse.json({ total, sent, failed, nextOffset });
  } catch (error) {
    console.error("Email broadcast error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
