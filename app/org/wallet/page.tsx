"use client";

import { useCallback, useEffect, useState } from "react";
import { OrgLayout } from "@/components/org-layout";
import { PageHeader, PageSkeleton, Panel, Notice, Segmented, EmptyState } from "@/components/ui/page-kit";
import { ReceiptUpload } from "@/components/receipt-upload";
import { SITE_CONFIG } from "@/lib/constants";
import { cn, formatUsd, formatDate } from "@/lib/utils";
import { Loader2, Wallet, ArrowDownLeft, ArrowUpRight, Receipt, Copy, Check, AlertTriangle, Bitcoin, Clock, MessageCircle } from "lucide-react";

interface Tx {
  id: string; type: string; amount: number; status: string; provider?: string | null; createdAt: string;
  meta?: { projectId?: string; asset?: string; network?: string; txHash?: string; rejectReason?: string } | null;
}
interface CryptoWallet { id: string; asset: string; network: string; address: string; note?: string }
type TxFilter = "all" | "fund" | "allocation";
const QUICK = [100, 250, 500, 1000];
const WHATSAPP = SITE_CONFIG.social.find((s) => s.key === "whatsapp")?.url;

export default function OrgWalletPage() {
  const [balance, setBalance] = useState(0);
  const [wallets, setWallets] = useState<CryptoWallet[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<TxFilter>("all");
  const [pick, setPick] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ amount: "", txHash: "", proofUrl: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => fetch("/api/org/wallet").then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (!d) return;
    setBalance(d.walletBalance ?? 0);
    setTxs(d.transactions ?? []);
    setWallets(d.cryptoWallets ?? []);
    setPick((p) => p || d.cryptoWallets?.[0]?.id || "");
  }).catch(() => {}).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);

  const wallet = wallets.find((w) => w.id === pick);

  const copy = async () => {
    if (!wallet) return;
    try { await navigator.clipboard.writeText(wallet.address); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const submit = async () => {
    if (!wallet || busy) return;
    setBusy(true); setNotice(null);
    try {
      const res = await fetch("/api/org/wallet/claim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(form.amount), walletId: wallet.id, txHash: form.txHash.trim(), proofUrl: form.proofUrl || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      setNotice({ ok: res.ok, text: d.message || (res.ok ? "Submitted." : "Couldn't submit.") });
      if (res.ok) { setForm({ amount: "", txHash: "", proofUrl: "" }); load(); }
    } catch { setNotice({ ok: false, text: "Couldn't submit." }); } finally { setBusy(false); }
  };

  if (loading) return <OrgLayout><PageSkeleton stats={3} /></OrgLayout>;

  const ok = (t: Tx) => t.status === "success";
  const fundedTotal = txs.filter((t) => t.type === "fund" && ok(t)).reduce((s, t) => s + t.amount, 0);
  const allocated = txs.filter((t) => t.type === "allocation" && ok(t)).reduce((s, t) => s + t.amount, 0);
  const pending = txs.filter((t) => t.type === "fund" && t.status === "pending");
  const shown = txs.filter((t) => filter === "all" || t.type === filter);
  const input = "h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3.5 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/20";

  return (
    <OrgLayout>
      <div className="space-y-6">
        <PageHeader icon={Wallet} title="Wallet & billing" description="Top up with crypto, then projects are funded from your wallet when they go live." />

        {notice && <Notice tone={notice.ok ? "success" : "error"}>{notice.text}</Notice>}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Balance + crypto top-up */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-7">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="relative">
              <p className="flex items-center gap-2 text-sm text-zinc-300"><Wallet size={15} />Available balance</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{formatUsd(balance)}</p>
              {pending.length > 0 && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-amber-300"><Clock size={14} />{formatUsd(pending.reduce((s, t) => s + t.amount, 0))} waiting for confirmation</p>
              )}

              {wallets.length === 0 ? (
                <div className="mt-6 rounded-xl bg-white/5 p-4 text-sm text-zinc-300 ring-1 ring-white/10">
                  Crypto payment details aren&apos;t set up yet. Message us and we&apos;ll send you where to pay.
                  {WHATSAPP && <a href={WHATSAPP} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400"><MessageCircle size={14} />Chat on WhatsApp</a>}
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Bitcoin size={16} className="text-amber-300" />Add funds with crypto</p>
                  {/* 1. Coin + network */}
                  <div className="flex flex-wrap gap-2">
                    {wallets.map((w) => (
                      <button key={w.id} type="button" onClick={() => setPick(w.id)}
                        className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors", pick === w.id ? "bg-white text-zinc-900 ring-white" : "bg-white/5 text-zinc-200 ring-white/15 hover:bg-white/10")}>
                        {w.asset} · {w.network}
                      </button>
                    ))}
                  </div>
                  {/* 2. Address */}
                  {wallet && (
                    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                      <p className="text-xs text-zinc-400">Send {wallet.asset} on the {wallet.network} network to</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <code className="min-w-0 flex-1 break-all font-mono text-sm text-white">{wallet.address}</code>
                        <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/20">
                          {copied ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}
                        </button>
                      </div>
                      {wallet.note && <p className="mt-2 text-xs text-zinc-400">{wallet.note}</p>}
                      <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-300"><AlertTriangle size={13} className="mt-0.5 shrink-0" />Only send {wallet.asset} on {wallet.network}. Other coins or networks can be lost for good.</p>
                    </div>
                  )}
                  {/* 3. Tell us */}
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-zinc-200">After you&apos;ve sent it, tell us:</p>
                    <div className="flex flex-wrap gap-2">
                      {QUICK.map((q) => (
                        <button key={q} type="button" onClick={() => setForm((f) => ({ ...f, amount: String(q) }))}
                          className={cn("rounded-full px-3 py-1 text-xs font-medium ring-1", Number(form.amount) === q ? "bg-white text-zinc-900 ring-white" : "bg-white/5 text-zinc-300 ring-white/15 hover:bg-white/10")}>${q}</button>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
                        <input type="number" min={1} step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Amount sent" className={cn(input, "pl-7")} />
                      </div>
                      <input value={form.txHash} onChange={(e) => setForm((f) => ({ ...f, txHash: e.target.value }))} placeholder="Transaction ID (hash)" className={cn(input, "font-mono")} />
                    </div>
                    <div className="rounded-xl bg-white p-2 text-zinc-900">
                      <ReceiptUpload value={form.proofUrl} onChange={(url) => setForm((f) => ({ ...f, proofUrl: url }))} label="Screenshot of the payment" />
                    </div>
                    <button onClick={submit} disabled={busy || !(Number(form.amount) >= 1) || form.txHash.trim().length < 16}
                      className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50 sm:w-auto">
                      {busy && <Loader2 size={16} className="animate-spin" />}I&apos;ve sent {Number(form.amount) >= 1 ? formatUsd(Number(form.amount)) : "it"}
                    </button>
                    <p className="text-xs text-zinc-400">We check the transaction on the blockchain and add it to your wallet — usually within a few hours.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Panel className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"><ArrowDownLeft size={18} /></span>
              <div><p className="text-xs text-zinc-500">Total added</p><p className="text-lg font-semibold tabular-nums">{formatUsd(fundedTotal)}</p></div>
            </Panel>
            <Panel className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10"><ArrowUpRight size={18} /></span>
              <div><p className="text-xs text-zinc-500">Funded into projects</p><p className="text-lg font-semibold tabular-nums">{formatUsd(allocated)}</p></div>
            </Panel>
            <Panel className="p-4 text-xs text-zinc-500 sm:col-span-2 lg:col-span-1">
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300"><Receipt size={13} />How billing works</p>
              Send crypto, tell us the transaction ID, and we add it to your wallet once it&apos;s confirmed. Your wallet funds each project when we approve it; you&apos;re only charged for submissions that pass our checks.
            </Panel>
          </div>
        </div>

        {/* Transactions */}
        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <p className="font-semibold text-foreground">Transactions</p>
            <Segmented<TxFilter> value={filter} onChange={setFilter} options={[
              { value: "all", label: "All", count: txs.length },
              { value: "fund", label: "Top-ups" },
              { value: "allocation", label: "Project funding" },
            ]} />
          </div>
          {shown.length === 0 ? (
            <div className="p-6"><EmptyState icon={Receipt} title="No transactions yet" description="Top-ups and project funding will appear here." /></div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {shown.map((t) => {
                const isIn = t.type === "fund";
                const label = !isIn ? (t.type === "allocation" ? "Project funding" : t.type) : t.provider === "crypto" ? `Crypto top-up${t.meta?.asset ? ` · ${t.meta.asset} ${t.meta.network ?? ""}` : ""}` : "Wallet top-up";
                return (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", isIn ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" : "bg-blue-50 text-blue-600 dark:bg-blue-500/10")}>
                      {isIn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{label}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {formatDate(t.createdAt)}
                        {t.meta?.txHash ? ` · ${t.meta.txHash.slice(0, 10)}…` : t.provider && t.provider !== "crypto" ? ` · ${t.provider}` : ""}
                        {t.status === "failed" && t.meta?.rejectReason ? ` · ${t.meta.rejectReason}` : ""}
                      </p>
                    </div>
                    {t.status === "pending" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Awaiting confirmation</span>}
                    {t.status === "failed" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{t.provider === "crypto" ? "Rejected" : "Failed"}</span>}
                    <p className={cn("shrink-0 text-sm font-semibold tabular-nums", isIn ? (ok(t) ? "text-emerald-600" : "text-zinc-400") : "text-zinc-700 dark:text-zinc-200")}>{isIn ? "+" : "−"}{formatUsd(t.amount)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </OrgLayout>
  );
}
