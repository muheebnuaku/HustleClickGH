"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OrgLayout } from "@/components/org-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";
import { orgStatusLabel, orgStatusClass } from "@/lib/org-status";
import { Loader2, Wallet, Database, Plus, ArrowRight, ShieldCheck, X } from "lucide-react";

interface P { id: string; title: string; status: string; currentSubmissions: number; maxSubmissions: number; counts: { pending: number; approved: number }; budget: number; spent: number; }

export default function OrgDashboard() {
  const [wallet, setWallet] = useState(0);
  const [projects, setProjects] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [mustSetPassword, setMustSetPassword] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/org/projects").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) { setWallet(d.walletBalance ?? 0); setProjects(d.projects ?? []); }
    }).catch(() => {}).finally(() => setLoading(false));
    fetch("/api/org/me").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.org) { setOrgName(d.org.name || ""); setMustSetPassword(!!d.org.mustSetPassword); }
    }).catch(() => {});
  }, []);

  const active = projects.filter((p) => p.status === "active").length;
  const pending = projects.reduce((s, p) => s + (p.counts?.pending || 0), 0);
  const collected = projects.reduce((s, p) => s + (p.counts?.approved || 0), 0);

  if (loading) return <OrgLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div></OrgLayout>;

  return (
    <OrgLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{orgName ? `Welcome, ${orgName}` : "Overview"}</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">Fund projects, watch collection, and download your datasets.</p>
        </div>

        {mustSetPassword && !dismissed && (
          <Card className="border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldCheck className="text-amber-600 mt-0.5 shrink-0" size={20} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-amber-800 dark:text-amber-300">Secure your account</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">You&rsquo;re still using the temporary password from your invite. Set your own password now.</p>
                <Link href="/org/settings"><Button size="sm" className="mt-2 bg-amber-600 hover:bg-amber-700">Set password</Button></Link>
              </div>
              <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-700 shrink-0" aria-label="Dismiss"><X size={18} /></button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card><CardContent className="p-4"><p className="text-xs text-zinc-500">Wallet balance</p><p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">{formatUsd(wallet)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-zinc-500">Active projects</p><p className="text-xl sm:text-2xl font-bold text-foreground mt-1">{active}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-zinc-500">Awaiting review</p><p className="text-xl sm:text-2xl font-bold text-amber-600 mt-1">{pending}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-zinc-500">Data collected</p><p className="text-xl sm:text-2xl font-bold text-foreground mt-1">{collected}</p></CardContent></Card>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/org/projects"><Button className="bg-emerald-600 hover:bg-emerald-700"><Plus size={16} className="mr-1" />New project</Button></Link>
          <Link href="/org/wallet"><Button variant="outline"><Wallet size={16} className="mr-1" />Add funds</Button></Link>
        </div>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground flex items-center gap-2"><Database size={18} /> Your projects</h2>
              <Link href="/org/projects" className="text-sm text-emerald-600 hover:underline flex items-center gap-1">All <ArrowRight size={14} /></Link>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center">No projects yet. Create one to start collecting data.</p>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 5).map((p) => (
                  <Link key={p.id} href={`/org/projects/${p.id}`} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{p.title}</p>
                      <p className="text-xs text-zinc-500">{p.counts.approved}/{p.maxSubmissions} collected · {p.counts.pending} pending</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${orgStatusClass(p.status)}`}>{orgStatusLabel(p.status)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </OrgLayout>
  );
}
