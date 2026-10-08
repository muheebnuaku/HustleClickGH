"use client";

// Review queue — every project this client checks, with what's waiting.

import { useEffect, useState } from "react";
import Link from "next/link";
import { OrgLayout } from "@/components/org-layout";
import { PageHeader, SkeletonList, EmptyState, Panel } from "@/components/ui/page-kit";
import { StatusBadge, TypeIcon, type OrgProject } from "@/components/org/org-ui";
import { ClipboardCheck, ChevronRight, CheckCircle2 } from "lucide-react";

export default function OrgReviewQueue() {
  const [projects, setProjects] = useState<OrgProject[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/org/projects").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (alive) setProjects((d?.projects ?? []).filter((p: OrgProject) => p.canReview));
    }).catch(() => alive && setProjects([]));
    return () => { alive = false; };
  }, []);

  const waiting = (projects ?? []).reduce((n, p) => n + (p.toReview ?? 0), 0);
  const sorted = [...(projects ?? [])].sort((a, b) => (b.toReview ?? 0) - (a.toReview ?? 0));

  return (
    <OrgLayout>
      <div className="space-y-5">
        <PageHeader
          icon={ClipboardCheck}
          title="Review queue"
          description={projects === null ? "Loading…" : waiting ? `${waiting} submission${waiting === 1 ? "" : "s"} waiting for your pass / fail.` : "You're all caught up."}
        />
        <p className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          Watch each recording, check the details that came with it, then mark it <strong className="text-emerald-600">Pass</strong> or <strong className="text-red-600">Fail</strong>.
          Our team uses your verdicts before final approval. Contributors appear by reference ID only.
        </p>

        {projects === null ? (
          <SkeletonList rows={3} />
        ) : sorted.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No projects to review" description="When we invite you to check a project's submissions, it appears here." />
        ) : (
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sorted.map((p) => (
                <li key={p.id}>
                  <Link href={`/org/projects/${p.id}/review`} className="flex items-center gap-3 px-4 py-4 hover:bg-zinc-50 sm:px-5 dark:hover:bg-zinc-900">
                    <TypeIcon type={p.projectType} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{p.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500"><StatusBadge status={p.status} />{p.counts.approved} approved so far</span>
                    </span>
                    {(p.toReview ?? 0) > 0 ? (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{p.toReview} to review</span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 size={14} />Done</span>
                    )}
                    <ChevronRight size={16} className="shrink-0 text-zinc-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </OrgLayout>
  );
}
