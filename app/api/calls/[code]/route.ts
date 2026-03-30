export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";

const VALID_STATUSES = new Set(["completed", "missed", "declined", "reconnecting"]);

// GET: Poll for session state (both sides use this)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { code } = await params;
    const lite = new URL(req.url).searchParams.get("lite") === "1";

    const callSession = await prisma.callSession.findUnique({
      where: { callCode: code },
      select: {
        callCode:     true,
        projectId:    true,
        initiatorId:  true,
        receiverId:   true,
        offer:        !lite,
        answer:       true,
        initiatorIce: true,
        receiverIce:  true,
        status:       true,
        updatedAt:    true,
      },
    });

    if (!callSession) {
      return NextResponse.json({ message: "Call session not found" }, { status: 404 });
    }

    let initiatorName = "Unknown";
    let initiatorUserId = "";
    if (!lite) {
      const initiator = await prisma.user.findUnique({
        where: { id: callSession.initiatorId },
        select: { fullName: true, userId: true },
      });
      initiatorName   = initiator?.fullName  || "Unknown";
      initiatorUserId = initiator?.userId    || "";
    }

    return NextResponse.json({
      callCode:       callSession.callCode,
      projectId:      callSession.projectId,
      initiatorId:    callSession.initiatorId,
      initiatorName,
      initiatorUserId,
      receiverId:     callSession.receiverId,
      offer:          !lite && callSession.offer  ? JSON.parse(callSession.offer as string)  : null,
      answer:         callSession.answer ? JSON.parse(callSession.answer) : null,
      initiatorIce:   JSON.parse(callSession.initiatorIce),
      receiverIce:    JSON.parse(callSession.receiverIce),
      status:         callSession.status,
      updatedAt:      callSession.updatedAt,
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

    // ICE candidates: atomic raw SQL append — eliminates read-modify-write race condition
    if (type === "ice-initiator" || type === "ice-receiver") {
      const batch = Array.isArray(body.candidates) ? body.candidates
        : body.candidate ? [body.candidate] : [];
      if (batch.length === 0) return NextResponse.json({ ok: true });
      const json = JSON.stringify(batch);
      if (type === "ice-initiator") {
        await prisma.$executeRaw`
          UPDATE "CallSession"
          SET "initiatorIce" = ("initiatorIce"::jsonb || ${json}::jsonb)::text
          WHERE "callCode" = ${code}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE "CallSession"
          SET "receiverIce" = ("receiverIce"::jsonb || ${json}::jsonb)::text
          WHERE "callCode" = ${code}
        `;
      }
      return NextResponse.json({ ok: true });
    }

    const callSession = await prisma.callSession.findUnique({
      where: { callCode: code },
      select: {
        initiatorId:    true,
        receiverId:     true,
        targetUserCode: true,
        offer:          true,
        projectId:      true,
        status:         true,
      },
    });

    if (!callSession) {
      return NextResponse.json({ message: "Call session not found" }, { status: 404 });
    }

    if (type === "accept") {
      await prisma.callSession.update({
        where: { callCode: code },
        data: { receiverId: session.user.id, status: "waiting" },
      });
      return NextResponse.json({
        ok: true,
        offer:     callSession.offer ? JSON.parse(callSession.offer) : null,
        projectId: callSession.projectId,
      });

    } else if (type === "decline") {
      await prisma.callSession.update({ where: { callCode: code }, data: { status: "declined" } });
      await logActivity({
        type: "call_decline", userId: session.user.id, userName: session.user.name ?? null,
        severity: "warning", metadata: { callCode: code, initiatorId: callSession.initiatorId },
        ip: getIp(request),
      });

    } else if (type === "cancel") {
      if (callSession.initiatorId !== session.user.id) {
        return NextResponse.json({ message: "Only the caller can cancel" }, { status: 403 });
      }
      await prisma.callSession.update({ where: { callCode: code }, data: { status: "missed" } });
      await logActivity({
        type: "call_cancel", userId: session.user.id, userName: session.user.name ?? null,
        severity: "warning", metadata: { callCode: code, targetUserCode: callSession.targetUserCode },
        ip: getIp(request),
      });

    } else if (type === "answer") {
      await prisma.callSession.update({
        where: { callCode: code },
        data: { answer: JSON.stringify(body.answer), receiverId: session.user.id, status: "active" },
      });
      await logActivity({
        type: "call_connecting", userId: session.user.id, userName: session.user.name ?? null,
        severity: "info", metadata: { callCode: code, initiatorId: callSession.initiatorId, role: "receiver" },
        ip: getIp(request),
      });

    } else if (type === "restart-offer") {
      await prisma.callSession.update({
        where: { callCode: code },
        data: { offer: JSON.stringify(body.offer), answer: null, initiatorIce: "[]", receiverIce: "[]", status: "reconnecting" },
      });

    } else if (type === "status") {
      const newStatus = body.status as string;
      if (!VALID_STATUSES.has(newStatus)) {
        return NextResponse.json({ message: "Invalid status" }, { status: 400 });
      }
      await prisma.callSession.update({ where: { callCode: code }, data: { status: newStatus } });
      if (newStatus === "completed") {
        await logActivity({
          type: "call_end", userId: session.user.id, userName: session.user.name ?? null,
          severity: "success",
          metadata: { callCode: code, initiatorId: callSession.initiatorId, receiverId: callSession.receiverId, reason: body.reason ?? "user_hangup" },
          ip: getIp(request),
        });
        // Fire-and-forget: prune old terminal sessions to keep the table lean
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        prisma.callSession.deleteMany({
          where: { status: { in: ["completed", "missed", "declined"] }, updatedAt: { lt: fiveMinAgo } },
        }).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update call error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
