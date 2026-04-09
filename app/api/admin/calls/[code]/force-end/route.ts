export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";

// POST: Admin force ends a call
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { code } = await params;

    const callSession = await prisma.callSession.findUnique({
      where: { callCode: code },
      select: {
        status: true,
        callCode: true,
        initiatorId: true,
        receiverId: true,
      },
    });

    if (!callSession) {
      return NextResponse.json({ message: "Call not found" }, { status: 404 });
    }

    // Only allow force end on active, reconnecting, or calling calls
    if (!["active", "reconnecting", "calling_receiver_pending"].includes(callSession.status)) {
      return NextResponse.json(
        { message: "Cannot force end — call is not active" },
        { status: 400 }
      );
    }

    // Force end the call
    await prisma.callSession.update({
      where: { callCode: code },
      data: {
        status: "completed",
      },
    });

    // Log activity for both participants
    const ids = Array.from(
      new Set(
        [callSession.initiatorId, callSession.receiverId].filter(
          Boolean
        ) as string[]
      )
    );
    if (ids.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, fullName: true },
      });
      const namesById = new Map(users.map((u) => [u.id, u.fullName]));

      await Promise.all(
        ids.map((id) =>
          logActivity({
            type: "call_end",
            userId: id,
            userName: namesById.get(id) ?? null,
            severity: "warning",
            metadata: {
              callCode: code,
              reason: "admin_force_end",
              forUserId: id,
            },
            ip: getIp(req),
          })
        )
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Call force ended — clients will detect and end",
    });
  } catch (error) {
    console.error("Admin force end call error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
