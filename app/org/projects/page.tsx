"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OrgLayout } from "@/components/org-layout";
import { PageHeader, SkeletonList, Segmented, EmptyState } from "@/components/ui/page-kit";
import { ProjectCard, type OrgProject } from "@/components/org/org-ui";
import { NewProjectWizard } from "@/components/org/new-project-wizard";
import { FolderKanban, Plus, Search } from "lucide-react";
import { SITE_CONFIG } from "@/lib/constants";

type Filter = "all" | "active" | "pending_review" | "completed" | "review";

function ProjectsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const creating = params.get("new") === "1";
  const [wallet, setWallet] = useState(0);
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/org/projects").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (alive && d) { setWallet(d.walletBalance ?? 0); setProjects(d.projects ?? []); }
    }).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const count = (f: Filter) => projects.filter((p) => match(p, f)).length;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return projects.filter((p) => match(p, filter) && (!s || p.title.toLowerCase().includes(s)));
  }, [projects, filter, q]);
  const hasReview = projects.some((p) => p.access === "review");

  return (
    <OrgLayout>
      <div className="space-y-5">
        <PageHeader
          icon={FolderKanban}
          title="Projects"
          description="Everything you've commissioned, plus projects you've been invited to review."
          actions={
            <button onClick={() => router.push("/org/projects?new=1")} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
              <Plus size={16} />New project
            </button>
          }
        />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-full overflow-x-auto">
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: projects.length },
                { value: "active", label: "Live", count: count("active") },
                { value: "pending_review", label: "Awaiting approval", count: count("pending_review") },
                { value: "completed", label: "Completed", count: count("completed") },
                ...(hasReview ? [{ value: "review" as Filter, label: "Review access", count: count("review") }] : []),
              ]}
            />
          </div>
          <div className="relative lg:w-72">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
        </div>

        {loading ? (
          <SkeletonList />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={projects.length ? "No projects match" : "No projects yet"}
            description={projects.length ? "Try another filter or search." : "Create a project to start collecting data — it takes about two minutes."}
            action={!projects.length ? <button onClick={() => router.push("/org/projects?new=1")} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Plus size={15} />New project</button> : undefined}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
        )}

        <p className="text-center text-xs text-zinc-400">
          Need something custom (guided face capture, ID photos, a specific country)? <a href={SITE_CONFIG.social.find((x) => x.key === "whatsapp")?.url} target="_blank" rel="noreferrer" className="font-medium text-emerald-600 hover:underline">Message us</a> and we&apos;ll set it up for you.
        </p>
      </div>

      {creating && (
        <NewProjectWizard
          wallet={wallet}
          onClose={() => router.replace("/org/projects")}
          onCreated={(id) => router.push(`/org/projects/${id}`)}
        />
      )}
    </OrgLayout>
  );
}

function match(p: OrgProject, f: Filter) {
  if (f === "all") return true;
  if (f === "review") return p.access === "review";
  return p.status === f;
}

export default function OrgProjects() {
  return (
    <Suspense fallback={<OrgLayout><SkeletonList /></OrgLayout>}>
      <ProjectsInner />
    </Suspense>
  );
}
