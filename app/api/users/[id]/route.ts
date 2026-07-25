export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { isOnline } from "@/lib/presence";

// GET /api/users/[id] — public profile of a user, from the viewer's perspective.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, userId: true, fullName: true, image: true, verified: true,
      city: true, country: true, createdAt: true, lastSeenAt: true, personalCallCode: true,
    },
  });
  if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

  const [followersCount, followingCount, iFollow, iBlocked, blockedMe] = await Promise.all([
    prisma.follow.count({ where: { followingId: id } }),
    prisma.follow.count({ where: { followerId: id } }),
    me === id ? Promise.resolve(null) : prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: me, followingId: id } }, select: { id: true },
    }),
    prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: me, blockedId: id } }, select: { id: true },
    }),
    prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: id, blockedId: me } }, select: { id: true },
    }),
  ]);

  const { lastSeenAt, ...publicUser } = user;
  return NextResponse.json({
    user: {
      ...publicUser,
      online: isOnline(lastSeenAt),
      followersCount,
      followingCount,
      isFollowing: Boolean(iFollow),
      isBlocked: Boolean(iBlocked),       // I blocked them
      hasBlockedMe: Boolean(blockedMe),   // they blocked me
      isSelf: me === id,
    },
  });
}
