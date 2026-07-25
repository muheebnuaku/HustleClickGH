"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { Building2, Plus, Loader2, Lock, Unlock, X } from "lucide-react";

interface Org {
  id: string; name: string; workEmail: string; phone?: string | null; country?: string | null;
  status: string; walletBalance: number; createdAt: string;
  owner?: { userId: string; email: string; status: string } | null;
  projects: number; totalBudget: number; totalSpent: number;
}

function OrganizationsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, status } = useSession();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", workEmail: "", phone: "", country: "" });

  const load = async () => {
    try {
      const res = await fetch("/api/admin/organizations");
      if (res.ok) setOrgs((await res.json()).organizations ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated") {
      if (session?.user?.role !== "admin") { router.push("/dashboard"); return; }
      load();
      // Prefill from a partner inquiry ("Create org account" button).
      const name = params.get("name"), email = params.get("email");
      if (name || email) {
        setForm((f) => ({ ...f, name: name || "", workEmail: email || "", phone: params.get("phone") || "", country: params.get("country") || "" }));
        setShowForm(true);
      }
    }
  }, [status, session, router, params]);

  const create = async () => {
    if (!form.name.trim() || !form.workEmail.trim() || busy) return;
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await res.json();
      if (res.ok) {
        setResult(`✓ Created ${form.name} — login ID ${d.loginId}. Invite emailed.`);
        setForm({ name: "", workEmail: "", phone: "", country: "" });
        setShowForm(false);
        load();
      } else setResult(`✗ ${d.message || "Failed"}`);
    } catch { setResult("✗ Failed to create"); } finally { setBusy(false); }
  };

  const toggleSuspend = async (org: Org) => {
    const action = org.status === "suspended" ? "activate" : "suspend";
    const res = await fetch("/api/admin/organizations", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id, action }),
    });
    if (res.ok) load();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2"><Building2 size={26} /> Organizations</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">Buyer accounts that fund projects and download datasets</p>
          </div>
          <Button onClick={() => setShowForm((s) => !s)}><Plus size={18} className="mr-1" />{showForm ? "Cancel" : "New organization"}</Button>
        </div>

        {result && <div className={`p-3 rounded-lg text-sm ${result.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{result}</div>}

        {showForm && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Provision an organization</CardTitle>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-zinc-400" /></button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Company name *</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme AI Ltd" /></div>
                <div><label className="text-sm font-medium">Work email *</label><Input type="email" value={form.workEmail} onChange={(e) => setForm({ ...form, workEmail: e.target.value })} placeholder="ops@acme.ai" /></div>
                <div><label className="text-sm font-medium">Phone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Country</label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Ghana" /></div>
              </div>
              <p className="text-xs text-zinc-500">Creates a login account (role: organization) and emails a temporary password.</p>
              <Button onClick={create} disabled={busy || !form.name.trim() || !form.workEmail.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                {busy ? <><Loader2 size={16} className="mr-1 animate-spin" />Creating…</> : "Create & send invite"}
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-emerald-600" /></div>
        ) : orgs.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-zinc-500">No organizations yet.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orgs.map((o) => (
              <Card key={o.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground break-words">{o.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${o.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{o.status}</span>
                      </div>
                      <p className="text-sm text-zinc-500 break-all">{o.workEmail}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">Login ID: {o.owner?.userId || "—"}</p>
                    </div>
                    <button onClick={() => toggleSuspend(o)} title={o.status === "suspended" ? "Reactivate" : "Suspend"} className={`p-2 rounded-lg ${o.status === "suspended" ? "text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" : "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"}`}>
                      {o.status === "suspended" ? <Unlock size={16} /> : <Lock size={16} />}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 py-2"><p className="text-xs text-zinc-500">Wallet</p><p className="text-sm font-semibold text-emerald-600">{formatCurrency(o.walletBalance)}</p></div>
                    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 py-2"><p className="text-xs text-zinc-500">Projects</p><p className="text-sm font-semibold text-foreground">{o.projects}</p></div>
                    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 py-2"><p className="text-xs text-zinc-500">Spent</p><p className="text-sm font-semibold text-foreground">{formatCurrency(o.totalSpent)}</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default function AdminOrganizationsPage() {
  return (
    <Suspense fallback={<AdminLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div></AdminLayout>}>
      <OrganizationsContent />
    </Suspense>
  );
}
