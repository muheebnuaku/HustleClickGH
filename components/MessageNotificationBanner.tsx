"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/app/contexts/MessagesContext";
import { MessageCircle, X } from "lucide-react";

/**
 * Toast shown when a new message arrives while the user is NOT already viewing
 * that thread. Driven by the per-user Realtime ping in MessagesContext.
 */
export function MessageNotificationBanner() {
  const router = useRouter();
  const { lastPing, activeConversationId } = useMessages();
  const [toast, setToast] = useState<{ conversationId: string; senderName: string; preview: string } | null>(null);

  useEffect(() => {
    if (!lastPing) return;
    // Don't interrupt the user if they're already in that conversation.
    if (lastPing.conversationId === activeConversationId) return;
    // Raise the toast in response to an incoming realtime ping (external→state sync).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToast({
      conversationId: lastPing.conversationId,
      senderName: lastPing.senderName || "New message",
      preview: lastPing.preview || "",
    });
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [lastPing, activeConversationId]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto">
      <button
        onClick={() => { router.push(`/messages?c=${toast.conversationId}`); setToast(null); }}
        className="w-full text-left bg-blue-600 dark:bg-blue-700 rounded-lg shadow-lg p-4 border border-blue-500 hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageCircle size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-sm truncate">{toast.senderName}</p>
            {toast.preview && <p className="text-blue-100 text-xs mt-0.5 line-clamp-2">{toast.preview}</p>}
            <p className="text-blue-200 text-[11px] mt-1">Tap to open</p>
          </div>
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); setToast(null); }}
            className="text-white/70 hover:text-white hover:bg-white/10 rounded p-1 flex-shrink-0"
          >
            <X size={16} />
          </span>
        </div>
      </button>
    </div>
  );
}
