"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OrgLayout } from "@/components/org-layout";
import { PageSkeleton, Panel, StatCard, EmptyState } from "@/components/ui/page-kit";
import { ProjectCard, type OrgProject } from "@/components/org/org-ui";
import { formatUsd } from "@/lib/utils";
import { FolderKanban, ClipboardCheck, CheckCircle2, Wallet, Plus, ArrowRight, ShieldCheck, X, Hourglass, Database } from "lucide-react";

export default function OrgDashboard() {
  const [wallet, setWallet] = useState(0);
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [mustSetPassword, setMustSetPassword] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/org/projects").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/org/me").then((r) => (r.ok ? r.json() : null)),
    ]).then(([d, me]) => {
      if (!alive) return;
      if (d) { setWallet(d.walletBalance ?? 0); setProjects(d.projects ?? []); }
      if (me?.org) { setOrgName(me.org.name || ""); setMustSetPassword(!!me.org.mustSetPassword); }
    }).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading) return <OrgLayout><PageSkeleton /></OrgLayout>;

  const live = projects.filter((p) => p.status === "active").length;
  const awaitingApproval = projects.filter((p) => p.status === "pending_review");
  const collected = projects.reduce((s, p) => s + (p.counts?.approved || 0), 0);
  const toReview = projects.filter((p) => p.canReview && (p.toReview ?? 0) > 0);
  const totalToReview = toReview.reduce((n, p) => n + (p.toReview ?? 0), 0);
  const spent = projects.filter((p) => p.access !== "review").reduce((s, p) => s + (p.spent || 0), 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Things that need the client — shown first, only when there's something to do.
  const tasks = [
    ...(mustSetPassword && !dismissed ? [{ key: "pw", icon: ShieldCheck, tone: "amber", title: "Secure your account", text: "You're still using the temporary password from your invite.", href: "/org/settings", cta: "Set password" }] : []),
    ...toReview.map((p) => ({ key: p.id, icon: ClipboardCheck, tone: "emerald", title: `${p.toReview} submission${p.toReview === 1 ? "" : "s"} to review`, text: p.title, href: `/org/projects/${p.id}/review`, cta: "Review" })),
    ...awaitingApproval.map((p) => ({ key: `a-${p.id}`, icon: Hourglass, tone: "slate", title: "Waiting for HustleClickGH approval", text: p.title, href: `/org/projects/${p.id}`, cta: "View" })),
  ];

  return (
    <OrgLayout>
      <div className="space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-emerald-200/80">{greeting}</p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{orgName || "Welcome"}</h1>
              <p className="mt-2 max-w-md text-sm text-zinc-300">Commission data collection, check quality as it comes in, and download clean, licensed datasets.</p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur sm:min-w-[280px]">
              <p className="text-xs text-zinc-300">Wallet balance</p>
              <p className="mt-0.5 text-3xl font-semibold tabular-nums">{formatUsd(wallet)}</p>
              <div className="mt-3 flex gap-2">
                <Link href="/org/wallet" className="inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100"><Plus size={13} />Add funds</Link>
                <Link href="/org/projects?new=1" className="inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400">New project</Link>
              </div>
            </div>
          </div>
        </div>

        {/* Needs attention */}
        {tasks.length > 0 && (
          <Panel className="overflow-hidden">
            <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
              <p className="text-sm font-semibold text-foreground">Needs your attention</p>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {tasks.map((t) => {
                const Icon = t.icon;
                return (
                  <li key={t.key} className="flex items-center gap-3 px-5 py-3">
                    <span className={
                      t.tone === "amber" ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10"
                        : t.tone === "emerald" ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"
                          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                    }><Icon size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{t.title}</p>
                      <p className="truncate text-xs text-zinc-500">{t.text}</p>
                    </div>
                    <Link href={t.href} className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">{t.cta}</Link>
                    {t.key === "pw" && (
                      <button onClick={() => setDismissed(true)} className="shrink-0 rounded-lg p-1 text-zinc-400 hover:text-zinc-600" aria-label="Dismiss"><X size={15} /></button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={FolderKanban} tone="green" label="Live projects" value={live} hint={`${projects.length} in total`} />
          <StatCard icon={ClipboardCheck} tone="amber" label="To review" value={totalToReview} hint={totalToReview ? "waiting for your verdict" : "all caught up"} />
          <StatCard icon={CheckCircle2} tone="blue" label="Data collected" value={collected.toLocaleString()} hint="approved items" />
          <StatCard icon={Wallet} tone="purple" label="Spent" value={formatUsd(spent)} hint="across your projects" />
        </div>

        {/* Projects */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Recent projects</h2>
            {projects.length > 0 && <Link href="/org/projects" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline">All projects<ArrowRight size={14} /></Link>}
          </div>
          {projects.length === 0 ? (
            <EmptyState
              icon={Database}
              title="Start your first data project"
              description="Tell us what data you need — voice, video or face — and how many items. We review it, then our contributors start collecting."
              action={<Link href="/org/projects?new=1" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Plus size={15} />New project</Link>}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {projects.slice(0, 6).map((p) => <ProjectCard key={p.id} p={p} />)}
            </div>
          )}
        </div>
      </div>
    </OrgLayout>
  );
}
