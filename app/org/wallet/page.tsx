"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OrgLayout } from "@/components/org-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Loader2, Wallet, Plus, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

interface Tx { id: string; type: string; amount: number; status: string; provider?: string | null; createdAt: string; meta?: { projectId?: string } | null; }

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
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => fetch("/api/org/wallet").then((r) => r.ok ? r.json() : null).then((d) => {
    if (d) { setBalance(d.walletBalance ?? 0); setConfigured(d.paystackConfigured); setTxs(d.transactions ?? []); }
  }).catch(() => {}).finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);

  // Returning from Paystack checkout → verify + credit, then clean the URL.
  useEffect(() => {
    if (!ref) return;
    (async () => {
      try {
        const res = await fetch("/api/org/wallet/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: ref }) });
        const d = await res.json();
        if (res.ok && d.credited) setNotice("✓ Payment received — wallet topped up.");
        else if (res.ok && d.status === "already_credited") setNotice("✓ This payment was already applied.");
        else if (res.ok && d.status === "not_successful") setNotice("✗ Payment was not completed.");
        else setNotice(d.message || "Could not verify payment.");
      } catch { setNotice("Could not verify payment."); }
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
      setNotice(d.message || "Could not start payment.");
    } catch { setNotice("Could not start payment."); } finally { setFunding(false); }
  };

  if (loading) return <OrgLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div></OrgLayout>;

  return (
    <OrgLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Wallet &amp; Billing</h1>

        {notice && <div className={`p-3 rounded-lg text-sm ${notice.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{notice}</div>}

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center"><Wallet size={24} /></div>
              <div><p className="text-sm text-zinc-500">Available balance</p><p className="text-3xl font-bold text-emerald-600">{formatCurrency(balance)}</p></div>
            </div>
            <div className="mt-5 border-t border-zinc-100 dark:border-zinc-800 pt-4">
              {configured ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in GH₵" className="flex-1" />
                  <Button onClick={fund} disabled={funding || !(Number(amount) >= 1)} className="bg-emerald-600 hover:bg-emerald-700">
                    {funding ? <><Loader2 size={16} className="mr-1 animate-spin" />Starting…</> : <><Plus size={16} className="mr-1" />Add funds</>}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Online funding isn&rsquo;t enabled yet. Contact HustleClickGH to top up your wallet.</p>
              )}
              <p className="text-xs text-zinc-400 mt-2">Funds are held in your wallet and allocated to projects when you create them. Contributor rewards are paid from a project&rsquo;s funded budget.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="font-semibold text-foreground mb-3">Transactions</h2>
            {txs.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">No transactions yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {txs.map((t) => {
                  const isIn = t.type === "fund";
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {isIn ? <ArrowDownCircle size={18} className="text-emerald-500 shrink-0" /> : <ArrowUpCircle size={18} className="text-blue-500 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground capitalize">{t.type === "fund" ? "Wallet top-up" : t.type === "allocation" ? "Project funding" : t.type}</p>
                          <p className="text-xs text-zinc-500">{formatDate(t.createdAt)}{t.status !== "success" ? ` · ${t.status}` : ""}</p>
                        </div>
                      </div>
                      <p className={`text-sm font-semibold shrink-0 ${isIn ? "text-emerald-600" : "text-zinc-600 dark:text-zinc-300"}`}>{isIn ? "+" : "−"}{formatCurrency(t.amount)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </OrgLayout>
  );
}

export default function OrgWalletPage() {
  return (
    <Suspense fallback={<OrgLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div></OrgLayout>}>
      <WalletContent />
    </Suspense>
  );
}
