export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

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

    return NextResponse.json({
      callCode: callSession.callCode,
      projectId: callSession.projectId,
      initiatorId: callSession.initiatorId,
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

// PATCH: Update session — answer, ICE candidates, status, receiverId
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

    if (type === "answer") {
      // Receiver joins: sets answer + receiverId
      await prisma.callSession.update({
        where: { callCode: code },
        data: {
          answer: JSON.stringify(body.answer),
          receiverId: session.user.id,
          status: "active",
        },
      });
    } else if (type === "ice-initiator") {
      // Initiator appends an ICE candidate
      const existing: object[] = JSON.parse(callSession.initiatorIce);
      existing.push(body.candidate);
      await prisma.callSession.update({
        where: { callCode: code },
        data: { initiatorIce: JSON.stringify(existing) },
      });
    } else if (type === "ice-receiver") {
      // Receiver appends an ICE candidate
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
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update call error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
