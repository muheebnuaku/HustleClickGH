export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";

// GET: Poll for session state (both sides use this)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { code } = await params;

    const callSession = await prisma.callSession.findUnique({
      where: { callCode: code },
    });

    if (!callSession) {
      return NextResponse.json({ message: "Call session not found" }, { status: 404 });
    }

    const initiator = await prisma.user.findUnique({
      where: { id: callSession.initiatorId },
      select: { fullName: true },
    });

    return NextResponse.json({
      callCode: callSession.callCode,
      projectId: callSession.projectId,
      initiatorId: callSession.initiatorId,
      initiatorName: initiator?.fullName || "Unknown",
      receiverId: callSession.receiverId,
      offer: callSession.offer ? JSON.parse(callSession.offer) : null,
      answer: callSession.answer ? JSON.parse(callSession.answer) : null,
      initiatorIce: JSON.parse(callSession.initiatorIce),
      receiverIce: JSON.parse(callSession.receiverIce),
      status: callSession.status,
      updatedAt: callSession.updatedAt,
    });
  } catch (error) {
    console.error("Poll call error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}

// PATCH: Update session — answer, ICE candidates, status, receiverId, accept/decline
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { code } = await params;
    const body = await request.json();
    const { type } = body;

    const callSession = await prisma.callSession.findUnique({
      where: { callCode: code },
    });

    if (!callSession) {
      return NextResponse.json({ message: "Call session not found" }, { status: 404 });
    }

    if (type === "accept") {
      // Receiver accepts the incoming call - they need to provide their answer SDP
      await prisma.callSession.update({
        where: { callCode: code },
        data: {
          receiverId: session.user.id,
          status: "waiting", // waiting for WebRTC answer
        },
      });

      // Return the offer so receiver can create their answer
      return NextResponse.json({
        ok: true,
        offer: callSession.offer ? JSON.parse(callSession.offer) : null,
        projectId: callSession.projectId,
      });
    } else if (type === "decline") {
      await prisma.callSession.update({
        where: { callCode: code },
        data: { status: "declined" },
      });
      await logActivity({
        type: "call_decline",
        userId: session.user.id,
        userName: session.user.name ?? null,
        severity: "warning",
        metadata: { callCode: code, initiatorId: callSession.initiatorId },
        ip: getIp(request),
      });
    } else if (type === "cancel") {
      if (callSession.initiatorId !== session.user.id) {
        return NextResponse.json({ message: "Only the caller can cancel" }, { status: 403 });
      }
      await prisma.callSession.update({
        where: { callCode: code },
        data: { status: "missed" },
      });
      await logActivity({
        type: "call_cancel",
        userId: session.user.id,
        userName: session.user.name ?? null,
        severity: "warning",
        metadata: { callCode: code, targetUserCode: callSession.targetUserCode },
        ip: getIp(request),
      });
    } else if (type === "answer") {
      await prisma.callSession.update({
        where: { callCode: code },
        data: {
          answer: JSON.stringify(body.answer),
          receiverId: session.user.id,
          status: "active",
        },
      });
      await logActivity({
        type: "call_connecting",
        userId: session.user.id,
        userName: session.user.name ?? null,
        severity: "info",
        metadata: { callCode: code, initiatorId: callSession.initiatorId, role: "receiver" },
        ip: getIp(request),
      });
    } else if (type === "ice-initiator") {
      const existing: object[] = JSON.parse(callSession.initiatorIce);
      existing.push(body.candidate);
      await prisma.callSession.update({
        where: { callCode: code },
        data: { initiatorIce: JSON.stringify(existing) },
      });
    } else if (type === "ice-receiver") {
      const existing: object[] = JSON.parse(callSession.receiverIce);
      existing.push(body.candidate);
      await prisma.callSession.update({
        where: { callCode: code },
        data: { receiverIce: JSON.stringify(existing) },
      });
    } else if (type === "status") {
      await prisma.callSession.update({
        where: { callCode: code },
        data: { status: body.status },
      });
      if (body.status === "completed") {
        await logActivity({
          type: "call_end",
          userId: session.user.id,
          userName: session.user.name ?? null,
          severity: "success",
          metadata: {
            callCode: code,
            initiatorId: callSession.initiatorId,
            receiverId: callSession.receiverId,
            reason: body.reason ?? "user_hangup",
          },
          ip: getIp(request),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update call error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
