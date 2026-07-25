"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { userChannelName, type NewMessagePing } from "@/lib/message-realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface MessagesContextType {
  unreadCount: number;
  refreshUnread: () => void;
  /** The thread the user is currently viewing (suppresses self-toasts + marks read). */
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  /** Last incoming ping, for the thread + banner to react to. */
  lastPing: (NewMessagePing & { at: number }) | null;
}

const MessagesContext = createContext<MessagesContextType | undefined>(undefined);

const POLL_MS = 20000; // badge refresh when Realtime is unavailable / as a backstop

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const myId = session?.user?.id;

  const [unreadCount, setUnreadCount] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [lastPing, setLastPing] = useState<(NewMessagePing & { at: number }) | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refreshUnread = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/messages/unread-count");
      if (res.ok) setUnreadCount((await res.json()).count ?? 0);
    } catch { /* ignore */ }
  }, [status]);

  // Initial + focus + interval refresh (works with or without Realtime).
  useEffect(() => {
    // Reset the badge on logout — an intentional external(auth)→state sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status !== "authenticated") { setUnreadCount(0); return; }
    refreshUnread();
    const onFocus = () => refreshUnread();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(refreshUnread, POLL_MS);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(iv); };
  }, [status, refreshUnread]);

  // Heartbeat so others can see me as "online" (every 45s while the tab is visible).
  useEffect(() => {
    if (status !== "authenticated") return;
    const beat = () => {
      if (document.visibilityState === "visible") {
        fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {});
      }
    };
    beat();
    const iv = setInterval(beat, 45000);
    window.addEventListener("focus", beat);
    return () => { clearInterval(iv); window.removeEventListener("focus", beat); };
  }, [status]);

  // Subscribe to my personal channel for instant new-message pings.
  useEffect(() => {
    if (!myId) return;
    const client = getSupabaseBrowser();
    if (!client) return; // no Realtime — polling above covers the badge
    const channel = client.channel(userChannelName(myId), {
      config: { broadcast: { self: false, ack: false } },
    });
    channel
      .on("broadcast", { event: "new-message" }, ({ payload }) => {
        setLastPing({ ...(payload as NewMessagePing), at: Date.now() });
        refreshUnread();
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channel.unsubscribe().catch(() => {});
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [myId, refreshUnread]);

  return (
    <MessagesContext.Provider
      value={{ unreadCount, refreshUnread, activeConversationId, setActiveConversationId, lastPing }}
    >
      {children}
    </MessagesContext.Provider>
  );
}

export function useMessages() {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error("useMessages must be used within MessagesProvider");
  return ctx;
}
