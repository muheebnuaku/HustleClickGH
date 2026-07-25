export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// POST /api/presence/heartbeat — mark the current user as recently active.
// Called on an interval by the client while the app is open + visible.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
