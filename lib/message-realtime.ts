import { getSupabaseBrowser } from "@/lib/supabase-browser";

/**
 * Lightweight message push over Supabase Realtime broadcast.
 *
 * Each logged-in user subscribes to their own channel `user:<id>` to RECEIVE
 * new-message pings. To NOTIFY someone, the sender opens that person's channel,
 * fires one broadcast, and leaves. Only broadcast is used (Supabase Presence
 * does not cross-sync on this project — see the call-signaling work).
 *
 * The ping carries only display hints (sender name, a short preview). The real
 * message + unread count are always re-fetched from the authenticated API, so a
 * spoofed ping can at worst show a stray toast, never leak content.
 */

export interface NewMessagePing {
  conversationId: string;
  senderId: string;
  senderName?: string;
  preview?: string;
}

export function userChannelName(userId: string): string {
  return `user:${userId}`;
}

/** Fire a one-shot "new-message" ping to a recipient's personal channel. */
export function pingNewMessage(recipientId: string, payload: NewMessagePing): void {
  const client = getSupabaseBrowser();
  if (!client) return; // Realtime not configured — recipient relies on poll + web-push
  const channel = client.channel(userChannelName(recipientId), {
    config: { broadcast: { self: false, ack: false } },
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      channel.send({ type: "broadcast", event: "new-message", payload });
      // Leave shortly after so we don't linger on someone else's channel.
      setTimeout(() => {
        channel.unsubscribe().catch(() => {});
        client.removeChannel(channel);
      }, 600);
    }
  });
}
