"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { EmptyState, Notice, PageHeader, PageSkeleton, Panel, StatCard } from "@/components/admin/admin-ui";
import { UserPicker, type PickedUser } from "@/components/admin/user-picker";
import { VerifiedBadge } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Clock, Crown, ExternalLink, Loader2, Save, Unlock, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Member {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  verified: boolean;
  idType: string | null;
  idNumberLast4: string | null;
  premiumUntil: string | null;
}

interface Req {
  id: string;
  amount: number;
  momoNumber: string;
  reference: string;
  receiptUrl: string;
  method?: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: Member;
}

interface Settings {
  enabled: boolean;
  priceGhs: number;
  durationDays: number;
  earlyAccessHours: number;
  momoNumber: string;
  momoName: string;
}

interface Data {
  pending: Req[];
  recent: Req[];
  members: Member[];
  earlyProjects: { id: string; title: string; openToAllAt: string }[];
  settings: Settings;
  paystack: boolean;
  paystackProblem: string | null;
  paystackMode: "live" | "test" | null;
}

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

function IdLine({ u }: { u: Member }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
      {u.verified ? <VerifiedBadge size={14} /> : null}
      {u.idType ? `${u.idType.replace(/_/g, " ")} ••••${u.idNumberLast4 ?? ""}` : "No ID on file"}
    </span>
  );
}

