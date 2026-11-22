import { prisma } from "@/lib/prisma";
import { sendPushToAll } from "@/lib/push";
import { checkLocationEligibility, parseStringList } from "@/lib/project-config";
import { initializeTransaction, isPaystackConfigured, verifyTransaction } from "@/lib/paystack";
import { SITE_CONFIG } from "@/lib/constants";

/**
 * Premium plan. Basic is free; Premium is paid by Mobile Money (receipt +
 * admin approval) and lasts `durationDays`. Premium members get each new
 * project first: for `earlyAccessHours` after launch only they may take
 * part, and they are notified at launch; everyone else is notified when it
 * opens to all. The blue Verified tick stays separate: an admin grants it
 * after checking ID, so paying alone never buys the tick.
 */

export class PremiumInputError extends Error {}

export const SETTINGS_KEY = "premium_settings";

export interface PremiumSettings {
  enabled: boolean;
  priceGhs: number;
  durationDays: number;
  earlyAccessHours: number;
  momoNumber: string;
  momoName: string;
}

export const DEFAULT_SETTINGS: PremiumSettings = {
  enabled: true,
  priceGhs: 50,
  durationDays: 365,
  earlyAccessHours: 24,
  momoNumber: "",
  momoName: "",
};

function normalize(raw: Partial<PremiumSettings> | null | undefined): PremiumSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  const num = (v: unknown, min: number, max: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  };
  return {
    enabled: s.enabled !== false,
    priceGhs: Math.round(num(s.priceGhs, 1, 10000, 50) * 100) / 100,
    durationDays: Math.round(num(s.durationDays, 1, 3650, 365)),
    earlyAccessHours: Math.round(num(s.earlyAccessHours, 0, 168, 24)),
    momoNumber: String(s.momoNumber ?? "").trim().slice(0, 30),
    momoName: String(s.momoName ?? "").trim().slice(0, 80),
  };
}

export async function getPremiumSettings(): Promise<PremiumSettings> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    return normalize(row ? JSON.parse(row.value) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function savePremiumSettings(input: Partial<PremiumSettings>): Promise<PremiumSettings> {
  const s = normalize(input);
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: JSON.stringify(s) },
    update: { value: JSON.stringify(s) },
  });
  return s;
}

export function isPremium(user: { premiumUntil?: Date | null } | null | undefined, now = new Date()): boolean {
  return !!user?.premiumUntil && user.premiumUntil > now;
}

/** New expiry: renewing early adds the time on top of what is left. */
export function extendedUntil(current: Date | null | undefined, days: number, now = new Date()): Date {
  const base = current && current > now ? current : now;
  return new Date(base.getTime() + days * 86_400_000);
}

// ---------------------------------------------------------------- requests

const REF_RE = /^[A-Za-z0-9.\-_/]{4,40}$/;
const PHONE_RE = /^\+?[0-9 ]{9,16}$/;

export async function submitPremiumRequest(userId: string, b: { momoNumber?: unknown; reference?: unknown; receiptUrl?: unknown }) {
  const settings = await getPremiumSettings();
  if (!settings.enabled || !settings.momoNumber) throw new PremiumInputError("Premium upgrades are paused right now.");
  const momoNumber = String(b.momoNumber ?? "").trim();
  const reference = String(b.reference ?? "").trim();
  const receiptUrl = String(b.receiptUrl ?? "").trim();
  if (!PHONE_RE.test(momoNumber)) throw new PremiumInputError("Enter the Mobile Money number you paid from.");
  if (!REF_RE.test(reference)) throw new PremiumInputError("Enter the transaction ID from your MoMo message.");
  if (!/^https:\/\/\S+$/.test(receiptUrl)) throw new PremiumInputError("Upload a screenshot of the payment message.");

  const pending = await prisma.premiumRequest.findFirst({ where: { userId, status: "pending" }, select: { id: true } });
  if (pending) throw new PremiumInputError("You already have a payment waiting for review.");
  const reused = await prisma.premiumRequest.findFirst({
    where: { reference: { equals: reference, mode: "insensitive" }, status: { not: "rejected" } },
    select: { id: true },
  });
  if (reused) throw new PremiumInputError("That transaction ID has already been used.");

  return prisma.premiumRequest.create({
    data: { userId, amount: settings.priceGhs, momoNumber, reference, receiptUrl },
  });
}

/**
 * Approves or rejects a pending request. Only the first decision counts, so a
 * double click can't extend Premium twice. Returns null if it was not pending.
 */
export async function reviewPremiumRequest(id: string, adminId: string, approve: boolean, note?: string) {
  const settings = await getPremiumSettings();
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.premiumRequest.updateMany({
      where: { id, status: "pending" },
      data: { status: approve ? "approved" : "rejected", reviewedBy: adminId, reviewedAt: new Date(), adminNote: note?.trim().slice(0, 300) || null },
    });
    if (claimed.count !== 1) return null;
    const req = await tx.premiumRequest.findUniqueOrThrow({ where: { id } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: req.userId }, select: { id: true, fullName: true, email: true, premiumUntil: true } });
    let premiumUntil = user.premiumUntil;
    if (approve) {
      premiumUntil = extendedUntil(user.premiumUntil, settings.durationDays);
      await tx.user.update({ where: { id: user.id }, data: { premiumUntil } });
    }
    return { request: req, user: { ...user, premiumUntil } };
  });
}

