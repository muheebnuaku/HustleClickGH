export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Terminal call events that mean the call is NOT active
const TERMINAL_EVENTS = new Set(["call_end", "call_timeout", "call_error", "call_cancel", "call_decline", "page_close_during_call"]);

// GET: List only truly active call sessions (verified via activity log)
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Get all CallSession records with status="active"
    const callSessions = await prisma.callSession.findMany({
      where: { status: "active" },
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
      orderBy: { updatedAt: "desc" },
    });

    if (callSessions.length === 0) {
      return NextResponse.json({ calls: [], total: 0 });
    }

    // Get all terminal events from activity log to filter out ended calls
    const terminatedCallCodes = (await prisma.activityLog.findMany({
      where: {
        type: { in: Array.from(TERMINAL_EVENTS) },
      },
      select: { metadata: true },
      distinct: ["metadata"],
    }))
      .filter(log => log.metadata)
      .map(log => {
        try {
          const meta = JSON.parse(log.metadata as string);
          return meta.callCode;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    const terminatedSet = new Set(terminatedCallCodes);

    // Filter out calls that have terminal events
    const trulyActiveCalls = callSessions.filter(call => !terminatedSet.has(call.callCode));

    if (trulyActiveCalls.length === 0) {
      return NextResponse.json({ calls: [], total: 0 });
    }

    // Enrich with user details
    const enriched = await Promise.all(
      trulyActiveCalls.map(async (call) => {
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
