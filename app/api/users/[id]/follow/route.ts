export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// POST /api/users/[id]/follow — follow a user.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { id } = await params;

  if (id === me) {
    return NextResponse.json({ message: "You can't follow yourself" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) return NextResponse.json({ message: "User not found" }, { status: 404 });

  // upsert-style: ignore if already following (unique constraint)
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId: me, followingId: id } },
    create: { followerId: me, followingId: id },
    update: {},
  });

  const followersCount = await prisma.follow.count({ where: { followingId: id } });
  return NextResponse.json({ ok: true, isFollowing: true, followersCount });
}

// DELETE /api/users/[id]/follow — unfollow.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { id } = await params;

  await prisma.follow.deleteMany({ where: { followerId: me, followingId: id } });
  const followersCount = await prisma.follow.count({ where: { followingId: id } });
  return NextResponse.json({ ok: true, isFollowing: false, followersCount });
}
