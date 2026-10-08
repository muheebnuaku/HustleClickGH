"use client";

// Client (organization) review workspace: a queue of submissions on the left,
// the selected one on the right (player, details, location, guided-task record)
// with a Pass / Fail bar. Verdicts are advisory and shared by every client that
// reviews the project — the HustleClickGH team makes the final approve/reject call.
// Keyboard: P = pass, F = fail, ← / → = previous / next.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OrgLayout } from "@/components/org-layout";
import { CaptureTraceView } from "@/components/capture-trace-view";
import { Skeleton } from "@/components/ui/page-kit";
import type { CaptureTrace, MetadataField } from "@/lib/project-config";
import { formatDate, cn } from "@/lib/utils";
import {
  ArrowLeft, Check, X, MapPin, RotateCcw, ExternalLink, Search, ChevronLeft, ChevronRight, Keyboard,
  ClipboardCheck, Video, Music, Image as ImageIcon, Loader2, PartyPopper,
} from "lucide-react";

interface Sub {
  id: string;
  contributorRef: string;
  submittedAt: string;
  gender: string | null;
  language: string | null;
  files: { url: string; name: string; type: string; sizeMB: number }[];
  metadata: Record<string, string>;
  location: { country?: string | null; region?: string | null; city?: string | null; lat?: number; lng?: number; accuracyM?: number | null } | null;
  capture: CaptureTrace | null;
  clientVerdict: "pass" | "fail" | null;
  clientNote: string | null;
  clientReviewedAt: string | null;
  reviewedBy?: string | null;
  reviewedByMe?: boolean;
}
type Filter = "todo" | "pass" | "fail" | "all";

const FAIL_REASONS = ["Face not visible", "Poor lighting", "Blurry / out of focus", "Wrong or unclear ID card", "Task not completed", "Audio problem", "Wrong person / duplicate"];

