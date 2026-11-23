import { prisma } from "@/lib/prisma";
import { broadcastEmail, isRateLimitError, sendEmail, usingBulkTransport } from "@/lib/email";
import { logActivity } from "@/lib/activity-log";
import { sendPushToAll } from "@/lib/push";

/**
 * Server-side queue for bulk e-mail (admin broadcasts).
 *
 * Mailbox providers like Zoho limit both bursts and the DAILY total, and they
 * block the whole mailbox for "unusual sending activity" (which also stops
 * welcome and password-reset mail). So the queue:
 *  - sends at most `batchSize` per `intervalMin` window and at most `dailyCap`
 *    per day (UTC = Ghana time), all editable by admins;
 *  - stops itself (global pause, with the provider's reason) the moment the
 *    provider refuses mail, instead of retrying and lengthening the block;
 *  - can be paused/resumed by admins globally or per broadcast;
 *  - uses a separate bulk SMTP service when BULK_SMTP_* is configured, so
 *    broadcasts can't get the main mailbox blocked.
 *
 * processEmailQueue() is called by a GitHub Actions schedule (every 10 min,
 * /api/cron/email-queue), on normal site traffic, and by the admin page.
 * Quota is claimed atomically, so overlapping calls never exceed the limits.
 */

const SETTINGS_KEY = "email_queue_settings";
const WINDOW_KEY = "email_queue_window";
// Provider refusals in a row before we treat it as a block and pause everything.
const BLOCK_STREAK_TO_PAUSE = 2;

export interface QueueSettings {
  paused: boolean;
  pausedReason: string | null;
  pausedAt: string | null;
  batchSize: number;
  intervalMin: number;
  dailyCap: number; // 0 = no daily cap
}

export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  paused: false,
  pausedReason: null,
  pausedAt: null,
  batchSize: 45,
  intervalMin: 45,
  dailyCap: 250,
};

function normalize(raw: Partial<QueueSettings> | null | undefined): QueueSettings {
  const s = { ...DEFAULT_QUEUE_SETTINGS, ...(raw ?? {}) };
  const int = (v: unknown, min: number, max: number, dflt: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  };
  return {
    paused: s.paused === true,
    pausedReason: s.paused ? (s.pausedReason ? String(s.pausedReason).slice(0, 300) : null) : null,
    pausedAt: s.paused ? s.pausedAt ?? new Date().toISOString() : null,
    batchSize: int(s.batchSize, 1, 500, 45),
    intervalMin: int(s.intervalMin, 1, 1440, 45),
    dailyCap: int(s.dailyCap, 0, 100_000, 250),
  };
}

export async function getQueueSettings(): Promise<QueueSettings> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    return normalize(row ? JSON.parse(row.value) : null);
  } catch {
    return { ...DEFAULT_QUEUE_SETTINGS };
  }
}

