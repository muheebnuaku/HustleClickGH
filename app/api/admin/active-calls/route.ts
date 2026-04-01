export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET: List truly active call sessions (status = active/calling/waiting, recent only)
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Only show calls created in the last 60 minutes to avoid stale calls
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Fetch active/calling/waiting/reconnecting calls created recently
    const activeCalls = await prisma.callSession.findMany({
      where: {
        status: { in: ["active", "calling", "waiting", "reconnecting"] },
        createdAt: { gte: oneHourAgo },
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