export default function OrgReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState("");
  const [review, setReview] = useState({ toReview: 0, pass: 0, fail: 0 });
  const [filter, setFilter] = useState<Filter>("todo");
  const [q, setQ] = useState("");
  const [subs, setSubs] = useState<Sub[]>([]);
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadSummary = useCallback(() => {
    fetch(`/api/org/projects/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.project) setTitle(d.project.title);
      if (d?.review) setReview(d.review);
    }).catch(() => {});
  }, [id]);

  const fetchPage = useCallback(async (f: Filter, search: string, skip = 0) => {
    const res = await fetch(`/api/org/projects/${id}/submissions?filter=${f}&skip=${skip}${search ? `&q=${encodeURIComponent(search)}` : ""}`);
    if (!res.ok) throw new Error("Couldn't load submissions");
    return res.json() as Promise<{ submissions: Sub[]; fields: MetadataField[]; total: number }>;
  }, [id]);

  // (Re)load the queue when the filter or search changes.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      fetchPage(filter, q.trim())
        .then((d) => {
          if (!alive) return;
          setSubs(d.submissions); setFields(d.fields); setTotal(d.total); setError("");
          setSelected((cur) => (cur && d.submissions.some((s) => s.id === cur) ? cur : d.submissions[0]?.id ?? null));
        })
        .catch((e) => alive && setError(e.message))
        .finally(() => alive && setLoading(false));
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [filter, q, fetchPage]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const changeFilter = (f: Filter) => { setLoading(true); setFilter(f); setFailOpen(false); };

  const more = async () => {
    setLoadingMore(true);
    try { const d = await fetchPage(filter, q.trim(), subs.length); setSubs((p) => [...p, ...d.submissions]); setTotal(d.total); }
    catch { setError("Couldn't load more"); }
    finally { setLoadingMore(false); }
  };

  const idx = subs.findIndex((s) => s.id === selected);
  const sub = idx >= 0 ? subs[idx] : null;
  const go = useCallback((delta: number) => {
    if (!subs.length) return;
    const next = Math.min(subs.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + delta));
    setSelected(subs[next].id);
    setFailOpen(false); setReason("");
  }, [subs, idx]);

  const decide = useCallback(async (verdict: "pass" | "fail" | null, note = "") => {
    if (!sub || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/org/projects/${id}/submissions/${sub.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, note }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message || "Couldn't save"); return; }
      setFailOpen(false); setReason("");
      setToast(verdict === "pass" ? "Marked Pass" : verdict === "fail" ? "Marked Fail" : "Verdict cleared");
      setTimeout(() => setToast(null), 1400);
      const stillHere = filter === "all" || (filter === "todo" ? verdict === null : verdict === filter);
      const updated: Sub = { ...sub, clientVerdict: verdict, clientNote: d.note ?? null, clientReviewedAt: verdict ? new Date().toISOString() : null, reviewedBy: d.reviewedBy ?? null, reviewedByMe: !!verdict };
      if (stillHere) {
        setSubs((p) => p.map((s) => (s.id === sub.id ? updated : s)));
        // Move on to the next one still needing a verdict, if any.
        const after = subs.slice(idx + 1).find((s) => !s.clientVerdict) ?? subs.find((s) => !s.clientVerdict && s.id !== sub.id);
        if (verdict && after) setSelected(after.id);
      } else {
        const rest = subs.filter((s) => s.id !== sub.id);
        setSubs(rest);
        setTotal((t) => Math.max(0, t - 1));
        setSelected(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
        if (!rest.length) setMobileOpen(false);
      }
      loadSummary();
    } catch {
      setError("Couldn't save");
    } finally {
      setBusy(false);
    }
  }, [sub, busy, id, filter, subs, idx, loadSummary]);

  // Keyboard shortcuts (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight" || e.key === "j") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "k") { e.preventDefault(); go(-1); }
      else if ((e.key === "p" || e.key === "P") && sub && !sub.clientVerdict) { e.preventDefault(); decide("pass"); }
      else if ((e.key === "f" || e.key === "F") && sub && !sub.clientVerdict) { e.preventDefault(); setFailOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, decide, sub]);

  // Keep the selected row visible in the queue.
  useEffect(() => {
    listRef.current?.querySelector(`[data-id="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const reviewedTotal = review.pass + review.fail;
  const allTotal = reviewedTotal + review.toReview;
  const pct = allTotal ? Math.round((reviewedTotal / allTotal) * 100) : 0;
  const labelOf = useCallback((k: string) => fields.find((f) => f.key === k)?.label ?? k.replace(/_/g, " "), [fields]);
  const typeOf = useCallback((k: string) => fields.find((f) => f.key === k)?.type, [fields]);

  return (
    <OrgLayout>
      <div className="space-y-4">
        {/* Header + progress */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link href={`/org/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-foreground"><ArrowLeft size={15} />Project overview</Link>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <ClipboardCheck size={22} className="shrink-0 text-emerald-600" />Review submissions
            </h1>
            <p className="truncate text-sm text-zinc-500">{title || " "}</p>
          </div>
          <div className="w-full rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm lg:w-96 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-foreground">{reviewedTotal} of {allTotal} reviewed</span>
              <span className="tabular-nums text-zinc-500">{pct}%</span>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="bg-emerald-500" style={{ width: `${allTotal ? (review.pass / allTotal) * 100 : 0}%` }} />
              <div className="bg-red-500" style={{ width: `${allTotal ? (review.fail / allTotal) * 100 : 0}%` }} />
            </div>
            <div className="mt-2 flex gap-4 text-xs">
              <span className="text-emerald-600"><strong className="tabular-nums">{review.pass}</strong> passed</span>
              <span className="text-red-600"><strong className="tabular-nums">{review.fail}</strong> failed</span>
              <span className="text-amber-600"><strong className="tabular-nums">{review.toReview}</strong> to review</span>
            </div>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Queue */}
          <aside className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)] dark:border-zinc-800 dark:bg-zinc-900/60", mobileOpen && "hidden lg:flex")}>
            <div className="space-y-2.5 border-b border-zinc-100 p-3 dark:border-zinc-800">
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70">
                {([["todo", "To review", review.toReview], ["pass", "Passed", review.pass], ["fail", "Failed", review.fail], ["all", "All", null]] as const).map(([v, label, n]) => (
                  <button key={v} type="button" onClick={() => changeFilter(v)}
                    className={cn("rounded-lg px-1 py-1.5 text-center text-xs font-medium leading-tight transition-colors", filter === v ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400")}>
                    <span className="block truncate">{label}</span>
                    {n !== null && <span className="block text-[10px] tabular-nums opacity-60">{n}</span>}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input value={q} onChange={(e) => { setLoading(true); setQ(e.target.value); }} placeholder="Find by contributor ID" className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-700 dark:bg-zinc-950" />
              </div>
            </div>
            <div ref={listRef} className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
              ) : subs.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  {filter === "todo" && !q ? <PartyPopper size={28} className="mx-auto mb-2 text-emerald-500" /> : <Search size={24} className="mx-auto mb-2 text-zinc-300" />}
                  <p className="text-sm font-medium text-foreground">{filter === "todo" && !q ? "All caught up" : "Nothing here"}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{filter === "todo" && !q ? "Every submission has a verdict." : "Try another filter or search."}</p>
                </div>
              ) : (
                <ul className="p-1.5">
                  {subs.map((s) => {
                    const kind = s.files[0]?.type ?? "";
                    const KindIcon = kind.startsWith("video") ? Video : kind.startsWith("audio") ? Music : ImageIcon;
                    const on = s.id === selected;
                    return (
                      <li key={s.id} data-id={s.id}>
                        <button type="button" onClick={() => { setSelected(s.id); setMobileOpen(true); setFailOpen(false); setReason(""); }}
                          className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors", on ? "bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-900" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60")}>
                          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", s.clientVerdict === "pass" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15" : s.clientVerdict === "fail" ? "bg-red-100 text-red-700 dark:bg-red-500/15" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800")}>
                            {s.clientVerdict === "pass" ? <Check size={16} /> : s.clientVerdict === "fail" ? <X size={16} /> : <KindIcon size={16} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{s.contributorRef}</span>
                            <span className="block truncate text-xs text-zinc-500">{formatDate(s.submittedAt)}{s.gender ? ` · ${s.gender}` : ""}{s.location?.city ? ` · ${s.location.city}` : ""}</span>
                          </span>
                          {s.clientVerdict && !s.reviewedByMe && s.reviewedBy && <span className="shrink-0 truncate text-[10px] text-zinc-400">{s.reviewedBy}</span>}
                        </button>
                      </li>
                    );
                  })}
                  {subs.length < total && (
                    <li className="p-1.5">
                      <button onClick={more} disabled={loadingMore} className="w-full rounded-lg border border-zinc-200 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                        {loadingMore ? "Loading…" : `Load more (${total - subs.length} left)`}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
            <p className="hidden items-center gap-1.5 border-t border-zinc-100 px-3 py-2 text-[11px] text-zinc-400 lg:flex dark:border-zinc-800"><Keyboard size={12} /><kbd className="font-mono">P</kbd> pass · <kbd className="font-mono">F</kbd> fail · <kbd className="font-mono">←</kbd><kbd className="font-mono">→</kbd> move</p>
          </aside>

          {/* Detail */}
          <section className={cn("min-w-0", !mobileOpen && "hidden lg:block", mobileOpen && "fixed inset-0 z-40 overflow-y-auto bg-zinc-50 pb-28 lg:static lg:z-auto lg:overflow-visible lg:bg-transparent lg:pb-0 dark:bg-zinc-950 lg:dark:bg-transparent")}>
            {!sub ? (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">
                {loading ? <Loader2 className="animate-spin text-zinc-300" /> : "Pick a submission from the list."}
              </div>
            ) : (
              <div className="space-y-4 lg:pb-0">
                {/* Mobile top bar */}
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-white/90 px-3 py-2.5 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
                  <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800" aria-label="Back to list"><ArrowLeft size={18} /></button>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{sub.contributorRef}</span>
                  <span className="text-xs tabular-nums text-zinc-500">{idx + 1} / {subs.length}</span>
                  <button onClick={() => go(-1)} disabled={idx <= 0} className="rounded-lg p-2 disabled:opacity-30" aria-label="Previous"><ChevronLeft size={18} /></button>
                  <button onClick={() => go(1)} disabled={idx >= subs.length - 1} className="rounded-lg p-2 disabled:opacity-30" aria-label="Next"><ChevronRight size={18} /></button>
                </div>

                <div className="space-y-4 px-3 lg:px-0">
                  {/* Title row (desktop) */}
                  <div className="hidden items-center gap-3 lg:flex">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-foreground">{sub.contributorRef}</p>
                      <p className="text-xs text-zinc-500">Submitted {formatDate(sub.submittedAt)}{sub.gender ? ` · ${sub.gender}` : ""}{sub.language ? ` · ${sub.language}` : ""}</p>
                    </div>
                    <VerdictBadge sub={sub} />
                    <div className="flex items-center gap-1">
                      <button onClick={() => go(-1)} disabled={idx <= 0} className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" aria-label="Previous"><ChevronLeft size={16} /></button>
                      <span className="px-1 text-xs tabular-nums text-zinc-500">{idx + 1} / {subs.length}</span>
                      <button onClick={() => go(1)} disabled={idx >= subs.length - 1} className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800" aria-label="Next"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                  <div className="lg:hidden"><VerdictBadge sub={sub} /></div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                    {/* Media */}
                    <div className="space-y-3">
                      {sub.files.map((f, i) => <Media key={`${sub.id}-${i}`} file={f} />)}
                    </div>

                    {/* Details */}
                    <div className="space-y-4">
                      {Object.keys(sub.metadata).length > 0 && (
                        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Details</p>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                            {Object.entries(sub.metadata).map(([k, v]) => (
                              <div key={k} className={cn("min-w-0", typeOf(k) === "photo" && "col-span-2")}>
                                <dt className="text-[11px] text-zinc-500">{labelOf(k)}</dt>
                                <dd className="mt-0.5 break-words text-sm font-medium text-foreground">
                                  {typeOf(k) === "photo" ? (
                                    <a href={v} target="_blank" rel="noreferrer" className="group relative inline-block">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={v} alt={labelOf(k)} className="h-36 rounded-xl border border-zinc-200 object-cover transition-opacity group-hover:opacity-90 dark:border-zinc-700" />
                                      <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Open</span>
                                    </a>
                                  ) : v === "yes" ? "Yes" : v === "no" ? "No" : v || "—"}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}

                      {sub.location && (sub.location.city || sub.location.country || sub.location.lat !== undefined) && (
                        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Location</p>
                          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground"><MapPin size={14} className="text-emerald-600" />{[sub.location.city, sub.location.region, sub.location.country].filter(Boolean).join(", ") || "GPS only"}</p>
                          {sub.location.lat !== undefined && sub.location.lng !== undefined && (
                            <a href={`https://www.google.com/maps?q=${sub.location.lat},${sub.location.lng}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                              Open in Maps ({sub.location.lat.toFixed(4)}, {sub.location.lng.toFixed(4)}{sub.location.accuracyM ? ` · ±${Math.round(sub.location.accuracyM)}m` : ""})<ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      )}

                      {sub.capture && (
                        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Recording check</p>
                          <CaptureTraceView trace={sub.capture} />
                        </div>
                      )}

                      {sub.clientVerdict === "fail" && sub.clientNote && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-500/10 dark:text-red-300">
                          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Reason</p>
                          <p className="mt-1">{sub.clientNote}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Verdict bar */}
                  <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur lg:sticky lg:bottom-4 lg:rounded-2xl lg:border lg:shadow-lg dark:border-zinc-800 dark:bg-zinc-950/95">
                    {sub.clientVerdict ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <VerdictBadge sub={sub} big />
                        <span className="text-xs text-zinc-500">Shared with everyone reviewing this project.</span>
                        <button onClick={() => decide(null)} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                          <RotateCcw size={14} />Change verdict
                        </button>
                      </div>
                    ) : failOpen ? (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {FAIL_REASONS.map((r) => (
                            <button key={r} type="button" onClick={() => setReason(r)} className={cn("rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors", reason === r ? "bg-red-600 text-white ring-red-600" : "bg-white text-zinc-700 ring-zinc-200 hover:ring-red-300 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700")}>{r}</button>
                          ))}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000}
                            onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) decide("fail", reason.trim()); if (e.key === "Escape") setFailOpen(false); }}
                            placeholder="Why does it fail? Pick one above or type your own" className="h-11 min-w-0 flex-1 rounded-xl border border-red-200 bg-white px-3.5 text-sm focus:outline-none focus:ring-4 focus:ring-red-500/10 dark:border-red-900 dark:bg-zinc-950" />
                          <div className="flex gap-2">
                            <button onClick={() => decide("fail", reason.trim())} disabled={busy || !reason.trim()} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 sm:flex-none">
                              {busy ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}Confirm fail
                            </button>
                            <button onClick={() => setFailOpen(false)} className="h-11 rounded-xl px-3 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => decide("pass")} disabled={busy} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} />}Pass<kbd className="ml-1 hidden rounded bg-white/20 px-1.5 font-mono text-[10px] lg:inline">P</kbd>
                        </button>
                        <button onClick={() => setFailOpen(true)} disabled={busy} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-500/10">
                          <X size={17} />Fail<kbd className="ml-1 hidden rounded bg-red-100 px-1.5 font-mono text-[10px] lg:inline dark:bg-red-500/20">F</kbd>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <p className="text-center text-xs text-zinc-400">Contributors appear by reference ID only. Your verdicts help our team decide; HustleClickGH makes the final approval.</p>
      </div>

      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg lg:top-20 dark:bg-white dark:text-zinc-900">{toast}</div>
      )}
    </OrgLayout>
  );
}

