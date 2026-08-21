"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Bot, X, ShieldAlert, Send, Loader2, Check, Ban, Trash2, MessageCircle, ListChecks, ScanSearch } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface BasicUser {
  id: string;
  fullName: string;
  userId: string;
  email: string;
  status: string;
}

interface LanaCase {
  id: string;
  type: string;
  subjectUserId: string;
  riskScore: number;
  summary: string;
  reasoning: string;
  proposedAction: string;
  status: string;
  autoActionTaken: string | null;
  relatedWithdrawalId: string | null;
  createdAt: string;
  subject: BasicUser | null;
  relatedUsers: BasicUser[];
}

interface ChatMsg {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  duplicate_account: "Duplicate account",
  suspicious_withdrawal: "Suspicious withdrawal",
  referral_farming: "Referral farming",
  shared_payout_number: "Shared payout number",
};

function digestLine(cases: LanaCase[]): string | null {
  if (cases.length === 0) return null;
  const autoActioned = cases.filter((c) => c.status === "auto_actioned").length;
  const parts: string[] = [];
  parts.push(`${cases.length} case${cases.length > 1 ? "s" : ""} need${cases.length > 1 ? "" : "s"} your attention`);
  if (autoActioned) parts.push(`${autoActioned} account${autoActioned > 1 ? "s" : ""} already auto-suspended`);
  return parts.join(" — ");
}

