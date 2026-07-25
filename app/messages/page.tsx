"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/verified-badge";
import { useMessages } from "@/app/contexts/MessagesContext";
import { pingNewMessage } from "@/lib/message-realtime";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Loader2, Send, Search, ArrowLeft, MessageCircle, Shield, PenSquare, Check, CheckCheck } from "lucide-react";

interface UserCard {
  id: string; userId: string; fullName: string; image?: string | null; verified?: boolean; online?: boolean;
}
interface ConversationRow {
  id: string; isAdmin: boolean; other: UserCard | null;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  lastMessageAt: string; unread: number;
}
interface ChatMessage {
  id: string; senderId: string; body: string; createdAt: string; readAt?: string | null;
}

function Avatar({ user, size = 40, showPresence = false }: { user: UserCard | null; size?: number; showPresence?: boolean }) {
  const initial = (user?.fullName || "?").charAt(0).toUpperCase();
  const dot = Math.max(9, Math.round(size * 0.28));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {user?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt={user.fullName} className="rounded-full object-cover w-full h-full" />
      ) : (
        <div className="rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center w-full h-full font-semibold">{initial}</div>
      )}
      {showPresence && user?.online && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-green-500 ring-2 ring-white dark:ring-zinc-950"
          style={{ width: dot, height: dot }}
          title="Online"
        />
      )}
    </div>
  );
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function MessagesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const activeId = params.get("c");
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const { lastPing, refreshUnread, setActiveConversationId } = useMessages();

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [other, setOther] = useState<UserCard | null>(null);
  const [threadIsAdmin, setThreadIsAdmin] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const peerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) setConversations((await res.json()).conversations ?? []);
    } catch { /* ignore */ } finally { setLoadingList(false); }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (res.ok) {
        const d = await res.json();
        setMessages(d.messages ?? []);
        setOther(d.other ?? null);
        setThreadIsAdmin(Boolean(d.isAdmin));
        refreshUnread(); // GET marked them read
      }
    } catch { /* ignore */ } finally { setLoadingThread(false); }
  }, [refreshUnread]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Track the open thread in context (suppresses its own toast + drives live update).
  useEffect(() => {
    setActiveConversationId(activeId);
    if (activeId) loadThread(activeId);
    else { setMessages([]); setOther(null); }
    return () => setActiveConversationId(null);
  }, [activeId, loadThread, setActiveConversationId]);

  // Live: a ping for the open thread → refetch it; any ping → refresh the list.
  useEffect(() => {
    if (!lastPing) return;
    loadConversations();
    if (activeId && lastPing.conversationId === activeId) loadThread(activeId);
  }, [lastPing, activeId, loadThread, loadConversations]);

  // Polling backstop for the open thread (covers no-Realtime + missed pings).
  useEffect(() => {
    if (!activeId) return;
    const iv = setInterval(() => loadThread(activeId), 5000);
    return () => clearInterval(iv);
  }, [activeId, loadThread]);

  // Typing indicator: both participants join a per-conversation broadcast channel
  // while the thread is open. Typing events auto-expire after 4s.
  useEffect(() => {
    setPeerTyping(false);
    if (!activeId) return;
    const client = getSupabaseBrowser();
    if (!client) return; // no Realtime — typing indicator simply doesn't show
    const ch = client.channel(`dm:${activeId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload?.senderId && payload.senderId !== myId) {
        setPeerTyping(true);
        if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
        peerTypingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 4000);
      }
    }).subscribe();
    typingChannelRef.current = ch;
    return () => {
      ch.unsubscribe().catch(() => {});
      client.removeChannel(ch);
      typingChannelRef.current = null;
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);
    };
  }, [activeId, myId]);

  // Tell the other participant I'm typing (throttled to ~once per 2s).
  const notifyTyping = () => {
    const ch = typingChannelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1800) return;
    lastTypingSentRef.current = now;
    ch.send({ type: "broadcast", event: "typing", payload: { senderId: myId } });
  };

  // Keep the thread scrolled to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/conversations/${activeId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        const d = await res.json();
        setMessages((m) => [...m, d.message]);
        loadConversations();
        if (d.recipientId) {
          pingNewMessage(d.recipientId, {
            conversationId: activeId, senderId: myId || "",
            senderName: session?.user?.name || "Someone",
            preview: text.length > 80 ? text.slice(0, 77) + "…" : text,
          });
        }
      } else {
        const e = await res.json().catch(() => ({}));
        alert(e.message || "Could not send");
        setDraft(text);
      }
    } catch { setDraft(text); } finally { setSending(false); }
  };

  const showThreadPane = Boolean(activeId);

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950">
        {/* Conversation list */}
        <aside className={`${showThreadPane ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 shrink-0 border-r border-zinc-200 dark:border-zinc-800 min-w-0`}>
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h1 className="text-lg font-bold">Messages</h1>
            <Button size="sm" onClick={() => setShowNew(true)}><PenSquare size={16} className="mr-1" />New</Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-600" /></div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">
                <MessageCircle className="mx-auto mb-2 opacity-40" size={32} />
                No conversations yet. Tap <strong>New</strong> to find someone.
              </div>
            ) : conversations.map((c) => (
              <button key={c.id} onClick={() => router.push(`/messages?c=${c.id}`)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900 ${activeId === c.id ? "bg-zinc-100 dark:bg-zinc-900" : ""}`}>
                <Avatar user={c.other} showPresence />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground truncate">{c.other?.fullName || "Unknown"}</span>
                    {c.other?.verified && <VerifiedBadge size={13} />}
                    {c.isAdmin && <Shield size={12} className="text-blue-600 shrink-0" />}
                  </div>
                  <p className="text-xs text-zinc-500 truncate">
                    {c.lastMessage ? (c.lastMessage.senderId === myId ? "You: " : "") + c.lastMessage.body : "No messages yet"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[11px] text-zinc-400">{timeAgo(c.lastMessageAt)}</span>
                  {c.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">{c.unread}</span>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Thread */}
        <section className={`${showThreadPane ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0`}>
          {!activeId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-2">
              <MessageCircle size={40} className="opacity-40" />
              <p className="text-sm">Select a conversation</p>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
                <button className="md:hidden p-1" onClick={() => router.push("/messages")}><ArrowLeft size={20} /></button>
                <Link href={other ? `/u/${other.id}` : "#"} className="flex items-center gap-2 min-w-0">
                  <Avatar user={other} size={36} showPresence />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold truncate">{other?.fullName || "Unknown"}</span>
                      {other?.verified && <VerifiedBadge size={14} />}
                      {threadIsAdmin && <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">Admin</span>}
                    </div>
                    {peerTyping ? (
                      <span className="text-[11px] text-blue-600 flex items-center gap-1">
                        typing
                        <span className="inline-flex gap-0.5">
                          <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      </span>
                    ) : other?.online ? (
                      <span className="text-[11px] text-green-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Online</span>
                    ) : null}
                  </div>
                </Link>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-zinc-50 dark:bg-zinc-900/40">
                {loadingThread && messages.length === 0 ? (
                  <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-600" /></div>
                ) : messages.map((m) => {
                  const mine = m.senderId === myId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap ${mine ? "bg-blue-600 text-white rounded-br-sm" : "bg-white dark:bg-zinc-800 text-foreground rounded-bl-sm border border-zinc-200 dark:border-zinc-700"}`}>
                        {m.body}
                        <span className={`flex items-center gap-1 text-[10px] mt-1 ${mine ? "text-blue-100 justify-end" : "text-zinc-400"}`}>
                          {timeAgo(m.createdAt)}
                          {mine && (m.readAt
                            ? <CheckCheck size={13} className="text-sky-200" aria-label="Read" />
                            : <Check size={13} className="text-blue-200" aria-label="Sent" />)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); notifyTyping(); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  rows={1}
                  placeholder="Write a message…"
                  className="flex-1 resize-none max-h-32 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button onClick={send} disabled={sending || !draft.trim()} className="rounded-full h-10 w-10 p-0 shrink-0">
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      {showNew && <NewMessageModal onClose={() => setShowNew(false)} onPick={async (userId) => {
        setShowNew(false);
        const res = await fetch("/api/conversations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        if (res.ok) { const d = await res.json(); router.push(`/messages?c=${d.conversationId}`); }
        else { const e = await res.json().catch(() => ({})); alert(e.message || "Could not start conversation"); }
      }} />}
    </DashboardLayout>
  );
}

function NewMessageModal({ onClose, onPick }: { onClose: () => void; onPick: (userId: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 1) { setResults([]); return; }
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) setResults((await res.json()).users ?? []);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-20" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name or ID…" className="pl-10" />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" /></div>
          ) : results.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">{q ? "No people found" : "Type to search"}</p>
          ) : results.map((u) => (
            <button key={u.id} onClick={() => onPick(u.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800">
              <Avatar user={u} size={36} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5"><span className="font-medium truncate">{u.fullName}</span>{u.verified && <VerifiedBadge size={13} />}</div>
                <p className="text-xs text-zinc-500">{u.userId}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" /></div></DashboardLayout>}>
      <MessagesContent />
    </Suspense>
  );
}
