export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getOrCreateConversation, otherParticipant, isBlockedBetween } from "@/lib/messaging";

// GET /api/conversations — my threads, newest activity first.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;

  const convs = await prisma.conversation.findMany({
    where: { OR: [{ userAId: me }, { userBId: me }] },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!convs.length) return NextResponse.json({ conversations: [] });

  const otherIds = convs.map((c) => otherParticipant(c, me));
  const [users, unreadGroups] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, userId: true, fullName: true, image: true, verified: true },
    }),
    prisma.message.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: convs.map((c) => c.id) }, senderId: { not: me }, readAt: null },
      _count: { _all: true },
    }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const unreadByConv = new Map(unreadGroups.map((g) => [g.conversationId, g._count._all]));

  const conversations = convs.map((c) => {
    const other = userById.get(otherParticipant(c, me)) || null;
    const last = c.messages[0] || null;
    return {
      id: c.id,
      isAdmin: c.isAdmin,
      other,
      lastMessage: last ? { body: last.body, senderId: last.senderId, createdAt: last.createdAt } : null,
      lastMessageAt: c.lastMessageAt,
      unread: unreadByConv.get(c.id) || 0,
    };
  });

  return NextResponse.json({ conversations });
}

// POST /api/conversations { userId } — get or create a 1:1 thread with a user.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const me = session.user.id;
  const { userId } = await request.json().catch(() => ({}));
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ message: "userId is required" }, { status: 400 });
  }
  if (userId === me) {
    return NextResponse.json({ message: "You can't message yourself" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return NextResponse.json({ message: "User not found" }, { status: 404 });

  if (await isBlockedBetween(me, userId)) {
    return NextResponse.json({ message: "You can't message this user" }, { status: 403 });
  }

  const conv = await getOrCreateConversation(me, userId);
  return NextResponse.json({ conversationId: conv.id });
}
