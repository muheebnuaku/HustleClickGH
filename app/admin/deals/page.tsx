"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { PageHeader, Panel, Notice, Segmented, EmptyState, SkeletonList } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Handshake, Search, Plus, Upload, BookOpen, Sparkles, Send, Copy, ClipboardCheck, StickyNote, ArrowLeft,
  ExternalLink, Mail, AlertTriangle, Pencil,
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
  kind: "email" | "logged" | "note";
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

type View = "due" | "active" | "paid" | "lost" | "all";
type Intent = "qualify" | "call" | "follow_up" | "intro" | "decline" | "custom";

const VIEW_LABELS: Record<View, string> = { due: "To do", active: "Active", paid: "Won", lost: "Lost", all: "All" };
const STAGES = ["new", "contacted", "replied", "call", "pilot", "paid", "lost"];
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
const INTENTS: { value: Intent; label: string }[] = [
  { value: "qualify", label: "Ask questions" },
  { value: "call", label: "Propose a call" },
  { value: "follow_up", label: "Follow up" },
  { value: "intro", label: "First outreach" },
  { value: "decline", label: "Decline" },
  { value: "custom", label: "Custom" },
];

const selectCls = "h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 text-sm";
const areaCls = "w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm";

function isDue(d: { stage: string; nextDate: string | null }) {
  if (d.stage === "new") return true;
  if (!d.nextDate || ["paid", "lost"].includes(d.stage)) return false;
  return new Date(d.nextDate) <= new Date(new Date().setHours(23, 59, 59, 999));
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.message || `Request failed (${res.status})`);
  return data as T;
}

