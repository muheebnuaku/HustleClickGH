"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { PageHeader, Panel, Notice, Segmented, EmptyState, SkeletonList } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Radar, Search, ExternalLink, Bookmark, X, RotateCcw, Play, Settings2, Download, ChevronLeft, ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Item {
  id: string;
  url: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  snippet: string | null;
  postedAt: string | null;
  score: number | null;
  verdict: string;
  leadType: string | null;
  reason: string | null;
  angle: string | null;
  status: string;
  createdAt: string;
}

interface RunResult {
  at: string;
  fetched: number;
  kept: number;
  added: number;
  scored: number;
  backlog: number;
  digestSent: boolean;
  errors: string[];
}

interface Sources {
  greenhouse: string[];
  lever: string[];
  ashby: string[];
  arxiv: string[];
  hn: string[];
  rss: { label: string; url: string }[];
  keywords: string[];
}

type View = "leads" | "maybe" | "new" | "saved" | "dismissed";

const VIEW_LABELS: Record<View, string> = {
  leads: "Strong (70+)",
  maybe: "Maybe (40–69)",
  new: "All new",
  saved: "Saved",
  dismissed: "Dismissed",
};

const VERDICT_STYLES: Record<string, string> = {
  lead: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  maybe: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  noise: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  no_go: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  unscored: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

function csvCell(v: string | null | undefined) {
  const s = (v ?? "").replace(/\r?\n/g, " ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Same columns as growth/leads.csv, so saved items can be pasted straight into the pipeline.
function toLeadsCsv(items: Item[]) {
  const head = "id,date_added,company,type,country,contact_name,contact_title,contact_url,evidence_url,evidence,stage,next_step,next_date,notes";
  const today = new Date().toISOString().slice(0, 10);
  const rows = items.map((i) =>
    [
      "", today, i.company || i.source, i.leadType || "", i.location || "", "", "", "", i.url,
      [i.title, i.reason].filter(Boolean).join(": "), "new", i.angle ? `Pitch: ${i.angle}` : "", "", `Radar ${i.source}, score ${i.score ?? "-"}`,
    ].map(csvCell).join(","),
  );
  return [head, ...rows].join("\n");
}

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);

export default function AdminRadarPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Partial<Record<View, number>>>({});
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [view, setView] = useState<View>("leads");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runNote, setRunNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showSources, setShowSources] = useState(false);
  const [draft, setDraft] = useState<Record<keyof Sources, string> | null>(null);
  const [savingSources, setSavingSources] = useState(false);
  const [sourcesNote, setSourcesNote] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ view, page: String(page) });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/radar?${params.toString()}`);
      const data = await res.json();
      setItems(data.items || []);
      setCounts(data.counts || {});
      setLastRun(data.lastRun || null);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error("Failed to fetch Radar:", error);
    } finally {
      setIsLoading(false);
    }
  }, [view, page, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runNow = async () => {
    setRunning(true);
    setRunNote(null);
    try {
      const res = await fetch("/api/admin/radar", { method: "POST" });
      // A timed-out or crashed function returns Vercel's plain-text error page, not JSON.
      const r: (RunResult & { message?: string }) | null = await res.json().catch(() => null);
      if (!r) {
        throw new Error(
          `The run did not finish (server returned ${res.status}). Posts fetched before the cut-off are kept; reload the page, and run again to score the rest.`,
        );
      }
      if (!res.ok) throw new Error(r.message || "Run failed");
      setRunNote({
        tone: r.errors.length ? "error" : "success",
        text:
          `Fetched ${r.fetched} posts, ${r.kept} relevant to our keywords, ${r.added} new, ${r.scored} scored` +
          (r.backlog ? `, ${r.backlog} waiting to be scored (next run)` : "") +
          "." +
          (r.errors.length ? `\nProblems:\n• ${r.errors.join("\n• ")}` : ""),
      });
      await fetchData();
    } catch (e) {
      setRunNote({ tone: "error", text: (e as Error).message });
    } finally {
      setRunning(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/admin/radar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((i) => i.id !== id));
      setCounts((c) => ({ ...c, [view]: Math.max(0, (c[view] ?? 1) - 1) }));
    } catch {
      setRunNote({ tone: "error", text: "Could not update that item. Try again." });
    }
  };

  const exportSaved = async () => {
    const res = await fetch(`/api/admin/radar?view=saved&page=1`);
    const data = await res.json();
    let all: Item[] = data.items || [];
    for (let p = 2; p <= (data.pagination?.totalPages || 1); p++) {
      const more = await (await fetch(`/api/admin/radar?view=saved&page=${p}`)).json();
      all = all.concat(more.items || []);
    }
    const blob = new Blob([toLeadsCsv(all)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `radar-saved-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openSources = async () => {
    setShowSources((s) => !s);
    if (draft) return;
    const data = await (await fetch("/api/admin/radar/sources")).json();
    const s: Sources = data.sources;
    setDraft({
      greenhouse: s.greenhouse.join("\n"),
      lever: s.lever.join("\n"),
      ashby: s.ashby.join("\n"),
      arxiv: s.arxiv.join("\n"),
      hn: s.hn.join("\n"),
      rss: s.rss.map((r) => `${r.label} | ${r.url}`).join("\n"),
      keywords: s.keywords.join(", "),
    });
  };

  const saveSources = async () => {
    if (!draft) return;
    setSavingSources(true);
    setSourcesNote(null);
    try {
      const sources: Sources = {
        greenhouse: lines(draft.greenhouse),
        lever: lines(draft.lever),
        ashby: lines(draft.ashby),
        arxiv: lines(draft.arxiv),
        hn: lines(draft.hn),
        rss: lines(draft.rss).map((l) => {
          const [label, url] = l.includes("|") ? l.split("|").map((x) => x.trim()) : ["", l];
          return { label, url };
        }),
        keywords: draft.keywords.split(/[,\n]/).map((k) => k.trim()).filter(Boolean),
      };
      const res = await fetch("/api/admin/radar/sources", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Save failed");
      const saved: Sources = data.sources;
      const dropped = sources.rss.length - saved.rss.length;
      setSourcesNote(`Saved.${dropped > 0 ? ` ${dropped} feed(s) dropped: feed URLs must start with https://.` : ""} New sources are picked up on the next run.`);
    } catch (e) {
      setSourcesNote((e as Error).message);
    } finally {
      setSavingSources(false);
    }
  };

  const field = (key: keyof Sources, label: string, hint: string, rows = 3) => (
    <label className="block">
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
      <span className="block text-xs text-zinc-500 mb-1">{hint}</span>
      <textarea
        value={draft?.[key] ?? ""}
        onChange={(e) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d))}
        rows={rows}
        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm font-mono"
      />
    </label>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PageHeader
          icon={Radar}
          title="Radar"
          description={
            lastRun
              ? `Public posts that may be projects for us, scored by AI. Runs daily; last run ${formatDate(lastRun.at)}.`
              : "Public posts that may be projects for us, scored by AI. Runs daily."
          }
          actions={
            <>
              <Button size="sm" variant="outline" onClick={openSources}>
                <Settings2 size={15} className="mr-1.5" /> Sources
              </Button>
              <Button size="sm" onClick={runNow} disabled={running}>
                <Play size={15} className="mr-1.5" /> {running ? "Running… (up to a minute)" : "Run now"}
              </Button>
            </>
          }
        />

        {runNote && <Notice tone={runNote.tone}>{runNote.text}</Notice>}

        {showSources && (
          <Panel className="p-5 space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Only official public feeds are read. For anything else, create a{" "}
              <a href="https://www.google.com/alerts" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Google Alert</a>{" "}
              (for example <i>&quot;data collection&quot; Ghana voice</i>), choose <b>Deliver to: RSS feed</b>, and paste the feed link below.
            </p>
            {!draft ? (
              <SkeletonList rows={2} />
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  {field("greenhouse", "Greenhouse boards", "One company per line, as in boards.greenhouse.io/<name>")}
                  {field("lever", "Lever sites", "One per line, as in jobs.lever.co/<name>")}
                  {field("ashby", "Ashby boards", "One per line, as in jobs.ashbyhq.com/<name>")}
                </div>
                {field("rss", "RSS / Google Alerts feeds", "One per line: Label | https://feed-url", 4)}
                <div className="grid gap-4 md:grid-cols-2">
                  {field("arxiv", "arXiv searches", "One arXiv query per line, e.g. abs:african AND abs:speech")}
                  {field("hn", "Hacker News searches", "One phrase per line")}
                </div>
                {field("keywords", "Job-board keywords", "Job posts are kept only if their title or location mentions one of these (comma-separated)", 3)}
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" onClick={saveSources} disabled={savingSources}>{savingSources ? "Saving…" : "Save sources"}</Button>
                  {sourcesNote && <span className="text-sm text-zinc-600 dark:text-zinc-400">{sourcesNote}</span>}
                </div>
              </>
            )}
          </Panel>
        )}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented<View>
            options={(Object.keys(VIEW_LABELS) as View[]).map((v) => ({ value: v, label: VIEW_LABELS[v], count: counts[v] }))}
            value={view}
            onChange={(v) => { setView(v); setPage(1); setExpanded(null); }}
          />
          <div className="flex gap-2">
            <div className="relative flex-1 lg:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search title, company, text…"
                className="pl-9 h-10"
              />
            </div>
            {view === "saved" && (counts.saved ?? 0) > 0 && (
              <Button size="sm" variant="outline" onClick={exportSaved} className="h-10">
                <Download size={15} className="mr-1.5" /> Leads CSV
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <SkeletonList />
        ) : items.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Radar}
              title={lastRun ? "Nothing here" : "No runs yet"}
              description={lastRun ? "Try another tab, or run the Radar now." : "Press Run now to fetch the first posts."}
            />
          </Panel>
        ) : (
          <div className="space-y-3">
            {items.map((i) => (
              <Panel key={i.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums ${VERDICT_STYLES[i.verdict] || VERDICT_STYLES.unscored}`}>
                        {i.score ?? "–"} · {i.verdict.replace("_", "-")}
                      </span>
                      {i.leadType && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{i.leadType}</span>
                      )}
                      <span className="text-xs text-zinc-500">{i.source}</span>
                    </div>
                    <a href={i.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-start gap-1.5 font-semibold text-foreground hover:text-blue-600">
                      <span className="break-words">{i.title}</span>
                      <ExternalLink size={14} className="mt-1 shrink-0 opacity-60" />
                    </a>
                    <div className="mt-0.5 text-sm text-zinc-500 flex flex-wrap gap-x-3">
                      {i.company && <span>{i.company}</span>}
                      {i.location && <span>{i.location}</span>}
                      <span>{i.postedAt ? `Posted ${formatDate(i.postedAt)}` : `Found ${formatDate(i.createdAt)}`}</span>
                    </div>
                    {i.reason && <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{i.reason}</p>}
                    {i.angle && <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400"><b>Pitch:</b> {i.angle}</p>}
                    {i.snippet && (
                      <>
                        <button onClick={() => setExpanded(expanded === i.id ? null : i.id)} className="mt-2 text-sm text-blue-600 hover:underline">
                          {expanded === i.id ? "Hide excerpt" : "Show excerpt"}
                        </button>
                        {expanded === i.id && (
                          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">{i.snippet}</p>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    {i.status === "new" ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setStatus(i.id, "saved")} title="Save as a lead">
                          <Bookmark size={15} /><span className="ml-1.5 hidden sm:inline">Save</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatus(i.id, "dismissed")} title="Dismiss">
                          <X size={15} /><span className="ml-1.5 hidden sm:inline">Dismiss</span>
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(i.id, "new")} title="Move back to new">
                        <RotateCcw size={15} /><span className="ml-1.5 hidden sm:inline">Restore</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