export default function AdminPremiumPage() {
  const [data, setData] = useState<Data | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [grantUser, setGrantUser] = useState<PickedUser | null>(null);

  const load = async () => {
    try {
      const d: Data = await call("/api/admin/premium", "GET");
      setData(d);
      setSettings(d.settings);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not load" });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: "success", text: done });
      await load();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  };

  const approve = (r: Req) =>
    run(r.id, () => call(`/api/admin/premium/requests/${r.id}`, "PATCH", { action: "approve" }), `${r.user.fullName} is now Premium.`);

  const reject = (r: Req) => {
    const note = prompt(`Why are you rejecting ${r.user.fullName}'s payment? They will see this.`, "Payment not received for this transaction ID");
    if (!note?.trim()) return;
    run(r.id, () => call(`/api/admin/premium/requests/${r.id}`, "PATCH", { action: "reject", note }), "Payment rejected and the member notified.");
  };

  const verify = (u: Member) => {
    if (!confirm(`Give ${u.fullName} the Verified tick? Only do this after checking their ID.`)) return;
    run(`v-${u.id}`, () => call("/api/admin/users", "PATCH", { userId: u.id, action: "verify" }), `${u.fullName} is verified.`);
  };

  const revoke = (u: Member) => {
    if (!confirm(`End Premium for ${u.fullName} now?`)) return;
    run(`r-${u.id}`, () => call("/api/admin/premium/members", "POST", { userId: u.id, action: "revoke" }), "Premium ended.");
  };

  const grant = () => {
    if (!grantUser || !settings) return;
    if (!confirm(`Give ${grantUser.fullName} Premium for ${settings.durationDays} days without a MoMo payment?`)) return;
    run("grant", () => call("/api/admin/premium/members", "POST", { userId: grantUser.id, action: "grant" }), `${grantUser.fullName} is now Premium.`).then(() => setGrantUser(null));
  };

  const openNow = (p: { id: string; title: string }) => {
    if (!confirm(`Open "${p.title}" to everyone now? Basic members will be notified.`)) return;
    run(`p-${p.id}`, () => call(`/api/admin/premium/projects/${p.id}`, "POST"), "Opened to everyone.");
  };

  const saveSettings = () =>
    settings && run("settings", () => call("/api/admin/premium/settings", "PUT", { settings }), "Settings saved.");

  if (!data || !settings) {
    return <AdminLayout>{message ? <Notice tone="error">{message.text}</Notice> : <PageSkeleton stats={3} rows={4} />}</AdminLayout>;
  }

  const field = "mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PageHeader icon={Crown} title="Premium" description="Approve MoMo payments, manage members, and set the price and early-access window." />

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Waiting for review" value={data.pending.length} icon={Clock} />
          <StatCard label="Premium members" value={data.members.length} icon={Crown} />
          <StatCard label="In early access now" value={data.earlyProjects.length} icon={Unlock} />
        </div>

        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {data.paystack && data.paystackMode === "test" && (
          <Notice tone="info">Paystack is in TEST mode (sk_test_ key): checkouts use Paystack&apos;s test payments and no real money moves. Switch to the sk_live_ key to take real payments.</Notice>
        )}
        {!data.paystack && data.paystackProblem && (
          <Notice tone="error">Paystack not connected: {data.paystackProblem}</Notice>
        )}
        {data.paystack ? (
          <Notice tone="success">Paystack is connected: members pay online and are upgraded automatically. Payments below only need you when Paystack reports an unexpected amount, or for manual MoMo payments.</Notice>
        ) : !settings.momoNumber ? (
          <Notice tone="error">Paystack isn&apos;t connected and no MoMo number is set (Settings, below), so members can&apos;t pay yet.</Notice>
        ) : null}

        <Panel className="p-5">
          <h2 className="mb-3 font-semibold text-foreground">Payments to review</h2>
          {data.pending.length === 0 ? (
            <EmptyState icon={Check} title="Nothing to review" description="New MoMo payments appear here." />
          ) : (
            <div className="space-y-3">
              {data.pending.map((r) => (
                <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 md:flex-row md:items-center">
                  {r.receiptUrl ? (
                    <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="shrink-0" title="Open receipt">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.receiptUrl} alt="Payment receipt" className="h-20 w-20 rounded-lg object-cover ring-1 ring-zinc-200 dark:ring-zinc-700" />
                    </a>
                  ) : (
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-xs font-medium text-sky-700">Paystack</span>
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                    <p className="font-medium text-foreground">
                      {r.user.fullName} <span className="text-zinc-500">· {r.user.userId}</span>
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      GH₵{r.amount}{r.momoNumber ? <> from <strong>{r.momoNumber}</strong></> : " via Paystack"} · Ref <strong>{r.reference}</strong>
                    </p>
                    <p className="text-xs text-zinc-500">Submitted {formatDate(r.createdAt)} · Account phone {r.user.phone}</p>
                    <IdLine u={r.user} />
                    <p className="text-xs text-amber-700 dark:text-amber-400">Check the transaction ID in your MoMo statement before approving.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => approve(r)} disabled={busy === r.id}>
                      {busy === r.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Check size={14} className="mr-1" />} Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reject(r)} disabled={busy === r.id} className="text-red-600">
                      <X size={14} className="mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {data.earlyProjects.length > 0 && (
          <Panel className="p-5">
            <h2 className="mb-3 font-semibold text-foreground">Projects in Premium early access</h2>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.earlyProjects.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{p.title}</p>
                    <p className="text-xs text-zinc-500">Opens to everyone {new Date(p.openToAllAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openNow(p)} disabled={busy === `p-${p.id}`}>
                    <Unlock size={14} className="mr-1" /> Open to everyone now
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <Panel className="p-5">
          <h2 className="mb-3 font-semibold text-foreground">Members</h2>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1">
              <UserPicker value={grantUser} onChange={setGrantUser} placeholder="Grant Premium by hand: type a User ID, name or phone" />
            </div>
            <Button size="sm" onClick={grant} disabled={!grantUser || busy === "grant"}>
              <Crown size={14} className="mr-1" /> Grant Premium
            </Button>
          </div>
          {data.members.length === 0 ? (
            <p className="text-sm text-zinc-500">No Premium members yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.members.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {u.fullName} <span className="text-zinc-500">· {u.userId}</span>
                    </p>
                    <p className="text-xs text-zinc-500">Premium until {formatDate(u.premiumUntil)}</p>
                    <IdLine u={u} />
                  </div>
                  {!u.verified && u.idType && (
                    <Button size="sm" variant="outline" onClick={() => verify(u)} disabled={busy === `v-${u.id}`}>
                      Verify ID
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => revoke(u)} disabled={busy === `r-${u.id}`} className="text-red-600">
                    End Premium
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="space-y-4 p-5">
          <h2 className="font-semibold text-foreground">Settings</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={field}>Price (GH₵)</label>
              <Input type="number" min={1} value={settings.priceGhs} onChange={(e) => setSettings({ ...settings, priceGhs: Number(e.target.value) })} />
            </div>
            <div>
              <label className={field}>Lasts (days)</label>
              <Input type="number" min={1} value={settings.durationDays} onChange={(e) => setSettings({ ...settings, durationDays: Number(e.target.value) })} />
            </div>
            <div>
              <label className={field}>Early access (hours, 0 = off)</label>
              <Input type="number" min={0} max={168} value={settings.earlyAccessHours} onChange={(e) => setSettings({ ...settings, earlyAccessHours: Number(e.target.value) })} />
            </div>
            <div>
              <label className={field}>MoMo number members pay into</label>
              <Input value={settings.momoNumber} onChange={(e) => setSettings({ ...settings, momoNumber: e.target.value })} placeholder="059 240 5403" />
            </div>
            <div>
              <label className={field}>Name on that MoMo account</label>
              <Input value={settings.momoName} onChange={(e) => setSettings({ ...settings, momoName: e.target.value })} placeholder="HustleClickGH" />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
              Accept new Premium payments
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            The early-access window applies to projects launched after you save. Field-team projects are never locked.
          </p>
          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={busy === "settings"}>
              {busy === "settings" ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />} Save settings
            </Button>
          </div>
        </Panel>

        {data.recent.length > 0 && (
          <Panel className="p-5">
            <h2 className="mb-3 font-semibold text-foreground">Recent decisions</h2>
            <div className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {data.recent.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className={r.status === "approved" ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800" : "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"}>
                    {r.status}
                  </span>
                  <span className="text-foreground">{r.user.fullName}</span>
                  {r.method === "paystack" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Paystack</span>}
                  <span className="text-zinc-500">· Txn {r.reference} · {formatDate(r.reviewedAt)}</span>
                  {r.adminNote && <span className="text-zinc-500">· {r.adminNote}</span>}
                  {r.receiptUrl && (
                    <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-zinc-400 hover:text-foreground" title="Receipt">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </AdminLayout>
  );
}