export default function AdminDealsPage() {
  const [view, setView] = useState<View>("due");
  const [search, setSearch] = useState("");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<View, number>>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [panel, setPanel] = useState<"none" | "new" | "import" | "facts">("none");

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ view });
      if (search.trim()) params.set("search", search.trim());
      const data = await api<{ deals: DealRow[]; counts: Record<View, number> }>(`/api/admin/deals?${params}`);
      setDeals(data.deals);
      setCounts(data.counts);
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [view, search]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openDeal = useCallback(async (id: string) => {
    setSelectedId(id);
    setDeal(null);
    try {
      setDeal((await api<{ deal: Deal }>(`/api/admin/deals/${id}`)).deal);
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message });
    }
  }, []);

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

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PageHeader
          icon={Handshake}
          title="Deals"
          description="Partner inquiries, saved Radar posts and outreach leads in one pipeline. Lana drafts; you edit and send."
          actions={
            <>
              <Button size="sm" variant="outline" onClick={() => setPanel(panel === "facts" ? "none" : "facts")}>
                <BookOpen size={15} className="mr-1.5" /> Lana&apos;s facts
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPanel(panel === "import" ? "none" : "import")}>
                <Upload size={15} className="mr-1.5" /> Import leads
              </Button>
              <Button size="sm" onClick={() => setPanel(panel === "new" ? "none" : "new")}>
                <Plus size={15} className="mr-1.5" /> New deal
              </Button>
            </>
          }
        />

        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

        {panel === "new" && (
          <NewDealPanel
            onDone={(id) => { setPanel("none"); setView("all"); fetchList(); openDeal(id); }}
            onError={(t) => setNotice({ tone: "error", text: t })}
          />
        )}
        {panel === "import" && (
          <ImportPanel
            onDone={(r) => { setPanel("none"); setNotice({ tone: "success", text: `Imported ${r.added} lead(s); ${r.skipped} skipped (already in Deals or no company).` }); fetchList(); }}
            onError={(t) => setNotice({ tone: "error", text: t })}
          />
        )}
        {panel === "facts" && <FactsPanel onSaved={() => setNotice({ tone: "success", text: "Lana's facts saved. New drafts use them." })} />}

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
            {loading ? (
              <SkeletonList rows={6} />
            ) : deals.length === 0 ? (
              <Panel>
                <EmptyState icon={Handshake} title="Nothing here" description={view === "due" ? "No deals need action today." : "Try another tab."} />
              </Panel>
            ) : (
              <div className="space-y-2">
                {deals.map((d) => (
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
                      {isDue(d) && <span className="shrink-0 h-2 w-2 rounded-full bg-blue-500" title="Needs action" />}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{d.stage}</span>
                      {d.kind && <span className={`rounded-full px-2 py-0.5 ${KIND_STYLES[d.kind] || KIND_STYLES.other}`}>{KIND_LABELS[d.kind] || d.kind}</span>}
                      <span className="text-zinc-500">{SOURCE_LABELS[d.source] || d.source}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 truncate">
                      {d.nextDate && !["paid", "lost"].includes(d.stage) ? `Next: ${formatDate(d.nextDate)}${d.nextStep ? ` · ${d.nextStep}` : ""}` : d.contactName || d.contactEmail || formatDate(d.createdAt)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className={selectedId ? "" : "hidden lg:block"}>
            {!selectedId ? (
              <Panel>
                <EmptyState icon={Mail} title="Select a deal" description="Open a deal to see Lana's analysis, draft a reply and track follow-ups." />
              </Panel>
            ) : !deal ? (
              <SkeletonList rows={4} />
            ) : (
              <DealDetail
                key={deal.id}
                deal={deal}
                onBack={() => setSelectedId(null)}
                onChanged={onDealChanged}
                notify={(tone, text) => setNotice({ tone, text })}
              />
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function DealDetail({
  deal, onBack, onChanged, notify,
}: {
  deal: Deal;
  onBack: () => void;
  onChanged: (d: Deal) => void;
  notify: (tone: "success" | "error" | "info", text: string) => void;
}) {
  const triage: Triage | null = (() => {
    try { return deal.triage ? JSON.parse(deal.triage) : null; } catch { return null; }
  })();
  const [analysing, setAnalysing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState({
    company: deal.company, contactName: deal.contactName ?? "", contactEmail: deal.contactEmail ?? "",
    contactTitle: deal.contactTitle ?? "", contactUrl: deal.contactUrl ?? "",
  });

  const [intent, setIntent] = useState<Intent>(deal.messages.some((m) => m.kind !== "note") ? "follow_up" : deal.source === "inquiry" ? "qualify" : "intro");
  const [instruction, setInstruction] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [toEmail, setToEmail] = useState(deal.contactEmail ?? "");
  const [aiDrafted, setAiDrafted] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");

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

  const analyse = async () => {
    setAnalysing(true);
    try {
      await api(`/api/admin/deals/${deal.id}/triage`, { method: "POST" });
      onChanged((await api<{ deal: Deal }>(`/api/admin/deals/${deal.id}`)).deal);
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setAnalysing(false);
    }
  };

  const draft = async () => {
    setDrafting(true);
    try {
      const r = await api<{ draft: { subject: string; body: string; warnings: string[] } }>(`/api/admin/deals/${deal.id}/draft`, {
        method: "POST",
        body: JSON.stringify({ intent, instruction }),
      });
      setSubject(r.draft.subject);
      setBody(r.draft.body);
      setWarnings(r.draft.warnings);
      setAiDrafted(true);
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  const post = async (kind: "email" | "logged" | "note", payload: Record<string, unknown>) => {
    const r = await api<{ deal: Deal }>(`/api/admin/deals/${deal.id}/messages`, { method: "POST", body: JSON.stringify({ kind, ...payload }) });
    onChanged(r.deal);
  };

  const send = async () => {
    if (!window.confirm(`Send this e-mail to ${toEmail} from info@hustleclickgh.com?`)) return;
    setSending(true);
    try {
      await post("email", { subject, body, toEmail, aiDrafted });
      setSubject(""); setBody(""); setWarnings([]); setAiDrafted(false);
      notify("success", `Sent to ${toEmail}. Follow-up set for 3 days from now.`);
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const logElsewhere = async () => {
    setSending(true);
    try {
      await navigator.clipboard?.writeText(body).catch(() => {});
      await post("logged", { subject, body, aiDrafted });
      setSubject(""); setBody(""); setWarnings([]); setAiDrafted(false);
      notify("success", "Copied and logged as sent (e.g. on LinkedIn). Follow-up set for 3 days from now.");
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setSending(false);
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
            <Pencil size={14} className="mr-1.5" /> Edit details
          </Button>
        </div>

        {editing && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {([
              ["company", "Company"], ["contactName", "Contact name"], ["contactEmail", "E-mail"], ["contactTitle", "Title"], ["contactUrl", "Profile / contact page URL"],
            ] as const).map(([k, label]) => (
              <label key={k} className="block text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                <Input value={contact[k]} onChange={(e) => setContact((c) => ({ ...c, [k]: e.target.value }))} className="h-10 mt-1" />
              </label>
            ))}
            <div className="flex items-end gap-2">
              <Button size="sm" onClick={saveContact}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-zinc-600 dark:text-zinc-400 mb-1">Stage</span>
            <select value={deal.stage} onChange={(e) => patch({ stage: e.target.value })} className={selectCls}>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-zinc-600 dark:text-zinc-400 mb-1">Type</span>
            <select value={deal.kind ?? ""} onChange={(e) => patch({ kind: e.target.value || null })} className={selectCls}>
              <option value="">Not set</option>
              {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-zinc-600 dark:text-zinc-400 mb-1">Next follow-up</span>
            <input
              type="date"
              value={deal.nextDate ? deal.nextDate.slice(0, 10) : ""}
              onChange={(e) => patch({ nextDate: e.target.value || null })}
              className={selectCls}
            />
          </label>
          <label className="text-sm">
            <span className="block text-zinc-600 dark:text-zinc-400 mb-1">Value (USD)</span>
            <input
              type="number"
              min={0}
              defaultValue={deal.valueUsd ?? ""}
              onBlur={(e) => { if (String(deal.valueUsd ?? "") !== e.target.value) patch({ valueUsd: e.target.value }); }}
              className={`${selectCls} w-28`}
            />
          </label>
        </div>

        {deal.summary && (
          <div className="mt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">{deal.source === "inquiry" ? "Their message" : "Why they may need us"}</div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">{deal.summary}</p>
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
          <p className="mt-2 text-sm text-zinc-500">Ask Lana whether this is a buyer, a supply partner, a sales pitch or spam, and what to find out next.</p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLES[triage.kind] || KIND_STYLES.other}`}>{KIND_LABELS[triage.kind] || triage.kind}</span>
              <span className="text-xs text-zinc-500">Fit: <b>{triage.fit}</b></span>
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
            {triage.nextStep && <p className="text-emerald-700 dark:text-emerald-400"><b>Next step:</b> {triage.nextStep}</p>}
          </div>
        )}
      </Panel>

      {/* Composer */}
      <Panel className="p-5 space-y-3">
        <h3 className="font-semibold text-foreground">Write a message</h3>
        <div className="flex flex-wrap gap-1.5">
          {INTENTS.map((i) => (
            <button
              key={i.value}
              onClick={() => setIntent(i.value)}
              className={`rounded-full border px-3 py-1 text-sm ${
                intent === i.value
                  ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={intent === "custom" ? "Tell Lana what to write…" : "Optional: anything Lana should include or avoid"}
            className="h-10 flex-1"
          />
          <Button size="sm" onClick={draft} disabled={drafting || (intent === "custom" && !instruction.trim())} className="h-10">
            <Sparkles size={15} className="mr-1.5" /> {drafting ? "Drafting…" : body ? "Redraft" : "Draft with Lana"}
          </Button>
        </div>

        {warnings.length > 0 && (
          <Notice tone="error">{`Check before sending:\n• ${warnings.join("\n• ")}`}</Notice>
        )}

        <label className="block text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">To</span>
          <Input value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="name@company.com (leave empty if you'll send on LinkedIn)" className="h-10 mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Subject</span>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-10 mt-1" />
        </label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className={areaCls} placeholder="Draft with Lana, or write your own message." />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={send} disabled={sending || !body.trim() || !subject.trim() || !toEmail.trim()}>
            <Send size={15} className="mr-1.5" /> {sending ? "Sending…" : "Send from info@"}
          </Button>
          <Button size="sm" variant="outline" onClick={logElsewhere} disabled={sending || !body.trim()} title="Copy the text and record it as sent on LinkedIn or a contact form">
            <ClipboardCheck size={15} className="mr-1.5" /> Copy &amp; log as sent elsewhere
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(body)} disabled={!body.trim()}>
            <Copy size={15} className="mr-1.5" /> Copy
          </Button>
          {aiDrafted && <span className="text-xs text-zinc-500">Drafted by Lana: read it before sending.</span>}
        </div>
      </Panel>

      {/* History */}
      <Panel className="p-5 space-y-3">
        <h3 className="font-semibold text-foreground">History</h3>
        <div className="flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a private note (call outcome, their reply…)" className="h-10 flex-1" />
          <Button size="sm" variant="outline" onClick={addNote} disabled={!note.trim()} className="h-10">
            <StickyNote size={15} className="mr-1.5" /> Add
          </Button>
        </div>
        {deal.messages.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing sent yet.</p>
        ) : (
          <ol className="space-y-3">
            {[...deal.messages].reverse().map((m) => (
              <li key={m.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {m.kind === "email" ? `E-mailed ${m.toEmail}` : m.kind === "logged" ? "Sent elsewhere" : "Note"}
                  </span>
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                  {m.aiDrafted && <span className="rounded-full bg-violet-50 px-2 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">Lana draft</span>}
                </div>
                {m.subject && <div className="mt-1 font-medium text-foreground">{m.subject}</div>}
                <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{m.body}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function NewDealPanel({ onDone, onError }: { onDone: (id: string) => void; onError: (t: string) => void }) {
  const [f, setF] = useState({ company: "", contactName: "", contactEmail: "", contactUrl: "", summary: "" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      onDone((await api<{ deal: { id: string } }>("/api/admin/deals", { method: "POST", body: JSON.stringify(f) })).deal.id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel className="p-5 space-y-3">
      <h3 className="font-semibold text-foreground">New deal</h3>
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

function ImportPanel({ onDone, onError }: { onDone: (r: { added: number; skipped: number }) => void; onError: (t: string) => void }) {
  const [csv, setCsv] = useState("");
  const [saving, setSaving] = useState(false);
  const run = async () => {
    setSaving(true);
    try {
      onDone(await api<{ added: number; skipped: number }>("/api/admin/deals/import", { method: "POST", body: JSON.stringify({ csv }) }));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel className="p-5 space-y-3">
      <h3 className="font-semibold text-foreground">Import leads</h3>
      <p className="text-sm text-zinc-500">
        Paste a CSV with a header row in the <code>growth/leads.csv</code> format (company, contact_name, contact_title, contact_url, evidence_url,
        evidence, stage, next_step, next_date, notes; contact_email optional). Companies already in Deals are skipped. Or choose a file:
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }}
        className="text-sm"
      />
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} className={`${areaCls} font-mono`} placeholder="id,date_added,company,…" />
      <Button size="sm" onClick={run} disabled={saving || !csv.trim()}>{saving ? "Importing…" : "Import"}</Button>
    </Panel>
  );
}

function FactsPanel({ onSaved }: { onSaved: () => void }) {
  const [facts, setFacts] = useState<string | null>(null);
  const [defaults, setDefaults] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ facts: string; defaults: string }>("/api/admin/deals/facts")
      .then((r) => { setFacts(r.facts); setDefaults(r.defaults); })
      .catch((e) => setError((e as Error).message));
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ facts: string }>("/api/admin/deals/facts", { method: "PUT", body: JSON.stringify({ facts }) });
      setFacts(r.facts);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Panel className="p-5 space-y-3">
      <h3 className="font-semibold text-foreground">Lana&apos;s facts</h3>
      <p className="text-sm text-zinc-500">
        Lana may only say what is written here about HustleClickGH. Keep it true and current: add a price range or a calendar link here if you want her to use them.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
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
