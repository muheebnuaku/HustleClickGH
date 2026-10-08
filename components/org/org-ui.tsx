"use client";

// Small building blocks shared by the client portal pages.

import Link from "next/link";
import { Mic, Video, ChevronRight, ClipboardCheck } from "lucide-react";
import { cn, formatUsd } from "@/lib/utils";
import { orgStatusLabel } from "@/lib/org-status";

export interface OrgProject {
  id: string; title: string; projectType: string; status: string; reward: number;
  maxSubmissions: number; currentSubmissions: number; budget: number; spent: number; createdAt?: string;
  counts: { pending: number; approved: number; rejected: number };
  access?: "owner" | "review"; canReview?: boolean; toReview?: number;
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500", pending_review: "bg-amber-500", paused: "bg-zinc-400", completed: "bg-blue-500", rejected: "bg-red-500", draft: "bg-zinc-400",
};
const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  pending_review: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  completed: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  rejected: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_PILL[status] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status] ?? "bg-zinc-400")} />
      {orgStatusLabel(status)}
    </span>
  );
}

export function TypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  const video = type === "video" || type === "face";
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl", video ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300" : "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300")} style={{ width: size + 22, height: size + 22 }}>
      {video ? <Video size={size} /> : <Mic size={size} />}
    </span>
  );
}

export function Progress({ value, max, className, tone = "emerald" }: { value: number; max: number; className?: string; tone?: "emerald" | "blue" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800", className)}>
      <div className={cn("h-full rounded-full transition-[width]", tone === "blue" ? "bg-blue-500" : "bg-gradient-to-r from-emerald-500 to-teal-500")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A project as a clickable card: type, status, collection progress, money or review count. */
export function ProjectCard({ p }: { p: OrgProject }) {
  const owner = p.access !== "review";
  const pct = p.maxSubmissions ? Math.round((p.counts.approved / p.maxSubmissions) * 100) : 0;
  return (
    <Link
      href={`/org/projects/${p.id}`}
      className="group flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-700"
    >
      <div className="flex items-start gap-3">
        <TypeIcon type={p.projectType} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{p.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={p.status} />
            {!owner && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Review access</span>}
          </div>
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-500" />
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="text-zinc-500"><strong className="text-sm text-foreground tabular-nums">{p.counts.approved}</strong> / {p.maxSubmissions} collected</span>
          <span className="font-medium tabular-nums text-zinc-500">{pct}%</span>
        </div>
        <Progress value={p.counts.approved} max={p.maxSubmissions} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
        {p.canReview && (p.toReview ?? 0) > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-600"><ClipboardCheck size={13} />{p.toReview} to review</span>
        ) : (
          <span>{p.counts.pending} in checking</span>
        )}
        {owner && <span className="tabular-nums">{formatUsd(p.spent)} of {formatUsd(p.budget)}</span>}
      </div>
    </Link>
  );
}
