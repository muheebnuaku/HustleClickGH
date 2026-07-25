import { prisma } from "@/lib/prisma";

export interface Quality {
  approved: number;
  rejected: number;
  reviewed: number;      // approved + rejected
  score: number;         // approved / reviewed (0..1); 1 when nothing reviewed yet
  tier: "new" | "trusted" | "watch";
}

/**
 * Contributor reputation from their data-submission history. A reviewer signal:
 * a low approval rate over several reviews flags someone worth scrutinising.
 */
export async function getContributorQuality(userIds: string[]): Promise<Map<string, Quality>> {
  const out = new Map<string, Quality>();
  if (!userIds.length) return out;

  const grouped = await prisma.dataSubmission.groupBy({
    by: ["userId", "status"],
    where: { userId: { in: userIds }, status: { in: ["approved", "rejected"] } },
    _count: { _all: true },
  });

  const acc = new Map<string, { approved: number; rejected: number }>();
  for (const g of grouped) {
    const a = acc.get(g.userId) || { approved: 0, rejected: 0 };
    if (g.status === "approved") a.approved = g._count._all;
    else a.rejected = g._count._all;
    acc.set(g.userId, a);
  }

  for (const id of userIds) {
    const { approved, rejected } = acc.get(id) || { approved: 0, rejected: 0 };
    const reviewed = approved + rejected;
    const score = reviewed === 0 ? 1 : approved / reviewed;
    const tier: Quality["tier"] =
      reviewed < 3 ? "new" : score >= 0.7 ? "trusted" : "watch";
    out.set(id, { approved, rejected, reviewed, score, tier });
  }
  return out;
}