function VerdictBadge({ sub, big }: { sub: Sub; big?: boolean }) {
  if (!sub.clientVerdict) return <span className={cn("inline-flex items-center rounded-full bg-amber-50 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300", big ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs")}>To review</span>;
  const pass = sub.clientVerdict === "pass";
  const by = sub.reviewedByMe ? "by you" : sub.reviewedBy ? `by ${sub.reviewedBy}` : "";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full font-semibold", pass ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300", big ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs")}>
      {pass ? <Check size={big ? 15 : 13} /> : <X size={big ? 15 : 13} />}{pass ? "Passed" : "Failed"}{by ? ` ${by}` : ""}
    </span>
  );
}

/** Player for one file; video gets playback-speed buttons. */
function Media({ file }: { file: Sub["files"][number] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [rate, setRate] = useState(1);
  const isVideo = file.type.startsWith("video");
  const isAudio = file.type.startsWith("audio");
  const speeds = useMemo(() => [1, 1.5, 2], []);
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      {isVideo ? (
        <video ref={ref} src={file.url} controls playsInline preload="metadata" className="max-h-[62vh] w-full bg-black object-contain" />
      ) : isAudio ? (
        <div className="p-4"><audio src={file.url} controls className="w-full" /></div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt={file.name} className="max-h-[62vh] w-full bg-zinc-50 object-contain dark:bg-zinc-900" />
      )}
      <div className="flex items-center gap-2 border-t border-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">
        <span className="min-w-0 flex-1 truncate">{file.name} · {file.sizeMB.toFixed(1)} MB</span>
        {isVideo && speeds.map((s) => (
          <button key={s} type="button" onClick={() => { setRate(s); if (ref.current) ref.current.playbackRate = s; }}
            className={cn("rounded-md px-1.5 py-0.5 font-medium", rate === s ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-800")}>{s}×</button>
        ))}
        <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">Open<ExternalLink size={11} /></a>
      </div>
    </div>
  );
}