// ---------------------------------------------------------------- Paystack

/**
 * Starts a Paystack checkout for the current price. The amount is fixed on our
 * side at this moment and checked again when the payment is confirmed.
 */
export async function startPaystackCheckout(user: { id: string; email: string }) {
  const settings = await getPremiumSettings();
  if (!settings.enabled) throw new PremiumInputError("Premium upgrades are paused right now.");
  if (!isPaystackConfigured()) throw new PremiumInputError("Online payment isn't available right now.");
  const reference = `PRM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  const req = await prisma.premiumRequest.create({
    data: { userId: user.id, amount: settings.priceGhs, method: "paystack", status: "initiated", momoNumber: "", receiptUrl: "", reference },
  });
  const tx = await initializeTransaction({
    email: user.email,
    amountMinor: Math.round(settings.priceGhs * 100),
    currency: "GHS",
    reference,
    callbackUrl: `${SITE_CONFIG.url}/premium?ref=${encodeURIComponent(reference)}`,
    metadata: { purpose: "premium", requestId: req.id, userId: user.id },
  });
  return { url: tx.authorization_url, reference };
}

/**
 * Confirms a Paystack payment by asking Paystack directly, then activates
 * Premium. Safe to call repeatedly (return page, webhook, retries): only the
 * first successful confirmation extends Premium. `forUserId` limits the
 * browser-side call to the payer's own reference.
 */
export async function confirmPaystackPayment(reference: string, forUserId?: string) {
  const req = await prisma.premiumRequest.findFirst({ where: { reference, method: "paystack" } });
  if (!req || (forUserId && req.userId !== forUserId)) return { state: "unknown" as const };
  if (req.status === "approved") return { state: "approved" as const, justApproved: false, request: req };

  const tx = await verifyTransaction(reference);
  const meta = typeof tx.metadata === "string" ? JSON.parse(tx.metadata || "{}") : tx.metadata ?? {};
  const paidEnough = tx.currency === "GHS" && tx.amount >= Math.round(req.amount * 100);
  if (tx.status !== "success") {
    if (tx.status === "failed" || tx.status === "abandoned") {
      await prisma.premiumRequest.updateMany({ where: { id: req.id, status: "initiated" }, data: { status: "rejected", adminNote: `Paystack: payment ${tx.status}`, reviewedAt: new Date(), reviewedBy: "paystack" } });
      return { state: "failed" as const };
    }
    return { state: "pending" as const };
  }
  if (!paidEnough || (meta as { requestId?: string }).requestId !== req.id) {
    // Paid, but not what we asked for: leave it for an admin to look at.
    await prisma.premiumRequest.updateMany({
      where: { id: req.id, status: "initiated" },
      data: { status: "pending", adminNote: `Paystack amount/currency mismatch: ${tx.amount / 100} ${tx.currency}` },
    });
    return { state: "review" as const };
  }

  const settings = await getPremiumSettings();
  const result = await prisma.$transaction(async (db) => {
    const claimed = await db.premiumRequest.updateMany({
      where: { id: req.id, status: { in: ["initiated", "pending"] } },
      data: { status: "approved", reviewedBy: "paystack", reviewedAt: new Date(), adminNote: tx.channel ? `Paid via Paystack (${tx.channel})` : "Paid via Paystack" },
    });
    if (claimed.count !== 1) return null;
    const user = await db.user.findUniqueOrThrow({ where: { id: req.userId }, select: { id: true, fullName: true, email: true, premiumUntil: true } });
    const premiumUntil = extendedUntil(user.premiumUntil, settings.durationDays);
    await db.user.update({ where: { id: user.id }, data: { premiumUntil } });
    return { ...user, premiumUntil };
  });
  if (!result) return { state: "approved" as const, justApproved: false, request: req };
  return { state: "approved" as const, justApproved: true, request: req, user: result };
}

/** E-mail + push to the member after an automatic (Paystack) upgrade. */
export async function notifyPremiumActivated(user: { id: string; fullName: string; email: string; premiumUntil: Date | null }) {
  const { premiumDecisionEmail, sendEmail } = await import("@/lib/email");
  const mail = premiumDecisionEmail(user.fullName, true, user.premiumUntil);
  await sendEmail({ to: user.email, subject: mail.subject, html: mail.html }).catch(() => {});
  await sendPushToAll({ title: "You're now Premium", body: "You'll get new projects first.", url: "/premium" }, [user.id]).catch(() => {});
}

// ---------------------------------------------------------- early access

interface ProjectLike {
  id: string;
  title: string;
  openToAllAt: Date | null;
  assignedLeaderIds: string | null;
  targetCountries: string | null;
  targetRegions: string | null;
  targetCities: string | null;
}

/** Field-team projects are assigned work, so the Premium window never applies to them. */
function hasEarlyWindow(p: Pick<ProjectLike, "openToAllAt" | "assignedLeaderIds">, now: Date) {
  return !!p.openToAllAt && p.openToAllAt > now && parseStringList(p.assignedLeaderIds).length === 0;
}

export function premiumLock(
  p: Pick<ProjectLike, "openToAllAt" | "assignedLeaderIds">,
  user: { premiumUntil?: Date | null } | null,
  isAdmin: boolean,
  now = new Date(),
): { locked: false } | { locked: true; opensAt: Date; reason: string } {
  if (isAdmin || !hasEarlyWindow(p, now) || isPremium(user, now)) return { locked: false };
  const hours = Math.max(1, Math.ceil((p.openToAllAt!.getTime() - now.getTime()) / 3_600_000));
  return {
    locked: true,
    opensAt: p.openToAllAt!,
    reason: `Premium early access: this project opens to everyone in about ${hours} hour${hours === 1 ? "" : "s"}. Go Premium to start now.`,
  };
}

/** Users with a push subscription who may take part in the project, split by plan. */
async function audience(p: ProjectLike, who: "premium" | "basic" | "all") {
  if (parseStringList(p.assignedLeaderIds).length) return [];
  const subs = await prisma.pushSubscription.findMany({ select: { userId: true }, distinct: ["userId"] });
  if (!subs.length) return [];
  const now = new Date();
  const users = await prisma.user.findMany({
    where: { id: { in: subs.map((s) => s.userId) }, status: "active", role: "user" },
    select: { id: true, country: true, region: true, city: true, premiumUntil: true },
  });
  return users
    .filter((u) => (who === "all" ? true : (who === "premium") === isPremium(u, now)))
    .filter((u) => checkLocationEligibility(p, u).eligible)
    .map((u) => u.id);
}

async function notify(p: ProjectLike, who: "premium" | "basic" | "all", hours: number) {
  const ids = await audience(p, who);
  if (!ids.length) return { sent: 0, failed: 0, removed: 0 };
  const payload =
    who === "premium"
      ? { title: `New project for Premium: ${p.title}`, body: `You get first access for ${hours} hour${hours === 1 ? "" : "s"}. Start now before it opens to everyone.` }
      : { title: `New project: ${p.title}`, body: "A new paid project is open. Take part now." };
  return sendPushToAll({ ...payload, url: `/data-projects/${p.id}`, tag: `project-${p.id}` }, ids);
}

const PROJECT_SELECT = {
  id: true, title: true, status: true, launchedAt: true, openToAllAt: true,
  assignedLeaderIds: true, targetCountries: true, targetRegions: true, targetCities: true,
} as const;

/**
 * Call whenever a project becomes active. The first time only, it starts the
 * Premium window and notifies Premium members (or everyone, if the window is 0).
 * Re-activating a paused project does nothing.
 */
export async function launchProject(projectId: string) {
  const settings = await getPremiumSettings();
  const now = new Date();
  const hours = settings.enabled ? settings.earlyAccessHours : 0;
  const started = await prisma.dataProject.updateMany({
    where: { id: projectId, status: "active", launchedAt: null },
    data: hours > 0
      ? { launchedAt: now, openToAllAt: new Date(now.getTime() + hours * 3_600_000) }
      : { launchedAt: now, openToAllAt: null, everyoneNotifiedAt: now },
  });
  if (started.count !== 1) return null;
  const p = await prisma.dataProject.findUniqueOrThrow({ where: { id: projectId }, select: PROJECT_SELECT });
  return notify(p, hours > 0 ? "premium" : "all", hours);
}

/**
 * Notifies Basic users about projects whose Premium window has ended. Safe to
 * call often (each project is claimed once); it runs on project-list requests
 * and from the daily cron, so the delay is short whenever people are online.
 */
export async function announceOpenedProjects() {
  const now = new Date();
  const due = await prisma.dataProject.findMany({
    where: { status: "active", launchedAt: { not: null }, everyoneNotifiedAt: null, openToAllAt: { lte: now } },
    select: PROJECT_SELECT,
    take: 10,
  });
  let announced = 0;
  for (const p of due) {
    const claimed = await prisma.dataProject.updateMany({ where: { id: p.id, everyoneNotifiedAt: null }, data: { everyoneNotifiedAt: now } });
    if (claimed.count !== 1) continue;
    await notify(p, "basic", 0).catch((e) => console.error("[premium] announce failed:", e));
    announced++;
  }
  return announced;
}

/** Ends a project's Premium window now; Basic users are notified on the next announce run. */
export async function openToEveryoneNow(projectId: string) {
  const r = await prisma.dataProject.updateMany({
    where: { id: projectId, openToAllAt: { gt: new Date() } },
    data: { openToAllAt: new Date() },
  });
  return r.count === 1;
}
