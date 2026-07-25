export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getOrCreateConversation } from "@/lib/messaging";
import { sendPushToAll } from "@/lib/push";
import { logActivity, getIp } from "@/lib/activity-log";

// POST /api/admin/users/message { userId, body } — admin DMs an individual user.
// Reuses the normal 1:1 conversation the user sees in /messages.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }
  const me = session.user.id;
  const { userId, body } = await request.json().catch(() => ({}));
  const text = typeof body === "string" ? body.trim() : "";
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ message: "userId is required" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ message: "Message is empty" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ message: "Message too long" }, { status: 400 });
  if (userId === me) return NextResponse.json({ message: "Pick a different user" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return NextResponse.json({ message: "User not found" }, { status: 404 });

  const conv = await getOrCreateConversation(me, userId, { isAdmin: true });
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({ data: { conversationId: conv.id, senderId: me, body: text } });
    await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
    return m;
  });

  sendPushToAll(
    { title: "Message from HustleClickGH", body: text.length > 120 ? text.slice(0, 117) + "…" : text, url: `/messages?c=${conv.id}`, tag: `dm-${conv.id}` },
    [userId]
  ).catch(() => {});

  logActivity({
    type: "admin_message",
    userId: me,
    userName: session.user.name ?? null,
    severity: "info",
    metadata: { targetUserId: userId, conversationId: conv.id },
    ip: getIp(request),
  });

  return NextResponse.json({
    ok: true,
    conversationId: conv.id,
    recipientId: userId,
    message: { id: message.id, senderId: me, body: text, createdAt: message.createdAt },
  });
}
