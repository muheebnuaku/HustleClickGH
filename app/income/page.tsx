"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader, Panel, Segmented, EmptyState, PageSkeleton } from "@/components/ui/page-kit";
import {
  WalletCards, CheckCircle2, Clock, XCircle, Loader2, ArrowUpRight, Receipt, Smartphone, ShieldCheck, Sparkles, Check,
} from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { SITE_CONFIG } from "@/lib/constants";
import { TeamCard } from "@/components/team-card";

interface Withdrawal {
  id: string;
  amount: number;
  paymentMethod: string;
  mobileNumber: string;
  accountName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  processedAt?: string | null;
  notes?: string | null;
  receiptUrl?: string | null;
}

const MIN = SITE_CONFIG.survey.minWithdrawal;

// `value` is what's stored (admins see it on the Payments page) — unchanged.
const NETWORKS = [
  { value: "MTN Mobile Money", label: "MTN MoMo", dot: "bg-yellow-400", ring: "border-yellow-400 bg-yellow-50 dark:bg-yellow-500/10" },
  { value: "Vodafone Cash", label: "Telecel Cash", dot: "bg-red-500", ring: "border-red-400 bg-red-50 dark:bg-red-500/10" },
  { value: "AirtelTigo Money", label: "AT Money", dot: "bg-blue-500", ring: "border-blue-400 bg-blue-50 dark:bg-blue-500/10" },
];

