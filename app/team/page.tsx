"use client";

// Field-team leader home: invite link, bulk payments received from
// HustleClickGH, who still needs paying, and the team itself.

import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader, StatCard, Panel, EmptyState, Notice, Segmented, PageSkeleton, SkeletonList } from "@/components/ui/page-kit";
import { Network, Users, Wallet, CheckCircle2, Copy, Check, Loader2, Send, Clock, Phone, Crown, UserCog } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { leaderLabel } from "@/lib/leader-label";
import { formatMoney } from "@/lib/currency";
import { ReceiptUpload } from "@/components/receipt-upload";
import { ProjectTrackerPanel } from "@/components/admin/project-tracker-panel";

type Money = { amount: number; fee: number; count: number };
interface Payable {
  id: string; leaderId: string; leaderName: string; contributorId: string; contributorName: string; contributorRef: string; contributorPhone: string;
  projectTitle: string; currency: string; amount: number; feeAmount: number; status: "owed" | "sent" | "paid"; paidAt: string | null; createdAt: string;
  contributorConfirmedAt: string | null; disputeNote: string | null; paidReceiptUrl: string | null;
}
interface Payout { id: string; leaderId: string; kind: string; currency: string; total: number; amount: number; feeAmount: number; itemCount: number; method: string; reference: string | null; localCurrency: string | null; localAmount: number | null; status: string; createdAt: string }
interface Member { id: string; userId: string; fullName: string; phone: string; city: string | null; status: string; leaderRole: string | null; teamLeaderId: string | null; teamJoinedAt: string | null }
interface TeamData {
  me: { id: string; leaderRole: string | null; leaderAlsoSupervisor?: boolean; leaderCountry: string | null; leaderFeePercent: number | null; teamCode: string | null };
  leader: null | { currency: string; members: Member[]; money: Record<string, { owed: Money; sent: Money; paid: Money }>; payouts: Payout[]; payables: Payable[] };
}

