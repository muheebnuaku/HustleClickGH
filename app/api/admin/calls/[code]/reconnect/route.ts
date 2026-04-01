export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// POST: Admin forces a reconnect on an active call
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
      select: { status: true, callCode: true, initiatorId: true, receiverId: true },
    });

    if (!callSession) {
      return NextResponse.json({ message: "Call not found" }, { status: 404 });
    }

    // Only allow reconnect on active or already reconnecting calls
    if (!["active", "reconnecting"].includes(callSession.status)) {
      return NextResponse.json(
        { message: "Cannot reconnect — call is not active" },
        { status: 400 }
      );
    }

    // Trigger reconnect by setting status to "reconnecting"
    // Both client sides will poll and detect this, triggering beginReconnectFlow
    await prisma.callSession.update({
      where: { callCode: code },
      data: {
        status: "reconnecting",
        // Clear answer to force re-negotiation
        answer: null,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Reconnect triggered — clients will detect and reconnect",
    });
  } catch (error) {
    console.error("Admin reconnect call error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