const STATUS = {
  pending: { label: "Processing", icon: Clock, pill: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400", iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-500/10" },
  approved: { label: "Paid", icon: CheckCircle2, pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400", iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" },
  rejected: { label: "Rejected", icon: XCircle, pill: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400", iconBg: "bg-red-50 text-red-600 dark:bg-red-500/10" },
} as const;

type Filter = "all" | "pending" | "approved" | "rejected";

const inputCls =
  "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const round2 = (n: number) => Math.floor(n * 100) / 100;

export default function IncomePage() {
  const router = useRouter();
  const { status } = useSession();
  const [isFetching, setIsFetching] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [userBalance, setUserBalance] = useState(0);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  // Form
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [touched, setTouched] = useState(false);

  const fetchData = async (prefill = false) => {
    try {
      const [statsRes, withdrawalsRes] = await Promise.all([fetch("/api/dashboard/stats"), fetch("/api/withdrawals")]);
      const statsData = await statsRes.json();
      const withdrawalsData = await withdrawalsRes.json();
      const list: Withdrawal[] = withdrawalsData.withdrawals || [];
      setUserBalance(statsData.balance || 0);
      setWithdrawals(list);
      // Save people retyping: reuse the payout details from their last request.
      if (prefill && list[0]) {
        setNetwork(list[0].paymentMethod);
        setMobileNumber(list[0].mobileNumber);
        setAccountName(list[0].accountName);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") fetchData(true);
  }, [status, router]);

  // Money already in pending requests can't be requested again (server enforces the same).
  const pendingTotal = useMemo(() => withdrawals.filter((w) => w.status === "pending").reduce((s, w) => s + w.amount, 0), [withdrawals]);
  const paidTotal = useMemo(() => withdrawals.filter((w) => w.status === "approved").reduce((s, w) => s + w.amount, 0), [withdrawals]);
  const available = Math.max(0, round2(userBalance - pendingTotal));
  const canWithdraw = available >= MIN;

  const amt = Number(amount);
  const digits = mobileNumber.replace(/\D/g, "");
  const errors = {
    amount: !amount ? "Enter an amount." : !(amt > 0) ? "Enter a valid amount." : amt < MIN ? `Minimum is ${formatCurrency(MIN)}.` : amt > available ? `You can withdraw up to ${formatCurrency(available)}.` : "",
    network: network ? "" : "Choose your network.",
    mobileNumber: digits.length < 10 ? "Enter your 10-digit Mobile Money number." : "",
    accountName: accountName.trim().length < 2 ? "Enter the name on your Mobile Money account." : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const networkMeta = NETWORKS.find((n) => n.value === network);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setResult(null);
    if (hasErrors) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, paymentMethod: network, mobileNumber: mobileNumber.trim(), accountName: accountName.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || "Withdrawal request failed");
      setResult({ ok: true, text: `Request sent — ${formatCurrency(amt)} to ${networkMeta?.label ?? network} ${mobileNumber}. We'll notify you once it's paid.` });
      setAmount("");
      setTouched(false);
      await fetchData();
    } catch (error: unknown) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Failed to submit withdrawal request" });
    } finally {
      setSubmitting(false);
    }
  };

  const shown = filter === "all" ? withdrawals : withdrawals.filter((w) => w.status === filter);
  const count = (s: Withdrawal["status"]) => withdrawals.filter((w) => w.status === s).length;

  if (status === "loading" || isFetching) {
    return (
      <DashboardLayout>
        <PageSkeleton stats={3} />
      </DashboardLayout>
    );
  }

  const err = (k: keyof typeof errors) => touched && errors[k] ? <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{errors[k]}</p> : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader icon={WalletCards} title="Withdraw" description="Cash out your earnings to Mobile Money." />

        {/* Balance hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-6 text-white shadow-lg shadow-emerald-900/10 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/5" />
          <p className="text-sm font-medium text-emerald-50/90">Available to withdraw</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{formatCurrency(available)}</p>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-sm">
            <div>
              <p className="text-emerald-50/80">Balance</p>
              <p className="font-semibold tabular-nums">{formatCurrency(userBalance)}</p>
            </div>
            <div>
              <p className="text-emerald-50/80">Processing</p>
              <p className="font-semibold tabular-nums">{formatCurrency(pendingTotal)}</p>
            </div>
            <div>
              <p className="text-emerald-50/80">Paid out</p>
              <p className="font-semibold tabular-nums">{formatCurrency(paidTotal)}</p>
            </div>
          </div>
        </div>

        <TeamCard mode="payments" />

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Request form */}
          <Panel className="p-5 sm:p-6 lg:col-span-3">
            <h2 className="text-lg font-semibold text-foreground">Request a withdrawal</h2>
            <p className="mt-0.5 text-sm text-zinc-500">Paid to your Mobile Money wallet after a quick review.</p>

            {!canWithdraw ? (
              <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"><Sparkles size={22} /></span>
                <p className="mt-3 font-medium text-foreground">
                  {pendingTotal > 0 && userBalance >= MIN
                    ? "Your balance is already in a request being processed."
                    : `Earn ${formatCurrency(round2(MIN - available))} more to withdraw`}
                </p>
                <p className="mt-1 text-sm text-zinc-500">The minimum withdrawal is {formatCurrency(MIN)}.</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (available / MIN) * 100)}%` }} />
                </div>
                <Link href="/data-projects" className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                  Find projects to earn <ArrowUpRight size={15} />
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
                {/* Amount */}
                <div>
                  <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-foreground">Amount</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-zinc-400">GH₵</span>
                    <input
                      id="amount"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={MIN}
                      max={available}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={submitting}
                      placeholder="0.00"
                      className={cn(inputCls, "py-4 pl-16 text-2xl font-semibold tabular-nums")}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      { label: `Min ${formatCurrency(MIN)}`, v: MIN },
                      { label: "Half", v: round2(available / 2) },
                      { label: "All", v: available },
                    ].filter((c) => c.v >= MIN).map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => setAmount(String(c.v))}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          amt === c.v ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-zinc-200 text-zinc-600 hover:border-emerald-400 dark:border-zinc-700 dark:text-zinc-300",
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {err("amount")}
                </div>

                {/* Network */}
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-foreground">Network</span>
                  <div className="grid grid-cols-3 gap-2">
                    {NETWORKS.map((n) => (
                      <button
                        key={n.value}
                        type="button"
                        onClick={() => setNetwork(n.value)}
                        disabled={submitting}
                        className={cn(
                          "relative flex flex-col items-center gap-2 rounded-xl border-2 px-2 py-3 text-xs font-semibold transition-colors sm:text-sm",
                          network === n.value ? n.ring : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300",
                        )}
                      >
                        <span className={cn("h-3.5 w-3.5 rounded-full", n.dot)} />
                        {n.label}
                        {network === n.value && <Check size={14} className="absolute right-2 top-2 text-foreground" />}
                      </button>
                    ))}
                  </div>
                  {err("network")}
                </div>

                {/* Number + name */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="mobileNumber" className="mb-1.5 block text-sm font-medium text-foreground">Mobile Money number</label>
                    <div className="relative">
                      <Smartphone size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input id="mobileNumber" type="tel" inputMode="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} disabled={submitting} placeholder="024 XXX XXXX" className={cn(inputCls, "pl-10")} />
                    </div>
                    {err("mobileNumber")}
                  </div>
                  <div>
                    <label htmlFor="accountName" className="mb-1.5 block text-sm font-medium text-foreground">Account name</label>
                    <input id="accountName" value={accountName} onChange={(e) => setAccountName(e.target.value)} disabled={submitting} placeholder="Name on your MoMo wallet" className={inputCls} />
                    {err("accountName")}
                  </div>
                </div>

                {/* Summary */}
                {amt >= MIN && amt <= available && network && digits.length >= 10 && (
                  <div className="rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
                    <div className="flex justify-between"><span className="text-zinc-500">You&apos;ll receive</span><span className="font-semibold tabular-nums text-foreground">{formatCurrency(amt)}</span></div>
                    <div className="mt-1 flex justify-between"><span className="text-zinc-500">To</span><span className="font-medium text-foreground">{networkMeta?.label} · {mobileNumber}</span></div>
                    <div className="mt-1 flex justify-between"><span className="text-zinc-500">Balance after</span><span className="tabular-nums text-foreground">{formatCurrency(round2(available - amt))}</span></div>
                  </div>
                )}

                {result && (
                  <div className={cn("rounded-xl border px-4 py-3 text-sm",
                    result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300")}>
                    {result.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-60"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpRight size={16} />}
                  {submitting ? "Sending request…" : amt >= MIN ? `Withdraw ${formatCurrency(amt)}` : "Request withdrawal"}
                </button>
                <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                  <ShieldCheck size={13} />Make sure the account name matches your Mobile Money registration.
                </p>
              </form>
            )}
            {!canWithdraw && result && (
              <div className={cn("mt-4 rounded-xl border px-4 py-3 text-sm", result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-red-200 bg-red-50 text-red-700")}>
                {result.text}
              </div>
            )}
          </Panel>

          {/* History */}
          <Panel className="overflow-hidden lg:col-span-2">
            <div className="space-y-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-foreground">History</h2>
              {withdrawals.length > 0 && (
                <Segmented<Filter>
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "All", count: withdrawals.length },
                    { value: "pending", label: "Processing", count: count("pending") },
                    { value: "approved", label: "Paid", count: count("approved") },
                    { value: "rejected", label: "Rejected", count: count("rejected") },
                  ]}
                />
              )}
            </div>
            {withdrawals.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={Receipt} title="No withdrawals yet" description="Your requests and payments will show up here." />
              </div>
            ) : shown.length === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">Nothing here.</p>
            ) : (
              <ul className="max-h-[560px] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                {shown.map((w) => {
                  const st = STATUS[w.status] ?? STATUS.pending;
                  const net = NETWORKS.find((n) => n.value === w.paymentMethod);
                  return (
                    <li key={w.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", st.iconBg)}><st.icon size={18} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold tabular-nums text-foreground">{formatCurrency(w.amount)}</p>
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", st.pill)}>{st.label}</span>
                          </div>
                          <p className="truncate text-xs text-zinc-500">{net?.label ?? w.paymentMethod} · {w.mobileNumber}</p>
                          <p className="mt-0.5 text-xs text-zinc-400">
                            Requested {formatDate(w.requestedAt)}
                            {w.processedAt && ` · ${w.status === "approved" ? "Paid" : "Updated"} ${formatDate(w.processedAt)}`}
                          </p>
                          {w.status === "rejected" && w.notes && (
                            <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">Reason: {w.notes}</p>
                          )}
                          {w.status === "approved" && w.receiptUrl && (
                            <a href={w.receiptUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                              <Receipt size={12} />View payment receipt
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </DashboardLayout>
  );
}
