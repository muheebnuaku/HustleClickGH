import { prisma } from "@/lib/prisma";

/**
 * Direct-messaging helpers.
 *
 * Conversations are 1:1. The two participant ids are stored in canonical order
 * (userAId < userBId) so a conversation between two users is a single row
 * regardless of who started it.
 */

/** Sort a pair of user ids into canonical (min, max) order. */
export function orderPair(id1: string, id2: string): [string, string] {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

/** Fetch the existing 1:1 conversation for two users, or create it. */
export async function getOrCreateConversation(
  id1: string,
  id2: string,
  opts?: { isAdmin?: boolean }
) {
  const [userAId, userBId] = orderPair(id1, id2);
  const existing = await prisma.conversation.findUnique({
    where: { userAId_userBId: { userAId, userBId } },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: { userAId, userBId, isAdmin: opts?.isAdmin ?? false },
  });
}

/** The id of the other participant in a conversation. */
export function otherParticipant(conv: { userAId: string; userBId: string }, me: string): string {
  return conv.userAId === me ? conv.userBId : conv.userAId;
}

/** Whether `me` is one of the two participants. */
export function isParticipant(conv: { userAId: string; userBId: string }, me: string): boolean {
  return conv.userAId === me || conv.userBId === me;
}

/** Total unread messages addressed to `me` across all conversations. */
export async function unreadCountForUser(me: string): Promise<number> {
  return prisma.message.count({
    where: {
      readAt: null,
      senderId: { not: me },
      conversation: { OR: [{ userAId: me }, { userBId: me }] },
    },
  });
}

/** True if either user has blocked the other (messaging is disallowed). */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return Boolean(block);
}
