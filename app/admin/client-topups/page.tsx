"use client";

// Client wallet top-ups are paid in crypto outside the platform. Clients submit
// the transaction ID; here an admin checks it on the blockchain and confirms (the
// wallet is credited) or rejects it. Also where the receiving wallets are set.

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { PageHeader, Panel, Notice, Segmented, EmptyState, SkeletonList } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { cn, formatUsd, formatDate } from "@/lib/utils";
import { CRYPTO_ASSETS, CRYPTO_NETWORKS, type CryptoWallet } from "@/lib/crypto-wallets-shared";
import { Bitcoin, Check, X, ExternalLink, Plus, Trash2, Loader2, Receipt, Wallet } from "lucide-react";

interface Topup {
  id: string; amount: number; status: string; provider: string | null; createdAt: string;
  org: { id: string; name: string; workEmail: string };
  asset: string | null; network: string | null; address: string | null; txHash: string | null;
  proofUrl: string | null; rejectReason: string | null; claimedAmount: number | null; explorer: string | null;
}
type Filter = "pending" | "success" | "failed" | "all";

export default function ClientTopupsPage() {
  const [topups, setTopups] = useState<Topup[]>([]);
  const [wallets, setWallets] = useState<CryptoWallet[]>([]);
  const [draft, setDraft] = useState<CryptoWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/client-topups").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!alive || !d) return;
      setTopups(d.topups ?? []);
      setWallets(d.wallets ?? []);
      setDraft(d.wallets ?? []);
    }).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [reloadKey]);

  const post = async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setNotice(null);
    try {
      const r = await fetch("/api/admin/client-topups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      setNotice({ ok: r.ok, text: d.message || (r.ok ? "Done." : "Something went wrong.") });
      if (r.ok) { setRejecting(null); setReason(""); setReloadKey((k) => k + 1); }
      return r.ok;
    } finally { setBusy(null); }
  };

  const count = (f: Filter) => topups.filter((t) => f === "all" || t.status === f).length;
  const shown = topups.filter((t) => filter === "all" || t.status === filter);
  const dirty = JSON.stringify(draft) !== JSON.stringify(wallets);
  const inputCls = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PageHeader icon={Bitcoin} title="Client top-ups" description="Clients pay into your crypto wallets, then submit the transaction ID. Check it, then confirm to credit their wallet." />
        {notice && <Notice tone={notice.ok ? "success" : "error"}>{notice.text}</Notice>}

        {/* Review queue */}
        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <p className="font-semibold text-foreground">Top-up requests</p>
            <Segmented<Filter> value={filter} onChange={setFilter} options={[
              { value: "pending", label: "To check", count: count("pending") },
              { value: "success", label: "Confirmed", count: count("success") },
              { value: "failed", label: "Rejected", count: count("failed") },
              { value: "all", label: "All", count: topups.length },
            ]} />
          </div>
          {loading ? (
            <SkeletonList rows={3} className="rounded-none border-0" />
          ) : shown.length === 0 ? (
            <div className="p-6"><EmptyState icon={Receipt} title={filter === "pending" ? "Nothing to check" : "None here"} description={filter === "pending" ? "New crypto top-ups from clients appear here." : undefined} /></div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {shown.map((t) => (
                <li key={t.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10"><Bitcoin size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{t.org.name} <span className="font-normal text-zinc-400">· {t.org.workEmail}</span></p>
                      <p className="text-sm text-zinc-500">
                        {formatDate(t.createdAt)} · {t.provider === "crypto" ? `${t.asset ?? "?"} on ${t.network ?? "?"}` : t.provider ?? "—"}
                      </p>
                      {t.txHash && (
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <code className="break-all rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">{t.txHash}</code>
                          {t.explorer && <a href={t.explorer} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">Check on blockchain<ExternalLink size={11} /></a>}
                          {t.proofUrl && <a href={t.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">Screenshot<ExternalLink size={11} /></a>}
                        </p>
                      )}
                      {t.address && <p className="mt-1 truncate text-[11px] text-zinc-400">To {t.address}</p>}
                      {t.status === "failed" && t.rejectReason && <p className="mt-1 text-xs text-red-600">Rejected: {t.rejectReason}</p>}
                      {t.status === "success" && t.claimedAmount != null && t.claimedAmount !== t.amount && <p className="mt-1 text-xs text-zinc-500">Client said {formatUsd(t.claimedAmount)}; confirmed {formatUsd(t.amount)}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold tabular-nums text-foreground">{formatUsd(t.amount)}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium",
                        t.status === "pending" ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" : t.status === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300")}>
                        {t.status === "pending" ? "To check" : t.status === "success" ? "Confirmed" : "Rejected"}
                      </span>
                    </div>
                  </div>
                  {t.status === "pending" && (
                    rejecting === t.id ? (
                      <div className="flex flex-col gap-2 pl-[52px] sm:flex-row">
                        <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? e.g. transaction not found, wrong network" className={inputCls} />
                        <div className="flex gap-2">
                          <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" disabled={!reason.trim() || busy === t.id} onClick={() => post(t.id, { action: "reject", id: t.id, reason })}>Reject</Button>
                          <Button size="sm" variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 pl-[52px]">
                        <div className="relative w-36">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
                          <input type="number" min="0.01" step="0.01" value={amounts[t.id] ?? String(t.amount)} onChange={(e) => setAmounts((a) => ({ ...a, [t.id]: e.target.value }))} className={cn(inputCls, "pl-6")} title="Amount that actually arrived" />
                        </div>
                        <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy === t.id}
                          onClick={() => confirm(`Credit ${formatUsd(Number(amounts[t.id] ?? t.amount))} to ${t.org.name}'s wallet?`) && post(t.id, { action: "confirm", id: t.id, amount: amounts[t.id] ?? t.amount })}>
                          {busy === t.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Confirm
                        </Button>
                        <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900" onClick={() => { setRejecting(t.id); setReason(""); }}><X size={14} />Reject</Button>
                        <span className="text-xs text-zinc-400">Adjust the amount if less arrived.</span>
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Receiving wallets */}
        <Panel className="p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10"><Wallet size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Your crypto wallets</p>
              <p className="text-sm text-zinc-500">Clients see these on their Wallet page. Double-check every address — payments to a wrong address can&apos;t be recovered.</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {draft.length === 0 && <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">No wallets yet — clients can&apos;t top up until you add one.</p>}
            {draft.map((w, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[110px_130px_minmax(0,1fr)_auto] dark:border-zinc-800">
                <select className={inputCls} value={w.asset} onChange={(e) => setDraft((d) => d.map((x, k) => (k === i ? { ...x, asset: e.target.value } : x)))}>
                  {Array.from(new Set([...CRYPTO_ASSETS, w.asset])).filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <select className={inputCls} value={w.network} onChange={(e) => setDraft((d) => d.map((x, k) => (k === i ? { ...x, network: e.target.value } : x)))}>
                  {Array.from(new Set([...CRYPTO_NETWORKS, w.network])).filter(Boolean).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <input className={cn(inputCls, "font-mono")} value={w.address} onChange={(e) => setDraft((d) => d.map((x, k) => (k === i ? { ...x, address: e.target.value.trim() } : x)))} placeholder="Receiving address" />
                <button type="button" onClick={() => setDraft((d) => d.filter((_, k) => k !== i))} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" aria-label="Remove wallet"><Trash2 size={16} /></button>
                <input className={cn(inputCls, "sm:col-span-4")} value={w.note ?? ""} onChange={(e) => setDraft((d) => d.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)))} placeholder="Note for clients (optional), e.g. minimum 10 USDT" />
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setDraft((d) => [...d, { id: "", asset: "USDT", network: "TRC20", address: "" }])}><Plus size={14} />Add wallet</Button>
            {dirty && <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" disabled={busy === "wallets"} onClick={() => post("wallets", { action: "save_wallets", wallets: draft })}>{busy === "wallets" && <Loader2 size={14} className="animate-spin" />}Save wallets</Button>}
            {dirty && <Button size="sm" variant="outline" onClick={() => setDraft(wallets)}>Undo changes</Button>}
          </div>
        </Panel>
      </div>
    </AdminLayout>
  );
}
