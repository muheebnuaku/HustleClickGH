// Field-team hierarchy: Country Representative → Supervisors → Contributors.
//
// A leader position (User.leaderRole) sits on top of a normal account. Every
// person points at who they report to (User.teamLeaderId): a contributor at
// their supervisor (or straight at a representative), a supervisor at their
// representative.
//
// Projects with payoutMode "via_leader" don't credit the contributor's
// balance on approval. Instead a LeaderPayable records what the contributor's
// direct leader owes them (+ the leader's % fee). HustleClickGH sends a bulk
// LeaderPayout to a supervisor or representative; the leader then pays each
// contributor and marks it paid; the contributor can confirm or dispute.

import { prisma } from "@/lib/prisma";

export type LeaderRole = "representative" | "supervisor";
export const LEADER_ROLES: { value: LeaderRole; label: string }[] = [
  { value: "representative", label: "Country Representative" },
  { value: "supervisor", label: "Supervisor" },
];
export { leaderLabel } from "@/lib/leader-label";

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Fee owed to a leader on one approved item. */
export function leaderFee(amount: number, feePercent: number | null | undefined) {
  const pct = Math.max(0, Math.min(100, feePercent ?? 0));
  return { feePercent: pct, feeAmount: round2(amount * (pct / 100)) };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

/** A short, unique, human-friendly invite code, prefixed by the country (e.g. MW-7KQ2X). */
export async function generateTeamCode(country?: string | null): Promise<string> {
  const prefix = (country || "HC").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "HC";
  for (let i = 0; i < 20; i++) {
    let body = "";
    for (let k = 0; k < 5; k++) body += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    const code = `${prefix}-${body}`;
    if (!(await prisma.user.findUnique({ where: { teamCode: code }, select: { id: true } }))) return code;
  }
  throw new Error("Could not generate a team code");
}

/**
 * The leader ids whose money a leader is responsible for: a supervisor only
 * themself; a representative themself + every supervisor under them.
 */
export async function leaderScope(leaderId: string): Promise<string[]> {
  const me = await prisma.user.findUnique({ where: { id: leaderId }, select: { leaderRole: true } });
  if (me?.leaderRole !== "representative") return [leaderId];
  const subs = await prisma.user.findMany({ where: { teamLeaderId: leaderId, leaderRole: "supervisor" }, select: { id: true } });
  return [leaderId, ...subs.map((s) => s.id)];
}

export type MoneySummary = ReturnType<typeof summarize>;

/** Totals per status, kept separate per currency (never add MK to GH₵). */
export function summarizeByCurrency(rows: { amount: number; feeAmount: number; status: string; currency?: string | null }[]): Record<string, MoneySummary> {
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const c = r.currency || "GHS";
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(r);
  }
  return Object.fromEntries(Array.from(groups.entries()).map(([c, list]) => [c, summarize(list)]));
}

/** Totals per status for a set of payables (one currency). */
export function summarize(rows: { amount: number; feeAmount: number; status: string }[]) {
  const out = {
    owed: { amount: 0, fee: 0, count: 0 },
    sent: { amount: 0, fee: 0, count: 0 },
    paid: { amount: 0, fee: 0, count: 0 },
  };
  for (const r of rows) {
    const b = out[r.status as keyof typeof out];
    if (!b) continue;
    b.amount = round2(b.amount + r.amount);
    b.fee = round2(b.fee + r.feeAmount);
    b.count += 1;
  }
  return out;
}

/** [me, my leader, my leader's leader] — who I report to, up the chain. */
export async function teamChain(userId: string): Promise<string[]> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { teamLeaderId: true } });
  if (!me?.teamLeaderId) return [userId];
  const lead = await prisma.user.findUnique({ where: { id: me.teamLeaderId }, select: { teamLeaderId: true } });
  return [userId, me.teamLeaderId, ...(lead?.teamLeaderId ? [lead.teamLeaderId] : [])];
}

/**
 * Projects assigned to field teams are only open to those leaders and the
 * people under them. `chain` comes from teamChain(). Unassigned = open to all.
 */
export function canTakeAssigned(assignedLeaderIds: string[], chain: string[]): boolean {
  return !assignedLeaderIds.length || chain.some((id) => assignedLeaderIds.includes(id));
}

type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * If HustleClickGH paid this leader (or their representative) in advance, use
 * that credit for a newly approved item: the item counts as already sent, so
 * it's never paid twice. Project-specific advances are used first, oldest first.
 * Only whole items are covered. Returns the advance used, or null.
 */
export async function coverWithAdvance(tx: Tx, payableId: string, leaderIds: string[], projectId: string, cost: number, currency: string) {
  const advances = await tx.leaderPayout.findMany({
    where: { kind: "advance", currency, leaderId: { in: leaderIds }, creditRemaining: { gte: cost - 0.0001 }, OR: [{ projectId }, { projectId: null }] },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, projectId: true },
  });
  advances.sort((a, b) => Number(b.projectId === projectId) - Number(a.projectId === projectId));
  for (const a of advances) {
    // Conditional decrement — safe if two approvals race for the same credit.
    const used = await tx.leaderPayout.updateMany({
      where: { id: a.id, creditRemaining: { gte: cost - 0.0001 } },
      data: { creditRemaining: { decrement: cost } },
    });
    if (used.count) {
      // Covered by an advance. A leader's own item is simply theirs (paid); others go to "sent".
      const row = await tx.leaderPayable.findUnique({ where: { id: payableId }, select: { contributorId: true, leaderId: true } });
      const own = row && row.contributorId === row.leaderId;
      await tx.leaderPayable.update({ where: { id: payableId }, data: own ? { status: "paid", paidAt: new Date(), payoutId: a.id } : { status: "sent", payoutId: a.id } });
      return a.id;
    }
  }
  return null;
}
