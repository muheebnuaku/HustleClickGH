"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrgLayout } from "@/components/org-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/utils";
import { orgStatusLabel, orgStatusClass } from "@/lib/org-status";
import { LICENSES, DEFAULT_LICENSE } from "@/lib/licenses";
import { Loader2, Plus, X, Mic, Video, ArrowRight } from "lucide-react";

interface P { id: string; title: string; projectType: string; status: string; reward: number; maxSubmissions: number; currentSubmissions: number; budget: number; spent: number; counts: { pending: number; approved: number; rejected: number }; }

export default function OrgProjects() {
  const router = useRouter();
  const [wallet, setWallet] = useState(0);
  const [projects, setProjects] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", instructions: "", projectType: "voice", reward: "", maxSubmissions: "", languages: "", samplePrompts: "", license: DEFAULT_LICENSE });

  const load = () => fetch("/api/org/projects").then((r) => r.ok ? r.json() : null).then((d) => {
    if (d) { setWallet(d.walletBalance ?? 0); setProjects(d.projects ?? []); }
  }).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const cost = (Number(form.reward) || 0) * (Number(form.maxSubmissions) || 0);

  const create = async () => {
    setErr(null);
    if (!form.title.trim() || !form.description.trim() || !form.instructions.trim()) { setErr("Title, description and instructions are required."); return; }
    if (!(Number(form.reward) > 0) || !(Number(form.maxSubmissions) > 0)) { setErr("Reward and target submissions must be positive."); return; }
    // No wallet gate here — the project goes for admin review; funds are only
    // charged when an admin approves (they may adjust the price first).
    setBusy(true);
    try {
      const res = await fetch("/api/org/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (res.ok) { setShowForm(false); router.push(`/org/projects/${d.projectId}`); }
      else setErr(d.message || "Failed to create project");
    } catch { setErr("Failed to create project"); } finally { setBusy(false); }
  };

  return (
    <OrgLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Projects</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">Wallet: <strong className="text-emerald-600">{formatUsd(wallet)}</strong></p>
          </div>
          <Button onClick={() => setShowForm((s) => !s)} className="bg-emerald-600 hover:bg-emerald-700"><Plus size={16} className="mr-1" />{showForm ? "Cancel" : "New project"}</Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>New data collection project</CardTitle>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-zinc-400" /></button>
            </CardHeader>
            <CardContent className="space-y-3">
              {err && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}
              <div><label className="text-sm font-medium">Project title *</label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Twi conversational speech" /></div>
              <div><label className="text-sm font-medium">Description *</label><textarea className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm resize-y" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What data you need and how it will be used" /></div>
              <div><label className="text-sm font-medium">Recording instructions *</label><textarea className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm resize-y" rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Step-by-step guide for contributors" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <select value={form.projectType} onChange={(e) => setForm({ ...form, projectType: e.target.value })} className="w-full h-12 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm">
                    <option value="voice">Voice</option>
                    <option value="video">Video</option>
                  </select>
                </div>
                <div><label className="text-sm font-medium">Languages (comma)</label><Input value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="English, Twi" /></div>
                <div><label className="text-sm font-medium">Your price per approved item ($) *</label><Input type="number" step="0.5" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} placeholder="2.00" /></div>
                <div><label className="text-sm font-medium">Target submissions *</label><Input type="number" value={form.maxSubmissions} onChange={(e) => setForm({ ...form, maxSubmissions: e.target.value })} placeholder="500" /></div>
              </div>
              <div><label className="text-sm font-medium">Sample prompts (one per line)</label><textarea className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm resize-y" rows={2} value={form.samplePrompts} onChange={(e) => setForm({ ...form, samplePrompts: e.target.value })} /></div>
              <div>
                <label className="text-sm font-medium">Usage licence</label>
                <select value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} className="w-full h-12 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm">
                  {Object.values(LICENSES).map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                </select>
                <p className="text-xs text-zinc-500 mt-1">{LICENSES[form.license]?.description}. Contributors see this before consenting; it&rsquo;s recorded in every export.</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-sm text-zinc-500">Estimated cost: <strong className="text-emerald-600">{formatUsd(cost)}</strong> — charged from your wallet when an admin approves.</p>
                <Button onClick={create} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">{busy ? <><Loader2 size={16} className="mr-1 animate-spin" />Submitting…</> : "Submit for review"}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-emerald-600" /></div>
        ) : projects.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-zinc-500">No projects yet.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <Link key={p.id} href={`/org/projects/${p.id}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {p.projectType === "video" ? <Video size={16} className="text-purple-500" /> : <Mic size={16} className="text-blue-500" />}
                          <h3 className="font-semibold text-foreground truncate">{p.title}</h3>
                        </div>
                        <p className="text-sm text-zinc-500 mt-1">{p.counts.approved}/{p.maxSubmissions} collected · {p.counts.pending} pending · {formatUsd(p.reward)}/each</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${orgStatusClass(p.status)}`}>{orgStatusLabel(p.status)}</span>
                        <ArrowRight size={16} className="text-zinc-400" />
                      </div>
                    </div>
                    <div className="mt-3 bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 w-full">
                      <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (p.counts.approved / p.maxSubmissions) * 100)}%` }} />
                    </div>
                    <p className="text-xs text-zinc-400 mt-1.5">Budget {formatUsd(p.budget)} · spent {formatUsd(p.spent)}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </OrgLayout>
  );
}
