export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// POST /api/users/[id]/block — block a user (they can no longer DM me).
// Blocking also removes any follow relationship in either direction.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { id } = await params;
  if (id === me) return NextResponse.json({ message: "You can't block yourself" }, { status: 400 });

  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: me, blockedId: id } },
      create: { blockerId: me, blockedId: id },
      update: {},
    }),
    prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: me, followingId: id },
          { followerId: id, followingId: me },
        ],
      },
    }),
  ]);

  return NextResponse.json({ ok: true, isBlocked: true });
}

// DELETE /api/users/[id]/block — unblock.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { id } = await params;
  await prisma.block.deleteMany({ where: { blockerId: me, blockedId: id } });
  return NextResponse.json({ ok: true, isBlocked: false });
}
