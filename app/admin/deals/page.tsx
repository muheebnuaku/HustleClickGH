"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { PageHeader, Panel, Notice, Segmented, EmptyState, SkeletonList } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Handshake, Search, Plus, Upload, BookOpen, Sparkles, Send, Copy, ClipboardCheck, StickyNote, ArrowLeft, ExternalLink,
  Mail, AlertTriangle, Pencil, Settings2, Reply, Trash2, X, CheckCircle2, AlertCircle, Inbox, Undo2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface DealRow {
  id: string;
  company: string;
  contactName: string | null;
  contactEmail: string | null;
  source: string;
  stage: string;
  kind: string | null;
  nextDate: string | null;
  nextStep: string | null;
  valueUsd: number | null;
  createdAt: string;
  _count: { messages: number };
}

interface Message {
  id: string;
  kind: "email" | "logged" | "received" | "note";
  toEmail: string | null;
  subject: string | null;
  body: string;
  aiDrafted: boolean;
  createdAt: string;
}

interface Deal extends Omit<DealRow, "_count"> {
  contactTitle: string | null;
  contactUrl: string | null;
  country: string | null;
  summary: string | null;
  evidenceUrl: string | null;
  triage: string | null;
  notes: string | null;
  messages: Message[];
}

interface Triage {
  kind: string;
  fit: string;
  summary: string;
  redFlags: string[];
  missing: string[];
  nextStep: string;
}

interface Settings {
  followUpDays: number;
  autoAnalyse: boolean;
  tone: Tone;
  length: Length;
}

type View = "due" | "active" | "paid" | "lost" | "all";
type Intent = "reply" | "qualify" | "call" | "follow_up" | "intro" | "decline" | "polish" | "custom";
type Tone = "warm" | "formal" | "direct";
type Length = "short" | "medium" | "detailed";
type ToastTone = "success" | "error" | "info";
type Notify = (tone: ToastTone, text: string) => void;

const VIEW_LABELS: Record<View, string> = { due: "To do", active: "Active", paid: "Won", lost: "Lost", all: "All" };
const PIPELINE = ["new", "contacted", "replied", "call", "pilot", "paid"];
const STAGE_LABELS: Record<string, string> = {
  new: "New", contacted: "Contacted", replied: "Replied", call: "Call", pilot: "Pilot", paid: "Won", lost: "Lost",
};
const KIND_LABELS: Record<string, string> = {
  buyer: "Buyer", supply_partner: "Supply partner", vendor_pitch: "Selling to us", spam: "Spam", other: "Other",
};
const KIND_STYLES: Record<string, string> = {
  buyer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  supply_partner: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  vendor_pitch: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  spam: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  other: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};
const SOURCE_LABELS: Record<string, string> = { inquiry: "Inquiry form", radar: "Radar", manual: "Added by hand", import: "Imported lead" };
const INTENTS: { value: Intent; label: string; hint: string }[] = [
  { value: "reply", label: "Reply to them", hint: "Answers their latest message point by point" },
  { value: "qualify", label: "Ask questions", hint: "Asks what we need to know before quoting" },
  { value: "call", label: "Propose a call", hint: "Suggests a 20-minute call" },
  { value: "follow_up", label: "Follow up", hint: "Short nudge after no reply" },
  { value: "intro", label: "First outreach", hint: "Cold first message, under 120 words" },
  { value: "decline", label: "Decline", hint: "Politely closes the conversation" },
  { value: "polish", label: "Polish my text", hint: "Lana tidies what you wrote, keeping your voice" },
  { value: "custom", label: "Custom", hint: "Tell Lana exactly what to write" },
];
const TONES: { value: Tone; label: string }[] = [
  { value: "warm", label: "Warm" }, { value: "formal", label: "Formal" }, { value: "direct", label: "Direct" },
];
const LENGTHS: { value: Length; label: string }[] = [
  { value: "short", label: "Short" }, { value: "medium", label: "Medium" }, { value: "detailed", label: "Detailed" },
];
const UNDO_SECONDS = 10;

const selectCls = "h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 text-sm";
const areaCls = "w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm";
const chipCls = (on: boolean) =>
  `rounded-full border px-3 py-1 text-sm transition-colors ${
    on
      ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
  }`;

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Overdue 2d" / "Today" / "In 3d" relative to today, or null when nothing is scheduled. */
function dueLabel(d: { stage: string; nextDate: string | null }): { text: string; tone: "red" | "blue" | "grey" } | null {
  if (["paid", "lost"].includes(d.stage)) return null;
  if (!d.nextDate) return d.stage === "new" ? { text: "New", tone: "blue" } : null;
  const days = Math.round((startOfDay(new Date(d.nextDate)) - startOfDay(new Date())) / DAY);
  if (days < 0) return { text: `Overdue ${-days}d`, tone: "red" };
  if (days === 0) return { text: "Today", tone: "blue" };
  return { text: `In ${days}d`, tone: "grey" };
}
const DUE_STYLES = {
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  grey: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.message || `Request failed (${res.status})`);
  return data as T;
}

