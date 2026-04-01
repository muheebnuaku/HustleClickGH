export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET: List only truly active call sessions (recent calls not yet terminated)
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Only show calls created in the last 30 minutes (stale calls are definitely not active)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Get CallSession records created recently
    const recentCallSessions = await prisma.callSession.findMany({
      where: {
        createdAt: { gte: thirtyMinutesAgo },
      },
      select: {
        id: true,
        callCode: true,
        initiatorId: true,
        receiverId: true,
        projectId: true,
        status: true,
        callType: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentCallSessions.length === 0) {
      return NextResponse.json({ calls: [], total: 0 });
    }

    // Get all terminal events for these calls
    const callCodes = recentCallSessions.map(c => c.callCode);
    const terminalEvents = await prisma.activityLog.findMany({
      where: {
        type: { in: ["call_end", "call_timeout", "call_error", "call_cancel", "call_decline", "page_close_during_call"] },
      },
      select: { metadata: true },
    });

    // Extract callCodes that have terminal events
    const callCodesTerminated = new Set<string>();
    terminalEvents.forEach(event => {
      if (event.metadata) {
        try {
          const meta = JSON.parse(event.metadata);
          if (meta.callCode && callCodes.includes(meta.callCode)) {
            callCodesTerminated.add(meta.callCode);
          }
        } catch { }
      }
    });

    // Truly active calls = recent AND NOT terminated
    const activeCalls = recentCallSessions.filter(
      call => !callCodesTerminated.has(call.callCode)
    );

    if (activeCalls.length === 0) {
      return NextResponse.json({ calls: [], total: 0 });
    }

    // Enrich with user details
    const enriched = await Promise.all(
      activeCalls.map(async (call) => {
        const [initiator, receiver] = await Promise.all([
          prisma.user.findUnique({
            where: { id: call.initiatorId },
            select: { fullName: true, userId: true, email: true },
          }),
          call.receiverId
            ? prisma.user.findUnique({
                where: { id: call.receiverId },
                select: { fullName: true, userId: true, email: true },
              })
            : null,
        ]);

        const duration = Math.floor(
          (Date.now() - new Date(call.createdAt).getTime()) / 1000
        );

        return {
          ...call,
          initiatorName: initiator?.fullName || "Unknown",
          initiatorUserId: initiator?.userId || "",
          initiatorEmail: initiator?.email || "",
          receiverName: receiver?.fullName || null,
          receiverUserId: receiver?.userId || null,
          receiverEmail: receiver?.email || null,
          duration,
        };
      })
    );

    return NextResponse.json({
      calls: enriched,
      total: enriched.length,
    });
  } catch (error) {
    console.error("Admin list active calls error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
