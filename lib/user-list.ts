import { prisma } from "@/lib/prisma";

/**
 * Hydrate a list of user ids into public user cards, annotated with whether the
 * viewer (`me`) already follows each one. Preserves the given id order.
 */
export async function listUsersWithFollowState(ids: string[], me: string) {
  if (!ids.length) return [];

  const [users, followed] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true, fullName: true, image: true, verified: true, city: true, country: true },
    }),
    prisma.follow.findMany({
      where: { followerId: me, followingId: { in: ids } },
      select: { followingId: true },
    }),
  ]);

  const followingSet = new Set(followed.map((f) => f.followingId));
  const byId = new Map(users.map((u) => [u.id, u]));

  return ids
    .map((id) => byId.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({ ...u, isFollowing: followingSet.has(u.id), isSelf: u.id === me }));
}
