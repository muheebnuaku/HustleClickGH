"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OrgLayout } from "@/components/org-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Loader2, ArrowLeft, Download, Database } from "lucide-react";

interface Detail {
  project: { id: string; title: string; description: string; projectType: string; status: string; reward: number; maxSubmissions: number; currentSubmissions: number; budget: number; spent: number; languages: string[] };
  counts: { pending: number; approved: number; rejected: number };
  approvedReady: number;
}

export default function OrgProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch(`/api/org/projects/${id}`).then((r) => r.ok ? r.json() : null).then((data) => setD(data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <OrgLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div></OrgLayout>;
  if (!d?.project) return <OrgLayout><Card><CardContent className="p-10 text-center text-zinc-500">Project not found.</CardContent></Card></OrgLayout>;

  const p = d.project;
  const pct = Math.min(100, Math.round((d.counts.approved / p.maxSubmissions) * 100));

  return (
    <OrgLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        <Link href="/org/projects" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-foreground"><ArrowLeft size={16} /> Back to projects</Link>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground break-words">{p.title}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800"}`}>{p.status}</span>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 break-words">{p.description}</p>
          {p.languages.length > 0 && <p className="text-xs text-zinc-500 mt-1">Languages: {p.languages.join(", ")}</p>}
        </div>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-zinc-500">Collection progress</span>
              <span className="font-medium text-foreground">{d.counts.approved}/{p.maxSubmissions}</span>
            </div>
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 w-full"><div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${pct}%` }} /></div>
            <div className="grid grid-cols-3 gap-2 text-center mt-4">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 py-2"><p className="text-xs text-zinc-500">Pending</p><p className="text-lg font-bold text-amber-600">{d.counts.pending}</p></div>
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 py-2"><p className="text-xs text-zinc-500">Approved</p><p className="text-lg font-bold text-green-600">{d.counts.approved}</p></div>
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 py-2"><p className="text-xs text-zinc-500">Rejected</p><p className="text-lg font-bold text-zinc-500">{d.counts.rejected}</p></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Budget</span>
              <span className="font-medium">{formatCurrency(p.spent)} spent of {formatCurrency(p.budget)}</span>
            </div>
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 w-full mt-2"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${p.budget ? Math.min(100, (p.spent / p.budget) * 100) : 0}%` }} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-foreground flex items-center gap-2 mb-1"><Database size={18} /> Download dataset</h2>
            <p className="text-sm text-zinc-500 mb-4">{d.approvedReady} approved item{d.approvedReady === 1 ? "" : "s"} ready. Includes file links, metadata and consent provenance per row.</p>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/org/projects/${id}/export?format=json`}>
                <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={d.approvedReady === 0}><Download size={16} className="mr-1" />JSON manifest</Button>
              </a>
              <a href={`/api/org/projects/${id}/export?format=csv`}>
                <Button variant="outline" disabled={d.approvedReady === 0}><Download size={16} className="mr-1" />CSV</Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </OrgLayout>
  );
}