export async function saveQueueSettings(input: Partial<QueueSettings>): Promise<QueueSettings> {
  const current = await getQueueSettings();
  const next = normalize({ ...current, ...input });
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

export function setQueuePaused(paused: boolean, reason?: string | null) {
  return saveQueueSettings({ paused, pausedReason: paused ? reason ?? "Paused by an admin" : null, pausedAt: paused ? new Date().toISOString() : null });
}

// ------------------------------------------------------------------ quota

interface Window {
  start: number; // ms epoch of the window's first send
  sent: number; // used in this window
  day: string; // YYYY-MM-DD (UTC, = Ghana time)
  daySent: number; // used today
}

const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const nextMidnight = (now = Date.now()) => new Date(new Date(today(now) + "T00:00:00Z").getTime() + 86_400_000);

async function readWindow(): Promise<{ raw: string | null; w: Window }> {
  const row = await prisma.appSetting.findUnique({ where: { key: WINDOW_KEY } });
  try {
    const w = row ? (JSON.parse(row.value) as Partial<Window>) : null;
    if (w && Number.isFinite(w.start) && Number.isFinite(w.sent)) {
      return { raw: row!.value, w: { start: w.start!, sent: w.sent!, day: w.day ?? "", daySent: Number(w.daySent) || 0 } };
    }
  } catch {
    /* fall through */
  }
  return { raw: row?.value ?? null, w: { start: 0, sent: 0, day: "", daySent: 0 } };
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

/** Applies window/day roll-over for "now" without writing. */
function current(w: Window, s: QueueSettings, now: number): Window {
  const fresh = now - w.start >= s.intervalMin * 60_000;
  const d = today(now);
  return {
    start: fresh ? now : w.start,
    sent: fresh ? 0 : w.sent,
    day: d,
    daySent: w.day === d ? w.daySent : 0,
  };
}

function waitUntil(cur: Window, s: QueueSettings, now: number): Date {
  const dayFull = s.dailyCap > 0 && cur.daySent >= s.dailyCap;
  return dayFull ? nextMidnight(now) : new Date(cur.start + s.intervalMin * 60_000);
}

/** Reserves up to `want` sends within the batch window and the daily cap. */
async function claim(want: number, s: QueueSettings, now = Date.now()): Promise<{ granted: number; nextBatchAt: Date | null }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { raw, w } = await readWindow();
    const cur = current(w, s, now);
    const dayLeft = s.dailyCap > 0 ? s.dailyCap - cur.daySent : Infinity;
    const granted = Math.max(0, Math.min(want, s.batchSize - cur.sent, dayLeft));
    if (granted === 0) return { granted: 0, nextBatchAt: waitUntil(cur, s, now) };
    if (await writeWindow(raw, { ...cur, sent: cur.sent + granted, daySent: cur.daySent + granted })) return { granted, nextBatchAt: null };
  }
  return { granted: 0, nextBatchAt: null };
}

/** Gives back quota that was claimed but not used (queue ran dry, run cut short, paused). */
async function refund(n: number) {
  if (n <= 0) return;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { raw, w } = await readWindow();
    if (!raw) return;
    if (await writeWindow(raw, { ...w, sent: Math.max(0, w.sent - n), daySent: Math.max(0, w.daySent - n) })) return;
  }
}

/** Where the queue stands, for the admin page. */
export async function queueStatus() {
  const s = await getQueueSettings();
  const now = Date.now();
  const { w } = await readWindow();
  const cur = current(w, s, now);
  const sending = await prisma.emailBroadcast.findMany({ where: { status: { in: ["sending", "paused"] } }, select: { id: true, status: true } });
  const pending = sending.length
    ? await prisma.emailRecipient.count({ where: { broadcastId: { in: sending.filter((b) => b.status === "sending").map((b) => b.id) }, status: "pending" } })
    : 0;
  const full = cur.sent >= s.batchSize || (s.dailyCap > 0 && cur.daySent >= s.dailyCap);
  return {
    settings: s,
    sentThisBatch: cur.sent,
    sentToday: cur.daySent,
    pending,
    nextBatchAt: s.paused || !full ? null : waitUntil(cur, s, now),
    transport: usingBulkTransport() ? "bulk" : "main",
  };
}

/** When the next batch may start (null = now). */
export async function nextBatchAt(now = Date.now()): Promise<Date | null> {
  const s = await getQueueSettings();
  const { w } = await readWindow();
  const cur = current(w, s, now);
  const full = cur.sent >= s.batchSize || (s.dailyCap > 0 && cur.daySent >= s.dailyCap);
  return full ? waitUntil(cur, s, now) : null;
}

// ------------------------------------------------------------- broadcasts

