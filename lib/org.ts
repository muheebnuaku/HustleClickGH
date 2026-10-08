import { prisma } from "@/lib/prisma";

/** The organization a user owns (org logins are Users with role="organization"). */
export async function getOrgForUser(userId: string) {
  return prisma.organization.findUnique({ where: { ownerUserId: userId } });
}

/**
 * Admin decision on a client's crypto top-up claim (idempotent — only a pending
 * claim can be decided). Confirm credits the wallet with `amount` (the admin may
 * correct it to what actually arrived); reject records the reason.
 */
export async function decideTopup(txId: string, decision: "confirm" | "reject", opts: { amount?: number; reason?: string; adminId?: string } = {}): Promise<{ ok: boolean; message: string }> {
  const tx = await prisma.orgTransaction.findUnique({ where: { id: txId } });
  if (!tx || tx.type !== "fund") return { ok: false, message: "Top-up not found." };
  if (tx.status !== "pending") return { ok: false, message: "This top-up was already handled." };
  let meta: Record<string, unknown> = {};
  try { meta = tx.meta ? JSON.parse(tx.meta) : {}; } catch { /* keep empty */ }

  if (decision === "reject") {
    const reason = (opts.reason || "").trim().slice(0, 300);
    if (!reason) return { ok: false, message: "Give a reason so the client knows what to do." };
    const r = await prisma.orgTransaction.updateMany({
      where: { id: txId, status: "pending" },
      data: { status: "failed", meta: JSON.stringify({ ...meta, rejectReason: reason, decidedBy: opts.adminId, decidedAt: new Date().toISOString() }) },
    });
    return r.count ? { ok: true, message: "Top-up rejected." } : { ok: false, message: "This top-up was already handled." };
  }

  const amount = Math.round((opts.amount ?? tx.amount) * 100) / 100;
  if (!(amount > 0)) return { ok: false, message: "Enter the amount that arrived." };
  const [flip] = await prisma.$transaction([
    prisma.orgTransaction.updateMany({
      where: { id: txId, status: "pending" },
      data: { status: "success", amount, meta: JSON.stringify({ ...meta, claimedAmount: tx.amount, decidedBy: opts.adminId, decidedAt: new Date().toISOString() }) },
    }),
  ]);
  if (flip.count !== 1) return { ok: false, message: "This top-up was already handled." };
  await prisma.organization.update({ where: { id: tx.orgId }, data: { walletBalance: { increment: amount } } });
  return { ok: true, message: `Confirmed — $${amount.toFixed(2)} added to the wallet.` };
}

/**
 * Move funds from an org's wallet into a project's budget (escrow).
 * Guards against over-allocation. Returns false if the wallet is short.
 */
export async function allocateToProject(orgId: string, projectId: string, amountGhs: number): Promise<boolean> {
  if (amountGhs <= 0) return false;
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { walletBalance: true } });
  if (!org || org.walletBalance < amountGhs) return false;

  await prisma.$transaction([
    prisma.organization.update({ where: { id: orgId }, data: { walletBalance: { decrement: amountGhs } } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.dataProject.update as any)({ where: { id: projectId }, data: { budget: { increment: amountGhs } } }),
    prisma.orgTransaction.create({
      data: { orgId, type: "allocation", amount: amountGhs, status: "success", meta: JSON.stringify({ projectId }) },
    }),
  ]);
  return true;
}

/** Available escrow on a project (funded budget minus rewards already paid). */
export function escrowAvailable(project: { budget: number; spent: number }): number {
  return (project.budget ?? 0) - (project.spent ?? 0);
}

/** The buyer's cost per approved item — the org's price, or the reward for internal projects. */
export function buyerCost(project: { orgId: string | null; orgPrice?: number | null; reward: number }): number {
  return project.orgId ? (project.orgPrice ?? project.reward) : project.reward;
}

/**
 * Whether a project can approve one more item. Admin/internal projects (no orgId)
 * are unlimited. Org-funded projects must have escrow covering the BUYER price
 * (orgPrice) — the platform's margin (orgPrice − reward) is kept from that.
 */
export function canReward(project: { orgId: string | null; orgPrice?: number | null; budget: number; spent: number; reward: number }): boolean {
  if (!project.orgId) return true;
  return escrowAvailable(project) >= buyerCost(project);
}
