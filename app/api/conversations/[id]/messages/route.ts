export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { isParticipant, otherParticipant, isBlockedBetween } from "@/lib/messaging";
import { isOnline } from "@/lib/presence";
import { sendPushToAll } from "@/lib/push";
import { sendEmail, adminMessageEmail } from "@/lib/email";

const PAGE = 40;

// GET /api/conversations/[id]/messages?before=<cursorId> — page of messages,
// oldest→newest within the page. Marks messages addressed to me as read.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { id } = await params;

  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv || !isParticipant(conv, me)) {
    return NextResponse.json({ message: "Conversation not found" }, { status: 404 });
  }

  const before = req.nextUrl.searchParams.get("before");
  const page = await prisma.message.findMany({
    where: { conversationId: id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: PAGE,
  });

  // Mark the incoming ones read (fire-and-forget is fine, but await keeps the
  // unread badge consistent on the next fetch).
  await prisma.message.updateMany({
    where: { conversationId: id, senderId: { not: me }, readAt: null },
    data: { readAt: new Date() },
  });

  const otherId = otherParticipant(conv, me);
  const otherRaw = await prisma.user.findUnique({
    where: { id: otherId },
    select: { id: true, userId: true, fullName: true, image: true, verified: true, lastSeenAt: true },
  });
  const other = otherRaw ? { ...otherRaw, online: isOnline(otherRaw.lastSeenAt) } : null;

  return NextResponse.json({
    messages: page.reverse().map((m) => ({
      id: m.id, senderId: m.senderId, body: m.body, createdAt: m.createdAt, readAt: m.readAt,
    })),
    hasMore: page.length === PAGE,
    other,
    isAdmin: conv.isAdmin,
  });
}

// POST /api/conversations/[id]/messages { body } — send a message.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { id } = await params;
  const { body } = await req.json().catch(() => ({}));
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return NextResponse.json({ message: "Message is empty" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ message: "Message too long" }, { status: 400 });

  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv || !isParticipant(conv, me)) {
    return NextResponse.json({ message: "Conversation not found" }, { status: 404 });
  }

  const recipientId = otherParticipant(conv, me);
  if (await isBlockedBetween(me, recipientId)) {
    return NextResponse.json({ message: "You can't message this user" }, { status: 403 });
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({ data: { conversationId: id, senderId: me, body: text } }),
    prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } }),
  ]);

  // Notify the recipient's devices (offline delivery). Fire-and-forget.
  const senderName = session.user.name || "Someone";
  const fromAdmin = session.user.role === "admin";
  sendPushToAll(
    {
      title: fromAdmin ? "Message from HustleClickGH" : senderName,
      body: text.length > 120 ? text.slice(0, 117) + "…" : text,
      url: `/messages?c=${id}`,
      tag: `dm-${id}`,
    },
    [recipientId]
  ).catch(() => {});

  // Only admin → user messages are emailed; user → user are not.
  if (fromAdmin) {
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { email: true, fullName: true, role: true },
    });
    if (recipient?.email && recipient.role === "user") {
      const mail = adminMessageEmail(recipient.fullName, text);
      sendEmail({ to: recipient.email, subject: mail.subject, html: mail.html }).catch(() => {});
    }
  }

  return NextResponse.json({
    message: { id: message.id, senderId: me, body: text, createdAt: message.createdAt, readAt: null },
    recipientId, // client broadcasts a realtime ping to user:<recipientId>
  });
}
