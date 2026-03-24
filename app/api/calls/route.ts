export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

// POST: Initiator creates a call session (dialer mode - calls someone by their code)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, offer, targetUserCode, callType } = body;

    if (!offer) {
      return NextResponse.json({ message: "offer is required" }, { status: 400 });
    }

    if (!targetUserCode) {
      return NextResponse.json({ message: "targetUserCode is required - enter the code of the person you want to call" }, { status: 400 });
    }

    // Verify the target user exists
    const targetUser = await prisma.user.findUnique({
      where: { personalCallCode: targetUserCode.toUpperCase() },
      select: { id: true, fullName: true, personalCallCode: true },
    });

    if (!targetUser) {
      return NextResponse.json({ message: "No user found with that call code" }, { status: 404 });
    }

    // Can't call yourself
    if (targetUser.id === session.user.id) {
      return NextResponse.json({ message: "You cannot call yourself" }, { status: 400 });
    }

    // Generate a unique call code for this session
    const callCode = nanoid(8).toUpperCase();

    // Clean up any previous calling/waiting sessions from this user
    await prisma.callSession.deleteMany({
      where: {
        initiatorId: session.user.id,
        status: { in: ["calling", "waiting"] },
      },
    });

    // Also clean up any stale incoming calls to the target (older than 60 seconds)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    await prisma.callSession.deleteMany({
      where: {
        targetUserCode: targetUserCode.toUpperCase(),
        status: "calling",
        createdAt: { lt: oneMinuteAgo },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callSession = await (prisma.callSession.create as any)({
      data: {
        callCode,
        projectId: projectId || null,
        initiatorId: session.user.id,
        targetUserCode: targetUserCode.toUpperCase(),
        offer: JSON.stringify(offer),
        status: "calling",
        callType: callType === "video" ? "video" : "audio",
      },
    });

    return NextResponse.json({ 
      callCode: callSession.callCode,
      targetUserName: targetUser.fullName,
    });
  } catch (error) {
    console.error("Create call error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}

// GET: Check for incoming calls for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Get current user's personal call code
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { personalCallCode: true },
    });

    if (!user?.personalCallCode) {
      return NextResponse.json({ incomingCall: null });
    }

    // Find any incoming call for this user
    const incomingCall = await prisma.callSession.findFirst({
      where: {
        targetUserCode: user.personalCallCode,
        status: "calling",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!incomingCall) {
      return NextResponse.json({ incomingCall: null });
    }

    // Get caller info
    const caller = await prisma.user.findUnique({
      where: { id: incomingCall.initiatorId },
      select: { fullName: true, image: true },
    });

    // Get project info if applicable
    let projectTitle = null;
    if (incomingCall.projectId) {
      const project = await prisma.dataProject.findUnique({
        where: { id: incomingCall.projectId },
        select: { title: true },
      });
      projectTitle = project?.title;
    }

    return NextResponse.json({
      incomingCall: {
        callCode: incomingCall.callCode,
        callerName: caller?.fullName || "Unknown",
        callerImage: caller?.image,
        projectId: incomingCall.projectId,
        projectTitle,
        callType: (incomingCall as Record<string, unknown>).callType as string ?? "audio",
        createdAt: incomingCall.createdAt,
      },
    });
  } catch (error) {
    console.error("Check incoming calls error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
