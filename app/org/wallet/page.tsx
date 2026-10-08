"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OrgLayout } from "@/components/org-layout";
import { PageHeader, PageSkeleton, Panel, Notice, Segmented, EmptyState } from "@/components/ui/page-kit";
import { cn, formatUsd, formatDate } from "@/lib/utils";
import { Loader2, Wallet, Plus, ArrowDownLeft, ArrowUpRight, Lock, Receipt, CreditCard } from "lucide-react";

interface Tx { id: string; type: string; amount: number; status: string; provider?: string | null; createdAt: string; meta?: { projectId?: string } | null; }
type TxFilter = "all" | "fund" | "allocation";
const QUICK = [50, 100, 250, 500];

function WalletContent() {
  const router = useRouter();
  const params = useSearchParams();
  const ref = params.get("ref");
  const [balance, setBalance] = useState(0);
  const [configured, setConfigured] = useState(true);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [funding, setFunding] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<TxFilter>("all");
  const [usdToGhs, setUsdToGhs] = useState<number | null>(null);

  const load = useCallback(() => fetch("/api/org/wallet").then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (d) { setBalance(d.walletBalance ?? 0); setConfigured(d.paystackConfigured); setTxs(d.transactions ?? []); setUsdToGhs(d.chargeCurrency === "GHS" ? d.usdToGhs ?? null : null); }
  }).catch(() => {}).finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);

  // Returning from Paystack checkout → verify + credit, then clean the URL.
  useEffect(() => {
    if (!ref) return;
    (async () => {
      try {
        const res = await fetch("/api/org/wallet/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: ref }) });
        const d = await res.json();
        if (res.ok && d.credited) setNotice({ ok: true, text: "Payment received — your wallet has been topped up." });
        else if (res.ok && d.status === "already_credited") setNotice({ ok: true, text: "This payment was already applied." });
        else if (res.ok && d.status === "not_successful") setNotice({ ok: false, text: "The payment wasn't completed." });
        else if (res.ok && d.status === "amount_mismatch") setNotice({ ok: false, text: d.message || "The amount paid didn't match. Contact HustleClickGH." });
        else setNotice({ ok: false, text: d.message || "Couldn't verify the payment." });
      } catch { setNotice({ ok: false, text: "Couldn't verify the payment." }); }
      router.replace("/org/wallet");
      load();
    })();
  }, [ref, router, load]);

  const fund = async () => {
    const amt = Number(amount);
    if (!(amt >= 1) || funding) return;
    setFunding(true); setNotice(null);
    try {
      const res = await fetch("/api/org/wallet/fund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: amt }) });
      const d = await res.json();
      if (res.ok && d.authorizationUrl) { window.location.href = d.authorizationUrl; return; }
      setNotice({ ok: false, text: d.message || "Couldn't start the payment." });
    } catch { setNotice({ ok: false, text: "Couldn't start the payment." }); } finally { setFunding(false); }
  };

  if (loading) return <OrgLayout><PageSkeleton stats={3} /></OrgLayout>;

  const ok = (t: Tx) => t.status === "success";
  const fundedTotal = txs.filter((t) => t.type === "fund" && ok(t)).reduce((s, t) => s + t.amount, 0);
  const allocated = txs.filter((t) => t.type === "allocation" && ok(t)).reduce((s, t) => s + t.amount, 0);
  const shown = txs.filter((t) => filter === "all" || t.type === filter);

  return (
    <OrgLayout>
      <div className="space-y-6">
        <PageHeader icon={Wallet} title="Wallet & billing" description="Top up once, then projects are funded from your wallet when they go live." />

        {notice && <Notice tone={notice.ok ? "success" : "error"}>{notice.text}</Notice>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Balance + top up */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-7">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="relative">
              <p className="flex items-center gap-2 text-sm text-zinc-300"><Wallet size={15} />Available balance</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{formatUsd(balance)}</p>
              {configured ? (
                <div className="mt-6 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {QUICK.map((q) => (
                      <button key={q} type="button" onClick={() => setAmount(String(q))}
                        className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors", Number(amount) === q ? "bg-white text-zinc-900 ring-white" : "bg-white/5 text-zinc-200 ring-white/15 hover:bg-white/10")}>
                        ${q}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
                      <input type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Other amount"
                        className="h-11 w-full rounded-xl border border-white/15 bg-white/5 pl-7 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/20" />
                    </div>
                    <button onClick={fund} disabled={funding || !(Number(amount) >= 1)}
                      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50">
                      {funding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}Add {Number(amount) >= 1 ? formatUsd(Number(amount)) : "funds"}
                    </button>
                  </div>
                  {usdToGhs && Number(amount) >= 1 && (
                    <p className="text-sm text-emerald-200">You&apos;ll pay <strong className="tabular-nums">GH₵{(Math.round(Number(amount) * usdToGhs * 100) / 100).toFixed(2)}</strong> · {formatUsd(Number(amount))} is added to your wallet</p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-zinc-400"><Lock size={12} />Secure checkout by Paystack — card or mobile money{usdToGhs ? ` · charged in Ghana cedis at today's rate ($1 = GH₵${usdToGhs.toFixed(2)})` : ""}.</p>
                </div>
              ) : (
                <p className="mt-6 rounded-xl bg-white/5 p-3 text-sm text-zinc-300 ring-1 ring-white/10">Online top-ups aren&apos;t switched on yet. Contact HustleClickGH and we&apos;ll add funds for you.</p>
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
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300"><CreditCard size={13} />How billing works</p>
              Your wallet funds each project when we approve it. You&apos;re only charged for submissions that pass our checks.
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
                return (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", isIn ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" : "bg-blue-50 text-blue-600 dark:bg-blue-500/10")}>
                      {isIn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{isIn ? "Wallet top-up" : t.type === "allocation" ? "Project funding" : t.type}</p>
                      <p className="text-xs text-zinc-500">{formatDate(t.createdAt)}{t.provider ? ` · ${t.provider}` : ""}</p>
                    </div>
                    {!ok(t) && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{t.status}</span>}
                    <p className={cn("shrink-0 text-sm font-semibold tabular-nums", isIn ? "text-emerald-600" : "text-zinc-700 dark:text-zinc-200")}>{isIn ? "+" : "−"}{formatUsd(t.amount)}</p>
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

export default function OrgWalletPage() {
  return (
    <Suspense fallback={<OrgLayout><PageSkeleton stats={3} /></OrgLayout>}>
      <WalletContent />
    </Suspense>
  );
}
