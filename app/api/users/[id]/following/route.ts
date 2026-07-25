export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { listUsersWithFollowState } from "@/lib/user-list";

// GET /api/users/[id]/following — users [id] follows.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const rows = await prisma.follow.findMany({
    where: { followerId: id },
    select: { followingId: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const users = await listUsersWithFollowState(rows.map((r) => r.followingId), session.user.id);
  return NextResponse.json({ users });
}