export function LanaPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"cases" | "chat">("cases");
  const [cases, setCases] = useState<LanaCase[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchCases = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/lana/cases");
      if (!res.ok) return;
      const data = await res.json();
      setCases(data.openCases ?? []);
    } catch {
      // Silent — this is a background poll, not a user-initiated action.
    }
  }, []);

  useEffect(() => {
    fetchCases();
    const interval = setInterval(fetchCases, 30_000);
    return () => clearInterval(interval);
  }, [fetchCases]);

  useEffect(() => {
    if (open && tab === "chat" && messages.length === 0) {
      fetch("/api/admin/lana/chat")
        .then((r) => r.json())
        .then((d) => setMessages(d.messages ?? []))
        .catch(() => {});
    }
  }, [open, tab, messages.length]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function act(caseId: string, decision: "approve" | "reject" | "dismiss") {
    setBusyId(caseId);
    try {
      const res = await fetch("/api/admin/lana/cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, decision }),
      });
      if (res.ok) await fetchCases();
    } finally {
      setBusyId(null);
    }
  }

  async function proposeDelete(userId: string) {
    setBusyId(userId);
    try {
      const res = await fetch("/api/admin/lana/cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposeDeleteForUserId: userId, deleteReasoning: "Admin requested deletion from the Lana panel." }),
      });
      if (res.ok) await fetchCases();
    } finally {
      setBusyId(null);
    }
  }

  async function runBackfill() {
    if (backfillBusy) return;
    if (!confirm("Scan all existing accounts and withdrawal history for the same fraud patterns? This can create several cases at once, and may auto-suspend some existing accounts at high confidence.")) return;
    setBackfillBusy(true);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/admin/lana/backfill", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setBackfillResult(
          `Scanned ${data.duplicates.scanned} accounts — ${data.duplicates.casesCreated} duplicate-account case(s) (${data.duplicates.autoSuspended} auto-suspended), ${data.sharedPayout.distinctSharedNumbers} shared-payout-number case(s).`
        );
        await fetchCases();
      } else {
        setBackfillResult(data.message ?? "Scan failed.");
      }
    } catch {
      setBackfillResult("Scan failed — try again.");
    } finally {
      setBackfillBusy(false);
    }
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "admin", content: text, createdAt: new Date().toISOString() }]);
    setChatBusy(true);
    try {
      const res = await fetch("/api/admin/lana/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { id: `local-reply-${Date.now()}`, role: "lana", content: data.reply ?? "…", createdAt: new Date().toISOString() }]);
    } catch {
      setMessages((m) => [...m, { id: `local-err-${Date.now()}`, role: "lana", content: "Something went wrong reaching me — try again.", createdAt: new Date().toISOString() }]);
    } finally {
      setChatBusy(false);
    }
  }

  const digest = digestLine(cases);

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full shadow-xl px-4 py-3 text-white transition-transform hover:scale-105",
          cases.length > 0 ? "bg-red-600" : "bg-blue-600"
        )}
        title="Lana — trust & safety agent"
      >
        <Bot size={20} />
        <span className="hidden sm:inline text-sm font-medium">Lana</span>
        {cases.length > 0 && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-white text-red-600 text-xs font-bold">
            {cases.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative w-full sm:w-[420px] h-full bg-white dark:bg-zinc-950 shadow-2xl flex flex-col">
            <div className="shrink-0 flex items-center justify-between p-4 bg-blue-600 text-white">
              <div className="flex items-center gap-2">
                <Bot size={22} />
                <div>
                  <p className="font-semibold leading-tight">Lana</p>
                  <p className="text-xs text-blue-100 leading-tight">Trust & safety agent</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20" aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="shrink-0 flex border-b border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setTab("cases")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium",
                  tab === "cases" ? "text-blue-600 border-b-2 border-blue-600" : "text-zinc-500"
                )}
              >
                <ListChecks size={16} /> Cases {cases.length > 0 && `(${cases.length})`}
              </button>
              <button
                onClick={() => setTab("chat")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium",
                  tab === "chat" ? "text-blue-600 border-b-2 border-blue-600" : "text-zinc-500"
                )}
              >
                <MessageCircle size={16} /> Chat
              </button>
            </div>

            {tab === "cases" ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <button
                  onClick={runBackfill}
                  disabled={backfillBusy}
                  className="w-full flex items-center justify-center gap-2 text-xs font-medium py-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
                >
                  {backfillBusy ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}
                  Scan existing accounts &amp; withdrawal history
                </button>
                {backfillResult && <p className="text-xs text-zinc-500 text-center">{backfillResult}</p>}
                {digest && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 p-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                    <span>{digest}</span>
                  </div>
                )}
                {cases.length === 0 && (
                  <p className="text-sm text-zinc-500 text-center py-8">Nothing needs your attention right now.</p>
                )}
                {cases.map((c) => (
                  <div key={c.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                        {TYPE_LABEL[c.type] ?? c.type}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-bold px-2 py-0.5 rounded-full",
                          c.riskScore >= 80
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        )}
                      >
                        risk {c.riskScore}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{c.summary}</p>
                    <p className="text-xs text-zinc-500">{c.reasoning}</p>
                    {c.status === "auto_actioned" && (
                      <p className="text-xs font-medium text-red-600 dark:text-red-400">
                        ⚡ Lana already {c.autoActionTaken} this account — review below.
                      </p>
                    )}
                    <p className="text-[11px] text-zinc-400">{formatDate(c.createdAt)}</p>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {c.type === "duplicate_account" && c.status === "auto_actioned" && (
                        <>
                          <ActionButton icon={Check} label="Confirm" onClick={() => act(c.id, "approve")} busy={busyId === c.id} />
                          <ActionButton icon={Ban} label="Unsuspend" onClick={() => act(c.id, "reject")} busy={busyId === c.id} variant="neutral" />
                        </>
                      )}
                      {c.type === "duplicate_account" && c.status !== "auto_actioned" && c.proposedAction === "suspend" && (
                        <>
                          <ActionButton icon={ShieldAlert} label="Suspend" onClick={() => act(c.id, "approve")} busy={busyId === c.id} />
                          <ActionButton icon={Ban} label="Dismiss" onClick={() => act(c.id, "dismiss")} busy={busyId === c.id} variant="neutral" />
                        </>
                      )}
                      {c.type === "duplicate_account" && c.proposedAction === "delete_account" && (
                        <>
                          <ActionButton icon={Trash2} label="Delete account" onClick={() => act(c.id, "approve")} busy={busyId === c.id} variant="danger" />
                          <ActionButton icon={Ban} label="Cancel" onClick={() => act(c.id, "dismiss")} busy={busyId === c.id} variant="neutral" />
                        </>
                      )}
                      {c.type === "duplicate_account" && c.status === "auto_actioned" && (
                        <ActionButton icon={Trash2} label="Propose deletion instead" onClick={() => proposeDelete(c.subjectUserId)} busy={busyId === c.subjectUserId} variant="danger" />
                      )}
                      {c.type === "suspicious_withdrawal" && (
                        <>
                          <ActionButton icon={Ban} label="Reject withdrawal" onClick={() => act(c.id, "approve")} busy={busyId === c.id} variant="danger" />
                          <ActionButton icon={Check} label="Looks legit" onClick={() => act(c.id, "dismiss")} busy={busyId === c.id} variant="neutral" />
                        </>
                      )}
                      {(c.type === "referral_farming" || c.type === "shared_payout_number") && (
                        <ActionButton icon={Check} label="Acknowledge" onClick={() => act(c.id, "dismiss")} busy={busyId === c.id} variant="neutral" />
                      )}
                    </div>

                    {c.subject && (
                      <p className="text-[11px] text-zinc-400 pt-1">
                        {c.subject.fullName} · {c.subject.userId} · {c.subject.email}
                      </p>
                    )}
                    {c.relatedUsers.length > 0 && (
                      <div className="pt-1 space-y-0.5">
                        <p className="text-[11px] text-zinc-400 font-medium">Also involved:</p>
                        {c.relatedUsers.map((u) => (
                          <p key={u.id} className="text-[11px] text-zinc-400">
                            {u.fullName} · {u.userId} · {u.status}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 && (
                    <p className="text-sm text-zinc-500 text-center py-8">Ask Lana anything — open cases, a specific user, what happened overnight.</p>
                  )}
                  {messages.map((m) => (
                    <div key={m.id} className={cn("flex", m.role === "admin" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                          m.role === "admin" ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-900 text-foreground"
                        )}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatBusy && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl px-3.5 py-2 bg-zinc-100 dark:bg-zinc-900">
                        <Loader2 size={14} className="animate-spin text-zinc-500" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="shrink-0 flex items-center gap-2 p-3 border-t border-zinc-200 dark:border-zinc-800">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendChat()}
                    placeholder="Message Lana…"
                    className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={sendChat}
                    disabled={chatBusy || !chatInput.trim()}
                    className="p-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  busy,
  variant = "primary",
}: {
  icon: typeof Check;
  label: string;
  onClick: () => void;
  busy: boolean;
  variant?: "primary" | "neutral" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50",
        variant === "primary" && "bg-blue-600 text-white hover:bg-blue-700",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        variant === "neutral" && "bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
      )}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
      {label}
    </button>
  );
}
