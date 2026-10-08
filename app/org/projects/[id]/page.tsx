"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OrgLayout } from "@/components/org-layout";
import { PageSkeleton, Panel, EmptyState } from "@/components/ui/page-kit";
import { StatusBadge, TypeIcon, Progress } from "@/components/org/org-ui";
import { formatUsd } from "@/lib/utils";
import {
  ArrowLeft, Download, ShieldCheck, AlertTriangle, ClipboardCheck, ChevronRight, FileJson, FileSpreadsheet,
  Hourglass, CheckCircle2, XCircle, Languages, FolderKanban,
} from "lucide-react";

interface Detail {
  project: { id: string; title: string; description: string; projectType: string; status: string; reward: number; maxSubmissions: number; currentSubmissions: number; budget: number; spent: number; languages: string[]; license?: { key: string; label: string; description: string }; usageTerms?: string | null };
  counts: { pending: number; approved: number; rejected: number };
  approvedReady: number;
  withdrawnCount: number;
  access?: "owner" | "review";
  review?: { toReview: number; pass: number; fail: number };
}

export default function OrgProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/org/projects/${id}`).then((r) => (r.ok ? r.json() : null)).then((data) => alive && setD(data)).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  if (loading) return <OrgLayout><PageSkeleton stats={3} rows={3} /></OrgLayout>;
  if (!d?.project) {
    return (
      <OrgLayout>
        <EmptyState icon={FolderKanban} title="Project not found" description="It may have been removed, or you no longer have access." action={<Link href="/org/projects" className="text-sm font-medium text-emerald-600 hover:underline">Back to projects</Link>} />
      </OrgLayout>
    );
  }

  const p = d.project;
  const owner = d.access !== "review";
  const pct = p.maxSubmissions ? Math.min(100, Math.round((d.counts.approved / p.maxSubmissions) * 100)) : 0;

  return (
    <OrgLayout>
      <div className="space-y-6">
        <Link href="/org/projects" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-foreground"><ArrowLeft size={15} />All projects</Link>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <TypeIcon type={p.projectType} size={20} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground break-words">{p.title}</h1>
                <StatusBadge status={p.status} />
                {!owner && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Review access</span>}
              </div>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500 break-words">{p.description}</p>
            </div>
          </div>
          {d.review && (
            <Link href={`/org/projects/${id}/review`} className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
              <ClipboardCheck size={16} />Review{d.review.toReview ? ` (${d.review.toReview})` : ""}
            </Link>
          )}
        </div>

        {p.status === "pending_review" && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
            <Hourglass size={18} className="mt-0.5 shrink-0" />
            <p><strong>Waiting for approval.</strong> We&apos;re reviewing your request and the price. You&apos;ll be charged from your wallet only when it goes live.</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main */}
          <div className="space-y-6">
            <Panel className="p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-500">Collected</p>
                  <p className="mt-0.5 text-3xl font-semibold tabular-nums text-foreground">{d.counts.approved}<span className="text-lg font-normal text-zinc-400"> / {p.maxSubmissions}</span></p>
                </div>
                <p className="text-2xl font-semibold tabular-nums text-emerald-600">{pct}%</p>
              </div>
              <Progress value={d.counts.approved} max={p.maxSubmissions} className="mt-3 h-2.5" />
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  { icon: Hourglass, label: "Being checked", value: d.counts.pending, cls: "text-amber-600 bg-amber-50 dark:bg-amber-500/10" },
                  { icon: CheckCircle2, label: "Approved", value: d.counts.approved, cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10" },
                  { icon: XCircle, label: "Rejected", value: d.counts.rejected, cls: "text-zinc-500 bg-zinc-100 dark:bg-zinc-800" },
                ].map((t) => (
                  <div key={t.label} className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
                    <span className={`mb-2 flex h-7 w-7 items-center justify-center rounded-lg ${t.cls}`}><t.icon size={15} /></span>
                    <p className="text-lg font-semibold tabular-nums text-foreground">{t.value}</p>
                    <p className="text-xs text-zinc-500">{t.label}</p>
                  </div>
                ))}
              </div>
            </Panel>

            {d.review && (
              <Link href={`/org/projects/${id}/review`} className="group block">
                <Panel className="flex items-center gap-4 p-5 transition-colors group-hover:border-emerald-300 dark:group-hover:border-emerald-700">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white"><ClipboardCheck size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">Quality review</p>
                    <p className="text-sm text-zinc-500">
                      <strong className="text-amber-600">{d.review.toReview}</strong> to review · <span className="text-emerald-600">{d.review.pass} passed</span> · <span className="text-red-600">{d.review.fail} failed</span>
                    </p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5" />
                </Panel>
              </Link>
            )}

            {owner && (
              <Panel className="p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10"><Download size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">Download dataset</p>
                    <p className="mt-0.5 text-sm text-zinc-500">{d.approvedReady} approved item{d.approvedReady === 1 ? "" : "s"} ready — file links, details, licence and consent record for every row.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={d.approvedReady ? `/api/org/projects/${id}/export?format=json` : undefined} aria-disabled={!d.approvedReady}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold ${d.approvedReady ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900" : "pointer-events-none bg-zinc-100 text-zinc-400 dark:bg-zinc-800"}`}>
                        <FileJson size={15} />JSON manifest
                      </a>
                      <a href={d.approvedReady ? `/api/org/projects/${id}/export?format=csv` : undefined} aria-disabled={!d.approvedReady}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold ${d.approvedReady ? "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800" : "pointer-events-none border-zinc-100 text-zinc-400 dark:border-zinc-800"}`}>
                        <FileSpreadsheet size={15} />CSV
                      </a>
                    </div>
                  </div>
                </div>
              </Panel>
            )}

            {d.withdrawnCount > 0 && (
              <Panel className="border-amber-300 p-5 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10"><AlertTriangle size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">Erased items to remove</p>
                    <p className="mt-0.5 text-sm text-zinc-500"><strong>{d.withdrawnCount}</strong> contributor{d.withdrawnCount === 1 ? " has" : "s have"} used their right to erasure since delivery. Delete the matching rows from any copy you already downloaded.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={`/api/org/projects/${id}/withdrawn?format=csv`} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200"><FileSpreadsheet size={15} />Removal list (CSV)</a>
                      <a href={`/api/org/projects/${id}/withdrawn`} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200"><FileJson size={15} />JSON</a>
                    </div>
                  </div>
                </div>
              </Panel>
            )}
          </div>

          {/* Side */}
          <div className="space-y-6">
            {owner && (
              <Panel className="p-5">
                <p className="text-sm font-semibold text-foreground">Budget</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{formatUsd(p.spent)}<span className="text-sm font-normal text-zinc-400"> of {formatUsd(p.budget)}</span></p>
                <Progress value={p.spent} max={p.budget} tone="blue" className="mt-3" />
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-500">Price per item</span><span className="font-medium tabular-nums">{formatUsd(p.reward)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Remaining</span><span className="font-medium tabular-nums">{formatUsd(Math.max(0, p.budget - p.spent))}</span></div>
                </div>
              </Panel>
            )}

            {p.license && (
              <Panel className="p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck size={16} className="text-emerald-600" />Usage licence</p>
                <p className="mt-2 text-sm font-medium text-foreground">{p.license.label}</p>
                <p className="mt-0.5 text-sm text-zinc-500">{p.license.description}</p>
                {p.usageTerms && <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-500">{p.usageTerms}</p>}
                <p className="mt-3 text-xs text-zinc-400">Contributors agreed to this licence; it&apos;s recorded in every export.</p>
              </Panel>
            )}

            {p.languages.length > 0 && (
              <Panel className="p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><Languages size={16} className="text-zinc-400" />Languages</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.languages.map((l) => <span key={l} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{l}</span>)}
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