/** Recomputes a broadcast's counts and status (a paused broadcast stays paused); logs once when it finishes. */
export async function refreshBroadcast(broadcastId: string) {
  const [sentCount, failedCount, pending, before] = await Promise.all([
    prisma.emailRecipient.count({ where: { broadcastId, status: "sent" } }),
    prisma.emailRecipient.count({ where: { broadcastId, status: "failed" } }),
    prisma.emailRecipient.count({ where: { broadcastId, status: { in: ["pending", "sending"] } } }),
    prisma.emailBroadcast.findUnique({ where: { id: broadcastId }, select: { status: true, subject: true, total: true, createdById: true, createdByName: true } }),
  ]);
  const status = pending > 0 ? (before?.status === "paused" ? "paused" : "sending") : failedCount > 0 ? "partial" : "completed";
  await prisma.emailBroadcast.update({ where: { id: broadcastId }, data: { sentCount, failedCount, status } });
  if (before && (before.status === "sending" || before.status === "paused") && status !== "sending" && status !== "paused") {
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

/** Tells admins (by push; e-mail may be the thing that's blocked) that sending stopped. */
async function alertAdmins(reason: string) {
  const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true } });
  if (!admins.length) return;
  await sendPushToAll(
    { title: "E-mail sending paused", body: `The mail provider refused messages: ${reason.slice(0, 120)}`, url: "/admin/notifications", tag: "email-queue-paused" },
    admins.map((a) => a.id),
  ).catch(() => {});
}

/**
 * Sends the next slice of queued broadcast e-mail if the settings allow.
 * `maxPerRun` keeps one call well inside the serverless time limit.
 */
export async function processEmailQueue(maxPerRun = 15): Promise<{ sent: number; failed: number; paused: string | null; nextBatchAt: Date | null; pending: number }> {
  const broadcasts = await prisma.emailBroadcast.findMany({
    where: { status: "sending" },
    orderBy: { createdAt: "asc" },
    select: { id: true, subject: true, message: true },
  });
  if (!broadcasts.length) return { sent: 0, failed: 0, paused: null, nextBatchAt: null, pending: 0 };
  const settings = await getQueueSettings();
  if (settings.paused) return { sent: 0, failed: 0, paused: settings.pausedReason ?? "Paused", nextBatchAt: null, pending: 0 };
  await requeueStuck();
  const pendingTotal = await prisma.emailRecipient.count({ where: { broadcastId: { in: broadcasts.map((b) => b.id) }, status: "pending" } });
  if (!pendingTotal) {
    // Close out broadcasts whose last recipients were handled elsewhere.
    for (const b of broadcasts) await refreshBroadcast(b.id);
    return { sent: 0, failed: 0, paused: null, nextBatchAt: null, pending: 0 };
  }

  const { granted, nextBatchAt: wait } = await claim(Math.min(maxPerRun, pendingTotal), settings);
  if (!granted) return { sent: 0, failed: 0, paused: null, nextBatchAt: wait, pending: pendingTotal };

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
      // An admin may pause mid-run; check before every message.
      if (used > 0 && (await getQueueSettings()).paused) break outer;
      const still = await prisma.emailBroadcast.findUnique({ where: { id: b.id }, select: { status: true } });
      if (still?.status !== "sending") continue outer;
      // Claim the row first so an overlapping run can't send it twice.
      const mine = await prisma.emailRecipient.updateMany({ where: { id: r.id, status: "pending" }, data: { status: "sending" } });
      if (mine.count !== 1) continue;
      used++;
      touched.add(b.id);
      const mail = broadcastEmail(b.subject, b.message, r.fullName || undefined);
      const result = await sendEmail({ to: r.email, subject: mail.subject, html: mail.html, bulk: true });
      if (result.ok) {
        sent++;
        streak = 0;
        await prisma.emailRecipient.update({ where: { id: r.id }, data: { status: "sent", error: null, attempts: { increment: 1 } } });
      } else if (isRateLimitError(result.error)) {
        // The provider is refusing: keep it queued and, if it repeats, stop everything.
        streak++;
        await prisma.emailRecipient.update({ where: { id: r.id }, data: { status: "pending", error: (result.error || "").slice(0, 300), attempts: { increment: 1 } } });
        if (streak >= BLOCK_STREAK_TO_PAUSE) {
          paused = result.error || "Sending limit reached";
          await setQueuePaused(true, `Mail provider refused messages: ${paused}`);
          logActivity({ type: "email_broadcast", severity: "error", metadata: { event: "auto_paused", reason: paused } });
          await alertAdmins(paused);
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

  await refund(granted - used);
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
