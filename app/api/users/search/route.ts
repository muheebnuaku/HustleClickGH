export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET /api/users/search?q=  — find people by name or user ID.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });

  // Users who have blocked me — hide them from my search results.
  const blockedByOthers = await prisma.block.findMany({
    where: { blockedId: me },
    select: { blockerId: true },
  });
  const hiddenIds = new Set(blockedByOthers.map((b) => b.blockerId));

  const found = await prisma.user.findMany({
    where: {
      status: "active",
      id: { not: me },
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { userId: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, userId: true, fullName: true, image: true, verified: true, city: true, country: true },
    take: 20,
    orderBy: { fullName: "asc" },
  });

  const visible = found.filter((u) => !hiddenIds.has(u.id));

  // Which of these am I already following?
  const followed = await prisma.follow.findMany({
    where: { followerId: me, followingId: { in: visible.map((u) => u.id) } },
    select: { followingId: true },
  });
  const followingSet = new Set(followed.map((f) => f.followingId));

  return NextResponse.json({
    users: visible.map((u) => ({ ...u, isFollowing: followingSet.has(u.id) })),
  });
}