export default function TeamPage() {
  const [data, setData] = useState<TeamData | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"projects" | "pay" | "team" | "history">("projects");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [projects, setProjects] = useState<any[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/team/projects").then((r) => r.json()).then((d) => alive && setProjects(d.projects ?? [])).catch(() => alive && setProjects([]));
    return () => { alive = false; };
  }, [reload]);
  const [proof, setProof] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/team").then((r) => r.json()).then((d) => alive && setData(d)).catch(() => {});
    return () => { alive = false; };
  }, [reload]);

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setNotice(null);
    const r = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    setNotice({ ok: r.ok, text: d.message || (r.ok ? "Done" : "Failed") });
    if (r.ok) { setSelected(new Set()); setProof(""); setReload((k) => k + 1); }
  };

  const L = data?.leader;
  const myId = data?.me.id;
  // Money already sent by HustleClickGH, grouped by the person still to be paid.
  const toPay = useMemo(() => {
    const m = new Map<string, { name: string; ref: string; phone: string; via: string | null; currency: string; amount: number; ids: string[]; projects: Set<string> }>();
    for (const p of L?.payables ?? []) {
      if (p.status !== "sent") continue;
      const key = `${p.contributorId}:${p.currency}`;
      const g = m.get(key) ?? { name: p.contributorName, ref: p.contributorRef, phone: p.contributorPhone, via: p.leaderId !== myId ? p.leaderName : null, currency: p.currency, amount: 0, ids: [], projects: new Set<string>() };
      g.amount += p.amount; g.ids.push(p.id); g.projects.add(p.projectTitle);
      m.set(key, g);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [L, myId]);

  if (!data) {
    return <DashboardLayout><PageSkeleton /></DashboardLayout>;
  }
  if (!data.me.leaderRole || !L) {
    return (
      <DashboardLayout>
        <EmptyState icon={Network} title="You're not a team leader" description="Team leaders are appointed by HustleClickGH. To join a team, use your supervisor's code on your Profile." />
      </DashboardLayout>
    );
  }

  const isRep = data.me.leaderRole === "representative";
  const link = typeof window !== "undefined" ? `${window.location.origin}/join/${data.me.teamCode}` : "";
  const shareText = `Join my HustleClickGH team and get paid for AI data projects: ${link}`;
  const selectedIds = toPay.filter(([id]) => selected.has(id)).flatMap(([, g]) => g.ids);
  const selectedTotals = toPay.filter(([id]) => selected.has(id)).reduce<Record<string, number>>((s, [, g]) => ({ ...s, [g.currency]: (s[g.currency] ?? 0) + g.amount }), {});
  const selectedTotal = Object.entries(selectedTotals).map(([c, a]) => formatMoney(a, c)).join(" + ");
  // Totals per currency (a team normally works in one).
  const sum = (k: "owed" | "sent" | "paid", withFee: boolean) => {
    const entries = Object.entries(L.money).filter(([, v]) => v[k].count > 0);
    return entries.length ? entries.map(([c, v]) => formatMoney(v[k].amount + (withFee ? v[k].fee : 0), c)).join(" · ") : formatMoney(0, L.currency);
  };
  const count = (k: "owed" | "sent" | "paid") => Object.values(L.money).reduce((n, v) => n + v[k].count, 0);
  const sentFees = Object.entries(L.money).filter(([, v]) => v.sent.fee > 0).map(([c, v]) => formatMoney(v.sent.fee, c)).join(" · ");
  const pendingPayouts = L.payouts.filter((p) => p.status === "sent" && p.leaderId === data.me.id);
  const supervisors = L.members.filter((m) => m.leaderRole === "supervisor");
  const contributors = L.members.filter((m) => !m.leaderRole);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          icon={isRep ? Crown : UserCog}
          title="My Team"
          description={`${leaderLabel(data.me.leaderRole, data.me.leaderAlsoSupervisor)}${data.me.leaderCountry ? ` · ${data.me.leaderCountry}` : ""} · you earn ${data.me.leaderFeePercent ?? 0}% on each approved item.`}
        />

        {/* Invite */}
        <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-500">Your team code</p>
            <p className="font-mono text-2xl font-semibold tracking-wider text-foreground">{data.me.teamCode}</p>
            <p className="text-xs text-zinc-500">People join your team with this code or the invite link.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
              {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy invite link"}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
              <Send size={15} />Share on WhatsApp
            </a>
          </div>
        </Panel>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} tone="blue" label="Team" value={contributors.length} hint={isRep ? `${supervisors.length} supervisor${supervisors.length === 1 ? "" : "s"}` : undefined} />
          <StatCard icon={Clock} tone="slate" label="Incoming" value={sum("owed", true)} hint={`${count("owed")} approved item${count("owed") === 1 ? "" : "s"}`} />
          <StatCard icon={Wallet} tone="amber" label="To pay out" value={sum("sent", false)} hint={sentFees ? `+ ${sentFees} your fees` : undefined} />
          <StatCard icon={CheckCircle2} tone="green" label="Paid out" value={sum("paid", false)} />
        </div>

        {notice && <Notice tone={notice.ok ? "success" : "error"}>{notice.text}</Notice>}

        {/* Bulk payments waiting for confirmation */}
        {pendingPayouts.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900 dark:bg-emerald-500/5">
            <div>
              <p className="font-semibold text-foreground">HustleClickGH sent you {formatMoney(p.total, p.currency)}{p.kind === "advance" ? " in advance" : ""}{p.localAmount ? ` (${p.localAmount.toLocaleString()} ${p.localCurrency})` : ""}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {formatDate(p.createdAt)} · {p.method}{p.reference ? ` · ref ${p.reference}` : ""} · {p.kind === "advance" ? `covers upcoming approved items` : `${formatMoney(p.amount, p.currency)} for ${p.itemCount} item${p.itemCount === 1 ? "" : "s"} + ${formatMoney(p.feeAmount, p.currency)} fees`}
              </p>
            </div>
            <button disabled={busy === p.id} onClick={() => act(p.id, { action: "acknowledge", payoutId: p.id })}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {busy === p.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}I received it
            </button>
          </div>
        ))}

        <Segmented value={tab} onChange={setTab} options={[
          { value: "projects", label: "Projects", count: projects?.length ?? 0 },
          { value: "pay", label: "To pay", count: toPay.length },
          { value: "team", label: "Team", count: L.members.length },
          { value: "history", label: "Paid", count: count("paid") },
        ]} />

        {tab === "projects" && (
          projects === null ? (
            <SkeletonList rows={4} className="rounded-none border-0 bg-transparent dark:bg-transparent" />
          ) : projects.length === 0 ? (
            <EmptyState icon={Network} title="No projects yet" description="Projects assigned to your team, or that your team works on, appear here with their progress." />
          ) : (
            <div className="space-y-5">
              {projects.map((pr) => (
                <div key={pr.project.id} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-foreground">{pr.project.title}</h3>
                    <span className="text-xs text-zinc-500">{formatMoney(pr.project.reward, pr.project.currency)} per approved item · {pr.project.status}</span>
                  </div>
                  <ProjectTrackerPanel data={pr} compact />
                </div>
              ))}
            </div>
          )
        )}

        {tab === "pay" && (
          toPay.length === 0 ? (
            <EmptyState icon={Wallet} title="Nobody to pay right now" description="When HustleClickGH sends you a bulk payment, the people it covers appear here." />
          ) : (
            <Panel className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 rounded" checked={selected.size === toPay.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(toPay.map(([id]) => id)) : new Set())} />
                  Select all
                </label>
                <button disabled={!selectedIds.length || busy === "pay"} onClick={() => act("pay", { action: "mark_paid", ids: selectedIds, receiptUrl: proof })}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy === "pay" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {selectedIds.length ? `Mark ${selected.size} paid · ${selectedTotal}` : "Mark as paid"}
                </button>
              </div>
              <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                <p className="mb-2 text-xs text-zinc-500">Paid them outside the app (MoMo, crypto…)? Attach the receipt or screenshot — it protects you if anyone says they weren&apos;t paid.</p>
                <ReceiptUpload value={proof} onChange={setProof} label="Attach proof of payment" />
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {toPay.map(([cid, g]) => (
                  <li key={cid}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                      <input type="checkbox" className="h-4 w-4 shrink-0 rounded" checked={selected.has(cid)}
                        onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; })} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground">{g.name} <span className="text-xs font-normal text-zinc-400">{g.ref}</span></span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                          <a href={`tel:${g.phone}`} className="inline-flex items-center gap-1 hover:underline" onClick={(e) => e.stopPropagation()}><Phone size={11} />{g.phone}</a>
                          <span>· {g.ids.length} item{g.ids.length === 1 ? "" : "s"} · {Array.from(g.projects).join(", ")}</span>
                          {g.via && <span className="text-violet-600">· team of {g.via}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatMoney(g.amount, g.currency)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </Panel>
          )
        )}

        {tab === "team" && (
          L.members.length === 0 ? (
            <EmptyState icon={Users} title="No team members yet" description="Share your invite link — people who join appear here." />
          ) : (
            <Panel className="overflow-hidden">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {[...supervisors, ...contributors].map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", m.leaderRole ? "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300")}>
                      {m.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium text-foreground">{m.fullName}{m.leaderRole && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">Supervisor</span>}</span>
                      <span className="block truncate text-xs text-zinc-500">{m.userId} · {m.phone}{m.city ? ` · ${m.city}` : ""}{m.teamLeaderId !== data.me.id ? " · in a supervisor's team" : ""}</span>
                    </span>
                    {m.status !== "active" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">Suspended</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          )
        )}

        {tab === "history" && (
          L.payables.filter((p) => p.status === "paid").length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No payments marked yet" />
          ) : (
            <Panel className="overflow-hidden">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {L.payables.filter((p) => p.status === "paid").slice(0, 100).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{p.contributorName}</span>
                      <span className="block truncate text-xs text-zinc-500">{p.projectTitle} · paid {p.paidAt ? formatDate(p.paidAt) : ""}{p.paidReceiptUrl && <> · <a href={p.paidReceiptUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">proof</a></>}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                      {p.disputeNote ? <span className="text-[11px] font-medium text-red-600">Reported a problem</span>
                        : p.contributorConfirmedAt ? <span className="text-[11px] font-medium text-emerald-600">Confirmed</span>
                        : <span className="text-[11px] text-zinc-400">Awaiting confirmation</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
