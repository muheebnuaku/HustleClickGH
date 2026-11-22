import { prisma } from "@/lib/prisma";
import { broadcastEmail, isRateLimitError, sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity-log";

/**
 * Server-side queue for bulk e-mail (admin broadcasts). Zoho allows about 50
 * messages at a time, so the whole site sends at most EMAIL_BATCH_SIZE e-mails
 * per EMAIL_BATCH_INTERVAL_MIN-minute window (a window starts with its first
 * send): 2,000 e-mails go out as 45 batches over about 34 hours. The 5-message
 * headroom is left for transactional mail (welcome, password reset).
 *
 * Nothing depends on a browser tab staying open. processEmailQueue() is called
 * by a GitHub Actions schedule (every 10 min, /api/cron/email-queue), on normal
 * site traffic, and by the admin page while it is open. Each call claims its
 * share of the window's quota atomically, so overlapping calls never exceed it.
 */

export const EMAIL_BATCH_SIZE = 45;
export const EMAIL_BATCH_INTERVAL_MIN = 45;
const WINDOW_MS = EMAIL_BATCH_INTERVAL_MIN * 60_000;
const WINDOW_KEY = "email_queue_window";
// Rate-limit-shaped failures in a row before we treat it as the provider blocking us.
const RATE_LIMIT_STREAK_TO_PAUSE = 3;

interface Window {
  start: number; // ms epoch of the window's first send
  sent: number; // quota used in this window
}

async function readWindow(): Promise<{ raw: string | null; w: Window }> {
  const row = await prisma.appSetting.findUnique({ where: { key: WINDOW_KEY } });
  try {
    const w = row ? (JSON.parse(row.value) as Window) : null;
    if (w && Number.isFinite(w.start) && Number.isFinite(w.sent)) return { raw: row!.value, w };
  } catch {
    /* fall through */
  }
  return { raw: row?.value ?? null, w: { start: 0, sent: 0 } };
}

/** Compare-and-set the window row; false if another call changed it first. */
async function writeWindow(raw: string | null, next: Window): Promise<boolean> {
  const value = JSON.stringify(next);
  if (raw === null) {
    try {
      await prisma.appSetting.create({ data: { key: WINDOW_KEY, value } });
      return true;
    } catch {
      return false; // created concurrently
    }
  }
  const r = await prisma.appSetting.updateMany({ where: { key: WINDOW_KEY, value: raw }, data: { value } });
  return r.count === 1;
}

/** Reserves up to `want` sends in the current window. */
async function claim(want: number, now = Date.now()): Promise<{ granted: number; nextBatchAt: Date | null }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { raw, w } = await readWindow();
    const fresh = now - w.start >= WINDOW_MS;
    const cur = fresh ? { start: now, sent: 0 } : w;
    const granted = Math.max(0, Math.min(want, EMAIL_BATCH_SIZE - cur.sent));
    if (granted === 0) return { granted: 0, nextBatchAt: new Date(cur.start + WINDOW_MS) };
    if (await writeWindow(raw, { start: cur.start, sent: cur.sent + granted })) return { granted, nextBatchAt: null };
  }
  return { granted: 0, nextBatchAt: null };
}

/** Gives back quota that was claimed but not used (queue ran dry, run cut short). */
async function refund(n: number) {
  if (n <= 0) return;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { raw, w } = await readWindow();
    if (!raw) return;
    if (await writeWindow(raw, { ...w, sent: Math.max(0, w.sent - n) })) return;
  }
}

/** Uses up the rest of the window, e.g. after the provider starts refusing mail. */
async function exhaustWindow() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { raw, w } = await readWindow();
    const start = Date.now() - w.start >= WINDOW_MS ? Date.now() : w.start;
    if (await writeWindow(raw, { start, sent: EMAIL_BATCH_SIZE })) return;
  }
}

/** When the next batch may start (null = now). */
export async function nextBatchAt(now = Date.now()): Promise<Date | null> {
  const { w } = await readWindow();
  if (now - w.start >= WINDOW_MS || w.sent < EMAIL_BATCH_SIZE) return null;
  return new Date(w.start + WINDOW_MS);
}

