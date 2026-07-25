import { prisma } from "@/lib/prisma";

/** The organization a user owns (org logins are Users with role="organization"). */
export async function getOrgForUser(userId: string) {
  return prisma.organization.findUnique({ where: { ownerUserId: userId } });
}

/**
 * Credit an org wallet for a confirmed Paystack payment — idempotent.
 * Reads the pending OrgTransaction created at fund-init (source of truth for
 * orgId + amount). The pending→success flip is atomic, so the wallet is credited
 * exactly once even if the webhook and the return-verify both fire.
 * Caller must have already confirmed success with Paystack.
 */
export async function creditFundByRef(reference: string): Promise<{ credited: boolean }> {
  const tx = await prisma.orgTransaction.findUnique({ where: { providerRef: reference } });
  if (!tx || tx.status === "success") return { credited: false };

  const flip = await prisma.orgTransaction.updateMany({
    where: { providerRef: reference, status: "pending" },
    data: { status: "success" },
  });
  if (flip.count !== 1) return { credited: false }; // raced — already credited

  await prisma.organization.update({
    where: { id: tx.orgId },
    data: { walletBalance: { increment: tx.amount } },
  });
  return { credited: true };
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

/**
 * Whether a project can pay one more reward. Admin/internal projects (no orgId)
 * are unlimited (they behave exactly as before). Org-funded projects must have
 * escrow remaining.
 */
export function canReward(project: { orgId: string | null; budget: number; spent: number; reward: number }): boolean {
  if (!project.orgId) return true;
  return escrowAvailable(project) >= project.reward;
}
