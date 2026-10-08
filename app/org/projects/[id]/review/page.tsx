"use client";

// Client (organization) review: check each submission's recording + the details
// collected with it, and mark it Pass or Fail. Verdicts are advisory — the
// HustleClickGH team sees them and makes the final approve/reject decision.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OrgLayout } from "@/components/org-layout";
import { CaptureTraceView } from "@/components/capture-trace-view";
import type { CaptureTrace, MetadataField } from "@/lib/project-config";
import { formatDate, cn } from "@/lib/utils";
import { ArrowLeft, Check, X, Loader2, MapPin, RotateCcw, ClipboardCheck, ExternalLink } from "lucide-react";
import { SkeletonList, PageHeader, Segmented } from "@/components/ui/page-kit";

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
}

type Filter = "todo" | "pass" | "fail" | "all";

export default function OrgReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState("");
  const [review, setReview] = useState({ toReview: 0, pass: 0, fail: 0 });
  const [filter, setFilter] = useState<Filter>("todo");
  const [subs, setSubs] = useState<Sub[]>([]);
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failing, setFailing] = useState<string | null>(null); // submission whose fail-reason box is open
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const loadSummary = useCallback(() => {
    fetch(`/api/org/projects/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.project) setTitle(d.project.title);
      if (d?.review) setReview(d.review);
    }).catch(() => {});
  }, [id]);

  const load = useCallback(async (f: Filter, skip = 0) => {
    const res = await fetch(`/api/org/projects/${id}/submissions?filter=${f}&skip=${skip}`);
    if (!res.ok) throw new Error("Couldn't load submissions");
    return res.json() as Promise<{ submissions: Sub[]; fields: MetadataField[]; total: number }>;
  }, [id]);

  useEffect(() => {
    let alive = true;
    load(filter)
      .then((d) => { if (!alive) return; setSubs(d.submissions); setFields(d.fields); setTotal(d.total); setError(""); })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filter, load]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const changeFilter = (f: Filter) => { setLoading(true); setFilter(f); };

  const more = async () => {
    setLoadingMore(true);
    try { const d = await load(filter, subs.length); setSubs((p) => [...p, ...d.submissions]); setTotal(d.total); }
    catch { setError("Couldn't load more"); }
    finally { setLoadingMore(false); }
  };

  const decide = async (sub: Sub, verdict: "pass" | "fail" | null) => {
    setBusy(sub.id);
    setError("");
    try {
      const res = await fetch(`/api/org/projects/${id}/submissions/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, note: notes[sub.id] || "" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.message || "Couldn't save"); return; }
      setFailing(null);
      // Leave the current list if the item no longer belongs to this filter.
      const stillHere = filter === "all" || (filter === "todo" ? verdict === null : verdict === filter);
      setSubs((prev) => stillHere
        ? prev.map((s) => (s.id === sub.id ? { ...s, clientVerdict: verdict, clientNote: d.note ?? null, clientReviewedAt: verdict ? new Date().toISOString() : null } : s))
        : prev.filter((s) => s.id !== sub.id));
      if (!stillHere) setTotal((t) => Math.max(0, t - 1));
      loadSummary();
    } catch {
      setError("Couldn't save");
    } finally {
      setBusy(null);
    }
  };

  const labelOf = (k: string) => fields.find((f) => f.key === k)?.label ?? k;
  const typeOf = (k: string) => fields.find((f) => f.key === k)?.type;

  const tabs: { value: Filter; label: string; count?: number }[] = [
    { value: "todo", label: "To review", count: review.toReview },
    { value: "pass", label: "Passed", count: review.pass },
    { value: "fail", label: "Failed", count: review.fail },
    { value: "all", label: "All" },
  ];

  return (
    <OrgLayout>
      <div className="space-y-5">
        <Link href={`/org/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-foreground"><ArrowLeft size={15} />Project overview</Link>

        <PageHeader icon={ClipboardCheck} eyebrow={title || "Project"} title="Review submissions"
          description={`${review.toReview} to review · ${review.pass} passed · ${review.fail} failed`} />

        <p className="text-sm text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
          Check each recording and its details, then mark it <strong className="text-emerald-600">Pass</strong> or <strong className="text-red-600">Fail</strong>.
          Our team uses your verdicts before final approval. Contributors are shown by reference ID only.
        </p>

        <div className="sticky top-14 z-20 -mx-4 bg-zinc-50/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 dark:bg-zinc-950/90">
          <div className="max-w-full overflow-x-auto">
            <Segmented<Filter> value={filter} onChange={changeFilter} options={tabs} />
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {loading ? (
          <SkeletonList />
        ) : subs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 py-14 text-center text-zinc-500">
            {filter === "todo" ? "All caught up — nothing waiting for review." : "Nothing here yet."}
          </div>
        ) : (
          <div className="space-y-4">
            {subs.map((s) => {
              const place = s.location ? [s.location.city, s.location.region, s.location.country].filter(Boolean).join(", ") : "";
              const metaEntries = Object.entries(s.metadata);
              return (
                <div key={s.id} className={cn("rounded-2xl border bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden",
                  s.clientVerdict === "pass" ? "border-emerald-300 dark:border-emerald-800" : s.clientVerdict === "fail" ? "border-red-300 dark:border-red-800" : "border-zinc-200 dark:border-zinc-800")}>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{s.contributorRef}</p>
                      <p className="text-xs text-zinc-500">{formatDate(s.submittedAt)}{s.gender ? ` · ${s.gender}` : ""}{s.language ? ` · ${s.language}` : ""}</p>
                    </div>
                    {s.clientVerdict && (
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                        s.clientVerdict === "pass" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300")}>
                        {s.clientVerdict === "pass" ? <Check size={13} /> : <X size={13} />}{s.clientVerdict === "pass" ? "Passed" : "Failed"}
                      </span>
                    )}
                  </div>

                  <div className="p-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    {/* Recording */}
                    <div className="space-y-2">
                      {s.files.map((f, i) => (
                        <div key={`${f.url}-${i}`}>
                          {f.type.startsWith("video") ? (
                            <video src={f.url} controls playsInline preload="metadata" className="w-full max-h-[420px] rounded-xl bg-black object-contain" />
                          ) : f.type.startsWith("audio") ? (
                            <audio src={f.url} controls className="w-full" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.url} alt={f.name} className="w-full max-h-[420px] rounded-xl object-contain bg-zinc-50" />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Details */}
                    <div className="space-y-3 text-sm min-w-0">
                      {metaEntries.length > 0 && (
                        <dl className="space-y-2">
                          {metaEntries.map(([k, v]) => (
                            <div key={k}>
                              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{labelOf(k)}</dt>
                              <dd className="mt-0.5 text-foreground break-words">
                                {typeOf(k) === "photo" ? (
                                  <a href={v} target="_blank" rel="noreferrer" className="inline-block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={v} alt={labelOf(k)} className="h-28 rounded-lg border border-zinc-200 object-cover" />
                                  </a>
                                ) : v === "yes" || v === "no" ? (v === "yes" ? "Yes" : "No") : v}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {(place || s.location?.lat !== undefined) && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Location</p>
                          {place && <p className="mt-0.5 flex items-center gap-1 text-foreground"><MapPin size={13} className="text-emerald-600" />{place}</p>}
                          {s.location?.lat !== undefined && s.location?.lng !== undefined && (
                            <a href={`https://www.google.com/maps?q=${s.location.lat},${s.location.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                              GPS {s.location.lat.toFixed(4)}, {s.location.lng.toFixed(4)}<ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      )}
                      {s.capture && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1">Guided task</p>
                          <CaptureTraceView trace={s.capture} />
                        </div>
                      )}
                      {s.clientNote && <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-red-700 dark:text-red-300"><strong>Reason:</strong> {s.clientNote}</p>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 space-y-2">
                    {failing === s.id && (
                      <textarea
                        autoFocus rows={2} maxLength={1000}
                        value={notes[s.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                        placeholder="Why does it fail? e.g. face not visible, wrong ID card, dots skipped…"
                        className="w-full rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-red-500/10"
                      />
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {s.clientVerdict ? (
                        <button onClick={() => decide(s, null)} disabled={busy === s.id} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50">
                          <RotateCcw size={14} />Change verdict
                        </button>
                      ) : failing === s.id ? (
                        <>
                          <button onClick={() => decide(s, "fail")} disabled={busy === s.id || !(notes[s.id] ?? "").trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                            {busy === s.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}Confirm fail
                          </button>
                          <button onClick={() => setFailing(null)} className="rounded-xl px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => decide(s, "pass")} disabled={busy === s.id} className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                            {busy === s.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}Pass
                          </button>
                          <button onClick={() => setFailing(s.id)} disabled={busy === s.id} className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl border-2 border-red-200 dark:border-red-900 px-5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50">
                            <X size={15} />Fail
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {subs.length < total && (
              <button onClick={more} disabled={loadingMore} className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50">
                {loadingMore ? "Loading…" : `Load more (${total - subs.length} left)`}
              </button>
            )}
          </div>
        )}
      </div>
    </OrgLayout>
  );
}