/** Recomputes a broadcast's counts and status; logs once when it finishes. */
export async function refreshBroadcast(broadcastId: string) {
  const [sentCount, failedCount, pending, before] = await Promise.all([
    prisma.emailRecipient.count({ where: { broadcastId, status: "sent" } }),
    prisma.emailRecipient.count({ where: { broadcastId, status: "failed" } }),
    prisma.emailRecipient.count({ where: { broadcastId, status: "pending" } }),
    prisma.emailBroadcast.findUnique({ where: { id: broadcastId }, select: { status: true, subject: true, total: true, createdById: true, createdByName: true } }),
  ]);
  const status = pending > 0 ? "sending" : failedCount > 0 ? "partial" : "completed";
  await prisma.emailBroadcast.update({ where: { id: broadcastId }, data: { sentCount, failedCount, status } });
  if (before && before.status === "sending" && status !== "sending") {
    logActivity({
      type: "email_broadcast",
      userId: before.createdById,
      userName: before.createdByName,
      severity: failedCount > 0 ? "error" : "success",
      metadata: { broadcastId, subject: before.subject, total: before.total, sent: sentCount, failed: failedCount },
    });
  }
  return { sentCount, failedCount, pending, status };
}

/**
 * Sends the next slice of queued broadcast e-mail if the window allows.
 * `maxPerRun` keeps one call well inside the serverless time limit.
 */
export async function processEmailQueue(maxPerRun = 15): Promise<{ sent: number; failed: number; paused: string | null; nextBatchAt: Date | null; pending: number }> {
  const broadcasts = await prisma.emailBroadcast.findMany({
    where: { status: "sending" },
    orderBy: { createdAt: "asc" },
    select: { id: true, subject: true, message: true },
  });
  if (!broadcasts.length) return { sent: 0, failed: 0, paused: null, nextBatchAt: null, pending: 0 };
  await requeueStuck();
  const pendingTotal = broadcasts.length
    ? await prisma.emailRecipient.count({ where: { broadcastId: { in: broadcasts.map((b) => b.id) }, status: "pending" } })
    : 0;
  if (!pendingTotal) {
    // Close out broadcasts whose last recipients were handled elsewhere.
    for (const b of broadcasts) await refreshBroadcast(b.id);
    return { sent: 0, failed: 0, paused: null, nextBatchAt: null, pending: 0 };
  }

  const { granted, nextBatchAt: waitUntil } = await claim(Math.min(maxPerRun, pendingTotal));
  if (!granted) return { sent: 0, failed: 0, paused: null, nextBatchAt: waitUntil, pending: pendingTotal };

  let used = 0;
  let sent = 0;
  let failed = 0;
  let paused: string | null = null;
  let streak = 0;
  const touched = new Set<string>();

  outer: for (const b of broadcasts) {
    if (used >= granted) break;
    const batch = await prisma.emailRecipient.findMany({
      where: { broadcastId: b.id, status: "pending" },
      orderBy: { createdAt: "asc" },
      take: granted - used,
    });
    for (const r of batch) {
      // Claim the row first so an overlapping run can't send it twice.
      const mine = await prisma.emailRecipient.updateMany({ where: { id: r.id, status: "pending" }, data: { status: "sending" } });
      if (mine.count !== 1) continue;
      used++;
      touched.add(b.id);
      const mail = broadcastEmail(b.subject, b.message, r.fullName || undefined);
      const result = await sendEmail({ to: r.email, subject: mail.subject, html: mail.html });
      if (result.ok) {
        sent++;
        streak = 0;
        await prisma.emailRecipient.update({ where: { id: r.id }, data: { status: "sent", error: null, attempts: { increment: 1 } } });
      } else if (isRateLimitError(result.error)) {
        // The provider is throttling us: keep it queued for the next window.
        streak++;
        await prisma.emailRecipient.update({ where: { id: r.id }, data: { status: "pending", error: (result.error || "").slice(0, 300), attempts: { increment: 1 } } });
        if (streak >= RATE_LIMIT_STREAK_TO_PAUSE) {
          paused = result.error || "Sending limit reached";
          await exhaustWindow();
          break outer;
        }
      } else {
        failed++;
        streak = 0;
        await prisma.emailRecipient.update({
          where: { id: r.id },
          data: { status: "failed", error: (result.error || "unknown error").slice(0, 300), attempts: { increment: 1 } },
        });
      }
      if (used >= granted) break outer;
    }
  }

  if (!paused) await refund(granted - used);
  for (const id of touched) await refreshBroadcast(id);
  return { sent, failed, paused, nextBatchAt: await nextBatchAt(), pending: pendingTotal - sent - failed };
}

/** Rows left in "sending" by a run that was cut off (timeout) go back to the queue. */
export async function requeueStuck(olderThanMin = 10) {
  const r = await prisma.emailRecipient.updateMany({
    where: { status: "sending", updatedAt: { lt: new Date(Date.now() - olderThanMin * 60_000) } },
    data: { status: "pending" },
  });
  return r.count;
}