// Unsent drafts are kept per deal on this device only, so switching deals never loses work.
interface SavedDraft { subject: string; body: string; toEmail: string; aiDrafted: boolean }
const draftKey = (id: string) => `deal-draft:${id}`;
function loadDraft(id: string): SavedDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as SavedDraft) : null;
  } catch {
    return null;
  }
}
function storeDraft(id: string, d: SavedDraft | null) {
  try {
    if (!d || (!d.body.trim() && !d.subject.trim())) localStorage.removeItem(draftKey(id));
    else localStorage.setItem(draftKey(id), JSON.stringify(d));
  } catch {}
}

export default function AdminDealsPage() {
  const [view, setView] = useState<View>("due");
  const [search, setSearch] = useState("");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<View, number>>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [panel, setPanel] = useState<"none" | "new" | "import" | "facts" | "settings">("none");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [toasts, setToasts] = useState<{ id: number; tone: ToastTone; text: string }[]>([]);

  const notify: Notify = useCallback((tone, text) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 9000 : 5000);
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view });
      if (search.trim()) params.set("search", search.trim());
      const data = await api<{ deals: DealRow[]; counts: Record<View, number> }>(`/api/admin/deals?${params}`);
      setDeals(data.deals);
      setCounts(data.counts);
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [view, search, notify]);

  useEffect(() => {
    const t = setTimeout(fetchList, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [fetchList, search]);

  useEffect(() => {
    api<{ settings: Settings }>("/api/admin/deals/settings").then((r) => setSettings(r.settings)).catch(() => {});
  }, []);

  const openDeal = useCallback(async (id: string) => {
    setSelectedId(id);
    setDeal(null);
    try {
      setDeal((await api<{ deal: Deal }>(`/api/admin/deals/${id}`)).deal);
    } catch (e) {
      notify("error", (e as Error).message);
    }
  }, [notify]);

  const onDealChanged = (d: Deal) => {
    setDeal(d);
    setDeals((prev) =>
      prev.map((r) =>
        r.id === d.id
          ? { ...r, company: d.company, stage: d.stage, kind: d.kind, nextDate: d.nextDate, nextStep: d.nextStep, valueUsd: d.valueUsd, contactEmail: d.contactEmail, _count: { messages: d.messages.length } }
          : r,
      ),
    );
  };

  const onDealDeleted = (id: string) => {
    setSelectedId(null);
    setDeal(null);
    setDeals((prev) => prev.filter((d) => d.id !== id));
    fetchList();
  };

  const togglePanel = (p: typeof panel) => setPanel(panel === p ? "none" : p);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PageHeader
          icon={Handshake}
          title="Deals"
          description="Partner inquiries, saved Radar posts and outreach leads in one pipeline. Lana drafts when you ask; you edit and send."
          actions={
            <>
              <Button size="sm" variant="outline" onClick={() => togglePanel("settings")}>
                <Settings2 size={15} className="mr-1.5" /> Settings
              </Button>
              <Button size="sm" variant="outline" onClick={() => togglePanel("facts")}>
                <BookOpen size={15} className="mr-1.5" /> Lana&apos;s facts
              </Button>
              <Button size="sm" variant="outline" onClick={() => togglePanel("import")}>
                <Upload size={15} className="mr-1.5" /> Import leads
              </Button>
              <Button size="sm" onClick={() => togglePanel("new")}>
                <Plus size={15} className="mr-1.5" /> New deal
              </Button>
            </>
          }
        />

        {panel === "new" && (
          <NewDealPanel
            onDone={(id) => { setPanel("none"); setView("all"); fetchList(); openDeal(id); }}
            onClose={() => setPanel("none")}
            notify={notify}
          />
        )}
        {panel === "import" && (
          <ImportPanel
            onDone={(r) => { setPanel("none"); notify("success", `Imported ${r.added} lead(s); ${r.skipped} skipped (already in Deals or no company).`); setView("all"); fetchList(); }}
            onClose={() => setPanel("none")}
            notify={notify}
          />
        )}
        {panel === "facts" && <FactsPanel onClose={() => setPanel("none")} notify={notify} />}
        {panel === "settings" && settings && (
          <SettingsPanel settings={settings} onSaved={(s) => { setSettings(s); setPanel("none"); notify("success", "Settings saved."); }} onClose={() => setPanel("none")} notify={notify} />
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
          {/* List */}
          <div className={`space-y-3 ${selectedId ? "hidden lg:block" : ""}`}>
            <Segmented<View>
              options={(Object.keys(VIEW_LABELS) as View[]).map((v) => ({ value: v, label: VIEW_LABELS[v], count: counts[v] }))}
              value={view}
              onChange={(v) => setView(v)}
            />
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, contact, text…" className="pl-9 h-10" />
            </div>
            {loading && deals.length === 0 ? (
              <SkeletonList rows={6} />
            ) : deals.length === 0 ? (
              <Panel>
                <EmptyState
                  icon={Handshake}
                  title={view === "due" ? "Nothing needs you today" : "Nothing here"}
                  description={(counts.all ?? 0) === 0 ? "Import your leads to start the pipeline." : "Try another tab."}
                  action={(counts.all ?? 0) === 0 ? <Button size="sm" onClick={() => setPanel("import")}><Upload size={15} className="mr-1.5" /> Import leads</Button> : undefined}
                />
              </Panel>
            ) : (
              <div className={`space-y-2 ${loading ? "opacity-60" : ""}`}>
                {deals.map((d) => {
                  const due = dueLabel(d);
                  return (
                    <button
                      key={d.id}
                      onClick={() => openDeal(d.id)}
                      className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                        selectedId === d.id
                          ? "border-blue-400 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/30"
                          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground truncate">{d.company}</span>
                        {due && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${DUE_STYLES[due.tone]}`}>{due.text}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{STAGE_LABELS[d.stage] || d.stage}</span>
                        {d.kind && <span className={`rounded-full px-2 py-0.5 ${KIND_STYLES[d.kind] || KIND_STYLES.other}`}>{KIND_LABELS[d.kind] || d.kind}</span>}
                        <span className="text-zinc-500">{SOURCE_LABELS[d.source] || d.source}</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 truncate">
                        {d.nextStep && due ? d.nextStep : d.contactName || d.contactEmail || formatDate(d.createdAt)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className={selectedId ? "" : "hidden lg:block"}>
            {!selectedId ? (
              <Panel>
                <EmptyState icon={Mail} title="Select a deal" description="Open a deal to see Lana's analysis, draft a message and track follow-ups." />
              </Panel>
            ) : !deal ? (
              <SkeletonList rows={4} />
            ) : (
              <DealDetail
                key={deal.id}
                deal={deal}
                settings={settings}
                onBack={() => setSelectedId(null)}
                onChanged={onDealChanged}
                onDeleted={onDealDeleted}
                notify={notify}
              />
            )}
          </div>
        </div>
      </div>

      {/* Toasts sit beside the action instead of at the top of a long page. */}
      <div className="fixed bottom-4 right-4 z-50 flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? AlertCircle : Mail;
          return (
            <div
              key={t.id}
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${
                t.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                  : t.tone === "error"
                    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                    : "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
              }`}
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1 whitespace-pre-line">{t.text}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}

function DealDetail({
  deal, settings, onBack, onChanged, onDeleted, notify,
}: {
  deal: Deal;
  settings: Settings | null;
  onBack: () => void;
  onChanged: (d: Deal) => void;
  onDeleted: (id: string) => void;
  notify: Notify;
}) {
  const triage: Triage | null = (() => {
    try { return deal.triage ? JSON.parse(deal.triage) : null; } catch { return null; }
  })();
  const lastMessage = [...deal.messages].reverse().find((m) => m.kind !== "note");
  const theyReplied = lastMessage?.kind === "received";

  const [analysing, setAnalysing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState({
    company: deal.company, contactName: deal.contactName ?? "", contactEmail: deal.contactEmail ?? "",
    contactTitle: deal.contactTitle ?? "", contactUrl: deal.contactUrl ?? "",
  });

  const saved = loadDraft(deal.id);
  const defaultIntent: Intent = theyReplied || (deal.source === "inquiry" && !lastMessage) ? "reply" : lastMessage ? "follow_up" : "intro";
  const [intent, setIntent] = useState<Intent>(defaultIntent);
  const [tone, setTone] = useState<Tone>(settings?.tone ?? "warm");
  const [length, setLength] = useState<Length>(settings?.length ?? "short");
  const [instruction, setInstruction] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [subject, setSubject] = useState(saved?.subject ?? "");
  const [body, setBody] = useState(saved?.body ?? "");
  const [toEmail, setToEmail] = useState(saved?.toEmail || deal.contactEmail || "");
  const [aiDrafted, setAiDrafted] = useState(saved?.aiDrafted ?? false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [replyText, setReplyText] = useState("");
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [note, setNote] = useState("");

  // Keep the unsent draft for this deal on this device.
  useEffect(() => {
    storeDraft(deal.id, { subject, body, toEmail, aiDrafted });
  }, [deal.id, subject, body, toEmail, aiDrafted]);

  // Leaving the deal during the undo window cancels the send (the draft stays saved).
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const analyse = useCallback(async () => {
    setAnalysing(true);
    try {
      await api(`/api/admin/deals/${deal.id}/triage`, { method: "POST" });
      onChanged((await api<{ deal: Deal }>(`/api/admin/deals/${deal.id}`)).deal);
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setAnalysing(false);
    }
  }, [deal.id, onChanged, notify]);

  // Only when the owner switched it on in Settings.
  const autoRan = useRef(false);
  useEffect(() => {
    if (settings?.autoAnalyse && !deal.triage && !autoRan.current) {
      autoRan.current = true;
      analyse();
    }
  }, [settings?.autoAnalyse, deal.triage, analyse]);

  const patch = async (data: Record<string, unknown>) => {
    try {
      const r = await api<{ deal: Deal }>(`/api/admin/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify(data) });
      onChanged(r.deal);
      return r.deal;
    } catch (e) {
      notify("error", (e as Error).message);
      return null;
    }
  };

  const setFollowUp = (days: number | null) =>
    patch({ nextDate: days === null ? null : toDateInput(new Date(Date.now() + days * DAY)) });

  const draft = async () => {
    setDrafting(true);
    try {
      const r = await api<{ draft: { subject: string; body: string; warnings: string[] } }>(`/api/admin/deals/${deal.id}/draft`, {
        method: "POST",
        body: JSON.stringify({ intent, instruction, tone, length, ownerDraft: intent === "polish" ? body : undefined }),
      });
      if (intent !== "polish" || !subject.trim()) setSubject(r.draft.subject);
      setBody(r.draft.body);
      setWarnings(r.draft.warnings);
      setAiDrafted(true);
      setReviewing(false);
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  const post = async (kind: Message["kind"], payload: Record<string, unknown>) => {
    const r = await api<{ deal: Deal }>(`/api/admin/deals/${deal.id}/messages`, { method: "POST", body: JSON.stringify({ kind, ...payload }) });
    onChanged(r.deal);
  };

  const clearComposer = () => {
    setSubject(""); setBody(""); setWarnings([]); setAiDrafted(false); setReviewing(false);
    storeDraft(deal.id, null);
  };

  const reallySend = async () => {
    setSending(true);
    try {
      await post("email", { subject, body, toEmail, aiDrafted });
      clearComposer();
      notify("success", `Sent to ${toEmail}. Follow-up set for ${settings?.followUpDays ?? 3} days from now.`);
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const startSend = () => {
    let left = UNDO_SECONDS;
    setCountdown(left);
    timer.current = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setCountdown(null);
        reallySend();
      } else setCountdown(left);
    }, 1000);
  };

  const undoSend = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setCountdown(null);
    notify("info", "Not sent. Your draft is still here.");
  };

  const logElsewhere = async () => {
    setSending(true);
    try {
      await navigator.clipboard?.writeText(body).catch(() => {});
      await post("logged", { subject, body, aiDrafted });
      clearComposer();
      notify("success", `Copied and logged as sent (e.g. on LinkedIn). Follow-up in ${settings?.followUpDays ?? 3} days.`);
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const saveTheirReply = async () => {
    try {
      await post("received", { body: replyText });
      setReplyText("");
      setShowReplyBox(false);
      setIntent("reply");
      notify("success", "Their reply is saved. Lana will use it when drafting your answer.");
    } catch (e) {
      notify("error", (e as Error).message);
    }
  };

  const addNote = async () => {
    try {
      await post("note", { body: note });
      setNote("");
    } catch (e) {
      notify("error", (e as Error).message);
    }
  };

  const saveContact = async () => {
    const d = await patch(contact);
    if (d) {
      setEditing(false);
      if (!toEmail && d.contactEmail) setToEmail(d.contactEmail);
    }
  };

  const remove = async () => {
    const what = deal.source === "inquiry" ? "this deal, its history and the original inquiry" : "this deal and its history";
    if (!window.confirm(`Permanently delete ${what}? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/deals/${deal.id}`, { method: "DELETE" });
      storeDraft(deal.id, null);
      onDeleted(deal.id);
      notify("success", `${deal.company} deleted.`);
    } catch (e) {
      notify("error", (e as Error).message);
    }
  };

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const canEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(toEmail.trim());
  const busy = sending || countdown !== null;
  const due = dueLabel(deal);

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 lg:hidden">
          <ArrowLeft size={15} /> All deals
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-foreground break-words">{deal.company}</h2>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-500">
              {deal.contactName && <span>{deal.contactName}{deal.contactTitle ? `, ${deal.contactTitle}` : ""}</span>}
              {deal.contactEmail && <a href={`mailto:${deal.contactEmail}`} className="hover:text-blue-600">{deal.contactEmail}</a>}
              {deal.contactUrl && (
                <a href={deal.contactUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-blue-600">
                  Profile <ExternalLink size={12} />
                </a>
              )}
              {deal.country && <span>{deal.country}</span>}
              <span>{SOURCE_LABELS[deal.source] || deal.source} · {formatDate(deal.createdAt)}</span>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>
            <Pencil size={14} className="mr-1.5" /> Edit
          </Button>
        </div>

        {editing && (
          <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["company", "Company"], ["contactName", "Contact name"], ["contactEmail", "E-mail"], ["contactTitle", "Title"], ["contactUrl", "Profile / contact page URL"],
              ] as const).map(([k, label]) => (
                <label key={k} className="block text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                  <Input value={contact[k]} onChange={(e) => setContact((c) => ({ ...c, [k]: e.target.value }))} className="h-10 mt-1" />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button size="sm" onClick={saveContact}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
              <Button size="sm" variant="ghost" onClick={remove} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                <Trash2 size={14} className="mr-1.5" /> Delete deal
              </Button>
            </div>
          </div>
        )}

        {/* Stage: one click to move along the pipeline */}
        <div className="mt-4">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1.5">Stage</div>
          <div className="flex flex-wrap items-center gap-1">
            {PIPELINE.map((s, i) => {
              const reached = deal.stage !== "lost" && PIPELINE.indexOf(deal.stage) >= i;
              return (
                <button
                  key={s}
                  onClick={() => s !== deal.stage && patch({ stage: s })}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    deal.stage === s
                      ? "bg-blue-600 text-white"
                      : reached
                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {STAGE_LABELS[s]}
                </button>
              );
            })}
            <button
              onClick={() => deal.stage !== "lost" && patch({ stage: "lost", nextDate: null })}
              className={`ml-1 rounded-lg px-3 py-1.5 text-sm font-medium ${deal.stage === "lost" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
            >
              Lost
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="text-sm">
            <span className="block text-zinc-600 dark:text-zinc-400 mb-1">
              Next follow-up {due && <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${DUE_STYLES[due.tone]}`}>{due.text}</span>}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <input
                type="date"
                value={deal.nextDate ? toDateInput(new Date(deal.nextDate)) : ""}
                onChange={(e) => patch({ nextDate: e.target.value || null })}
                className={selectCls}
              />
              {([["Today", 0], ["+3d", 3], ["+1w", 7], ["+2w", 14]] as const).map(([l, d]) => (
                <button key={l} onClick={() => setFollowUp(d)} className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">{l}</button>
              ))}
              {deal.nextDate && (
                <button onClick={() => setFollowUp(null)} className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Clear</button>
              )}
            </div>
          </div>
          <label className="text-sm">
            <span className="block text-zinc-600 dark:text-zinc-400 mb-1">Type</span>
            <select value={deal.kind ?? ""} onChange={(e) => patch({ kind: e.target.value || null })} className={selectCls}>
              <option value="">Not set</option>
              {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-zinc-600 dark:text-zinc-400 mb-1">Value (USD)</span>
            <input
              type="number"
              min={0}
              defaultValue={deal.valueUsd ?? ""}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              onBlur={(e) => { if (String(deal.valueUsd ?? "") !== e.target.value) patch({ valueUsd: e.target.value }); }}
              className={`${selectCls} w-28`}
              placeholder="0"
            />
          </label>
        </div>

        {deal.summary && (
          <div className="mt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">{deal.source === "inquiry" ? "Their message" : "Why they may need us"}</div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 max-h-64 overflow-y-auto">{deal.summary}</p>
            {deal.evidenceUrl && (
              <a href={deal.evidenceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                Evidence <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}
      </Panel>

      {/* Lana's analysis */}
      <Panel className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground inline-flex items-center gap-2"><Sparkles size={16} className="text-violet-500" /> Lana&apos;s analysis</h3>
          <Button size="sm" variant="outline" onClick={analyse} disabled={analysing}>
            {analysing ? "Analysing…" : triage ? "Re-analyse" : "Analyse"}
          </Button>
        </div>
        {!triage ? (
          <p className="mt-2 text-sm text-zinc-500">
            {analysing ? "Reading the deal…" : "Ask Lana whether this is a buyer, a supply partner, a sales pitch or spam, and what to find out next."}
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLES[triage.kind] || KIND_STYLES.other}`}>{KIND_LABELS[triage.kind] || triage.kind}</span>
              <span className="text-xs text-zinc-500">Fit: <b>{triage.fit}</b></span>
              {deal.kind && deal.kind !== triage.kind && <span className="text-xs text-zinc-500">(you set it to {KIND_LABELS[deal.kind] || deal.kind})</span>}
            </div>
            <p className="text-zinc-700 dark:text-zinc-300">{triage.summary}</p>
            {triage.redFlags.length > 0 && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-red-800 dark:text-red-300">
                <div className="font-medium inline-flex items-center gap-1.5"><AlertTriangle size={14} /> Red flags</div>
                <ul className="mt-1 list-disc pl-5">{triage.redFlags.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            )}
            {triage.missing.length > 0 && (
              <div>
                <div className="font-medium text-zinc-700 dark:text-zinc-300">Still need to find out</div>
                <ul className="mt-1 list-disc pl-5 text-zinc-600 dark:text-zinc-400">{triage.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}
            {triage.nextStep && <p className="text-emerald-700 dark:text-emerald-400"><b>Suggested next step:</b> {triage.nextStep}</p>}
          </div>
        )}
      </Panel>

      {/* Composer */}
      <Panel className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground">Write a message</h3>
          <Button size="sm" variant="ghost" onClick={() => setShowReplyBox((s) => !s)}>
            <Inbox size={15} className="mr-1.5" /> Log their reply
          </Button>
        </div>

        {showReplyBox && (
          <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/30">
            <p className="text-sm text-sky-800 dark:text-sky-300">Paste what they wrote back (from Zoho or LinkedIn). Lana reads it when you choose “Reply to them”.</p>
            <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={5} className={areaCls} placeholder="Their reply…" />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveTheirReply} disabled={!replyText.trim()}>Save their reply</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowReplyBox(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {INTENTS.map((i) => (
            <button key={i.value} onClick={() => setIntent(i.value)} title={i.hint} className={chipCls(intent === i.value)}>
              {i.value === "reply" && <Reply size={13} className="mr-1 inline" />}
              {i.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">{INTENTS.find((i) => i.value === intent)?.hint}{theyReplied && intent !== "reply" ? " · They replied last: “Reply to them” uses their message." : ""}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-zinc-500 mr-1">Tone</span>
            {TONES.map((t) => <button key={t.value} onClick={() => setTone(t.value)} className={chipCls(tone === t.value)}>{t.label}</button>)}
          </div>
          {intent !== "polish" && (
            <div className="flex items-center gap-1">
              <span className="text-zinc-500 mr-1">Length</span>
              {LENGTHS.map((l) => <button key={l.value} onClick={() => setLength(l.value)} className={chipCls(length === l.value)}>{l.label}</button>)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !drafting) draft(); }}
            placeholder={intent === "custom" ? "Tell Lana what to write…" : "Optional: anything to include or avoid (e.g. mention we can start in November)"}
            className="h-10 flex-1"
          />
          <Button
            size="sm"
            onClick={draft}
            disabled={drafting || busy || (intent === "custom" && !instruction.trim()) || (intent === "polish" && !body.trim())}
            className="h-10"
          >
            <Sparkles size={15} className="mr-1.5" />
            {drafting ? "Lana is writing…" : intent === "polish" ? "Polish" : body ? "Redraft" : "Draft with Lana"}
          </Button>
        </div>

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="font-medium inline-flex items-center gap-1.5"><AlertTriangle size={14} /> Check before sending</div>
            <ul className="mt-1 list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">To</span>
            <Input value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="name@company.com (empty if sending on LinkedIn)" className="h-10 mt-1" disabled={busy} />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Subject</span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-10 mt-1" disabled={busy} />
          </label>
        </div>
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); setReviewing(false); }}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canEmail && subject.trim() && body.trim()) setReviewing(true); }}
          rows={12}
          disabled={busy}
          className={areaCls}
          placeholder="Draft with Lana, or write your own and press “Polish my text”."
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span>{words} words{aiDrafted ? " · Drafted by Lana: read it before sending" : ""}</span>
          {(body || subject) && !busy && (
            <span>
              Draft saved on this device ·{" "}
              <button onClick={clearComposer} className="underline hover:text-zinc-800 dark:hover:text-zinc-200">Discard</button>
            </span>
          )}
        </div>

        {/* Review → 10-second undo → send */}
        {countdown !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            <span>Sending to <b>{toEmail}</b> in {countdown}s…</span>
            <Button size="sm" variant="outline" onClick={undoSend}><Undo2 size={15} className="mr-1.5" /> Undo</Button>
          </div>
        ) : reviewing ? (
          <div className="space-y-3 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
            <div className="text-xs text-zinc-500 space-y-0.5">
              <div><b>From:</b> HustleClickGH &lt;info@hustleclickgh.com&gt; · replies come back to info@</div>
              <div><b>To:</b> {toEmail}</div>
              <div><b>Subject:</b> {subject}</div>
            </div>
            <div className="rounded-md bg-white p-4 text-sm leading-relaxed text-zinc-800 shadow-inner dark:bg-zinc-950 dark:text-zinc-200 whitespace-pre-wrap">{body}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={startSend}><Send size={15} className="mr-1.5" /> Send now</Button>
              <Button size="sm" variant="ghost" onClick={() => setReviewing(false)}>Keep editing</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setReviewing(true)} disabled={busy || !body.trim() || !subject.trim() || !canEmail} title={!canEmail ? "Add a valid e-mail address to send from here" : "Ctrl+Enter"}>
              <Send size={15} className="mr-1.5" /> Review &amp; send
            </Button>
            <Button size="sm" variant="outline" onClick={logElsewhere} disabled={busy || !body.trim()} title="Copy the text and record it as sent on LinkedIn or a contact form">
              <ClipboardCheck size={15} className="mr-1.5" /> Copy &amp; log as sent elsewhere
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(body); notify("info", "Copied."); }} disabled={!body.trim()}>
              <Copy size={15} className="mr-1.5" /> Copy
            </Button>
          </div>
        )}
      </Panel>

      {/* History */}
      <Panel className="p-5 space-y-3">
        <h3 className="font-semibold text-foreground">History</h3>
        <div className="flex gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) addNote(); }}
            placeholder="Add a private note (call outcome, next idea…)"
            className="h-10 flex-1"
          />
          <Button size="sm" variant="outline" onClick={addNote} disabled={!note.trim()} className="h-10">
            <StickyNote size={15} className="mr-1.5" /> Add
          </Button>
        </div>
        {deal.messages.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing sent or received yet.</p>
        ) : (
          <ol className="space-y-3">
            {[...deal.messages].reverse().map((m) => <HistoryItem key={m.id} m={m} />)}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function HistoryItem({ m }: { m: Message }) {
  const [open, setOpen] = useState(false);
  const long = m.body.length > 400;
  const style =
    m.kind === "received"
      ? "border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30"
      : m.kind === "note"
        ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"
        : "border-zinc-200 dark:border-zinc-800";
  const label = m.kind === "email" ? `You e-mailed ${m.toEmail}` : m.kind === "logged" ? "You sent (outside the app)" : m.kind === "received" ? "They replied" : "Note";
  return (
    <li className={`rounded-lg border p-3 text-sm ${style}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <span>{new Date(m.createdAt).toLocaleString()}</span>
        {m.aiDrafted && <span className="rounded-full bg-violet-50 px-2 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">Lana draft</span>}
      </div>
      {m.subject && <div className="mt-1 font-medium text-foreground">{m.subject}</div>}
      <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{long && !open ? `${m.body.slice(0, 400)}…` : m.body}</p>
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="mt-1 text-xs text-blue-600 hover:underline">{open ? "Show less" : "Show all"}</button>
      )}
    </li>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={16} /></button>
    </div>
  );
}

function SettingsPanel({ settings, onSaved, onClose, notify }: { settings: Settings; onSaved: (s: Settings) => void; onClose: () => void; notify: Notify }) {
  const [s, setS] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      onSaved((await api<{ settings: Settings }>("/api/admin/deals/settings", { method: "PUT", body: JSON.stringify({ settings: s }) })).settings);
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel className="p-5 space-y-4">
      <PanelHeader title="Deals settings" onClose={onClose} />
      <p className="text-sm text-zinc-500">You decide how much Lana does. She never sends anything: every e-mail needs your review and a 10-second undo window.</p>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={s.autoAnalyse} onChange={(e) => setS({ ...s, autoAnalyse: e.target.checked })} className="mt-1" />
        <span>
          <span className="font-medium text-foreground">Analyse new deals automatically</span>
          <span className="block text-zinc-500">When you open a deal Lana hasn&apos;t looked at, she classifies it straight away. Off: she only analyses when you press Analyse (uses less OpenAI credit).</span>
        </span>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-foreground">Follow up after</span>
        <span className="ml-2 inline-flex items-center gap-2">
          <input type="number" min={1} max={30} value={s.followUpDays} onChange={(e) => setS({ ...s, followUpDays: Number(e.target.value) })} className={`${selectCls} w-20`} />
          days without a reply
        </span>
      </label>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <div className="flex items-center gap-1">
          <span className="font-medium text-foreground mr-2">Default tone</span>
          {TONES.map((t) => <button key={t.value} onClick={() => setS({ ...s, tone: t.value })} className={chipCls(s.tone === t.value)}>{t.label}</button>)}
        </div>
        <div className="flex items-center gap-1">
          <span className="font-medium text-foreground mr-2">Default length</span>
          {LENGTHS.map((l) => <button key={l.value} onClick={() => setS({ ...s, length: l.value })} className={chipCls(s.length === l.value)}>{l.label}</button>)}
        </div>
      </div>
      <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
    </Panel>
  );
}

function NewDealPanel({ onDone, onClose, notify }: { onDone: (id: string) => void; onClose: () => void; notify: Notify }) {
  const [f, setF] = useState({ company: "", contactName: "", contactEmail: "", contactUrl: "", summary: "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      onDone((await api<{ deal: { id: string } }>("/api/admin/deals", { method: "POST", body: JSON.stringify(f) })).deal.id);
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel className="p-5 space-y-3">
      <PanelHeader title="New deal" onClose={onClose} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Company *" className="h-10" />
        <Input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} placeholder="Contact name" className="h-10" />
        <Input value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} placeholder="E-mail" className="h-10" />
        <Input value={f.contactUrl} onChange={(e) => setF({ ...f, contactUrl: e.target.value })} placeholder="LinkedIn / contact page URL" className="h-10" />
      </div>
      <textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} rows={4} className={areaCls} placeholder="Their message, or why they may need us (evidence)" />
      <Button size="sm" onClick={save} disabled={saving || f.company.trim().length < 2}>{saving ? "Saving…" : "Create deal"}</Button>
    </Panel>
  );
}

function ImportPanel({ onDone, onClose, notify }: { onDone: (r: { added: number; skipped: number }) => void; onClose: () => void; notify: Notify }) {
  const [csv, setCsv] = useState("");
  const [saving, setSaving] = useState(false);
  const rows = csv.trim() ? Math.max(0, csv.trim().split(/\r?\n/).length - 1) : 0;
  const run = async () => {
    setSaving(true);
    try {
      onDone(await api<{ added: number; skipped: number }>("/api/admin/deals/import", { method: "POST", body: JSON.stringify({ csv }) }));
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel className="p-5 space-y-3">
      <PanelHeader title="Import leads" onClose={onClose} />
      <p className="text-sm text-zinc-500">
        Choose <code>growth/leads.csv</code>, or paste rows with a header line (company, contact_name, contact_title, contact_url, evidence_url,
        evidence, stage, next_step, next_date, notes; contact_email optional). Companies already in Deals are skipped.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }} className="text-sm" />
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} className={`${areaCls} font-mono`} placeholder="id,date_added,company,…" />
      <Button size="sm" onClick={run} disabled={saving || !csv.trim()}>{saving ? "Importing…" : rows ? `Import ${rows} row${rows === 1 ? "" : "s"}` : "Import"}</Button>
    </Panel>
  );
}

function FactsPanel({ onClose, notify }: { onClose: () => void; notify: Notify }) {
  const [facts, setFacts] = useState<string | null>(null);
  const [defaults, setDefaults] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api<{ facts: string; defaults: string }>("/api/admin/deals/facts")
      .then((r) => { setFacts(r.facts); setDefaults(r.defaults); })
      .catch((e) => notify("error", (e as Error).message));
  }, [notify]);
  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ facts: string }>("/api/admin/deals/facts", { method: "PUT", body: JSON.stringify({ facts }) });
      setFacts(r.facts);
      notify("success", "Lana's facts saved. New drafts use them.");
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel className="p-5 space-y-3">
      <PanelHeader title="Lana's facts" onClose={onClose} />
      <Notice tone="info">
        Lana may only say what is written here about HustleClickGH. Keep it true. Add a price range or a calendar link here if you want her to use them; otherwise she will not quote prices.
      </Notice>
      {facts === null ? (
        <SkeletonList rows={2} />
      ) : (
        <>
          <textarea value={facts} onChange={(e) => setFacts(e.target.value)} rows={18} className={`${areaCls} font-mono`} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save facts"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setFacts(defaults)}>Reset to default</Button>
          </div>
        </>
      )}
    </Panel>
  );
}
