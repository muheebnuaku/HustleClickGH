"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { PageHeader, StatCard, Panel, Segmented, EmptyState, Notice, SkeletonList } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import {
  Network, Crown, UserCog, Users, Wallet, AlertTriangle, Plus, X, Loader2, Send, Copy, Check, Trash2, Globe2, ChevronRight, UserPlus,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { CURRENCIES, formatMoney, currencySymbol, currencyForCountry } from "@/lib/currency";
import { UserPicker, type PickedUser } from "@/components/admin/user-picker";
import { leaderLabel } from "@/lib/leader-label";
import { COUNTRIES } from "@/lib/countries";
import { ReceiptUpload } from "@/components/receipt-upload";

type Money = { amount: number; fee: number; count: number };
type MoneyMap = Record<string, { owed: Money; sent: Money; paid: Money }>;
interface Leader {
  id: string; userId: string; fullName: string; email: string; phone: string; country: string | null; status: string;
  leaderRole: "representative" | "supervisor"; leaderAlsoSupervisor?: boolean; leaderCountry: string | null; leaderFeePercent: number | null; teamCode: string | null; teamLeaderId: string | null;
  memberCount: number; disputes: number; currency: string; advanceCredit: Record<string, number>; money: MoneyMap;
}
interface Payout {
  id: string; leaderId: string; leaderName: string; kind: string; currency: string; amount: number; feeAmount: number; total: number; itemCount: number; method: string;
  reference: string | null; receiptUrl: string | null; localCurrency: string | null; localAmount: number | null; notes: string | null;
  status: string; createdAt: string; acknowledgedAt: string | null;
}
interface Detail {
  leader: { id: string; fullName: string; userId: string; leaderRole: string; leaderAlsoSupervisor?: boolean; leaderCountry: string | null; leaderFeePercent: number | null; leaderCurrency: string | null; teamCode: string | null; phone: string };
  currency: string;
  members: { id: string; userId: string; fullName: string; phone: string; country: string | null; city: string | null; status: string; leaderRole: string | null; leaderAlsoSupervisor?: boolean; teamJoinedAt: string | null }[];
  money: MoneyMap;
  advances: { id: string; projectId: string | null; currency: string; total: number; creditRemaining: number; itemCount: number; method: string; createdAt: string; receiptUrl: string | null }[];
  advanceCredit: Record<string, number>;
  payables: { id: string; leaderId: string; leaderName: string; contributorName: string; contributorRef: string; projectTitle: string; currency: string; amount: number; feeAmount: number; status: string; createdAt: string; disputeNote: string | null; contributorConfirmedAt: string | null; paidReceiptUrl: string | null }[];
}

const inputCls = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-900";
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
// Amounts are kept per currency (MK and GH₵ are never added together).
type Pairs = Record<string, number>;
const owedPairs = (m: MoneyMap): Pairs =>
  Object.fromEntries(Object.entries(m).map(([c, v]) => [c, v.owed.amount + v.owed.fee]).filter(([, a]) => (a as number) > 0.0001));
const addPairs = (a: Pairs, b: Pairs): Pairs => { const o = { ...a }; for (const [c, v] of Object.entries(b)) o[c] = (o[c] ?? 0) + v; return o; };
const fmtPairs = (p: Pairs, fallback = "GHS") => (Object.keys(p).length ? Object.entries(p).map(([c, a]) => formatMoney(a, c)).join(" · ") : formatMoney(0, fallback));

function RoleBadge({ role, also }: { role: string; also?: boolean }) {
  return role === "representative" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"><Crown size={11} />Representative{also && <><span className="opacity-50">+</span><UserCog size={11} />Supervisor</>}</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><UserCog size={11} />Supervisor</span>
  );
}

export default function FieldTeamsPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"structure" | "payouts">("structure");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [appointOpen, setAppointOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/teams");
      const d = await r.json();
      setLeaders(d.leaders || []);
      setPayouts(d.payouts || []);
      // Deep link from the Users page: /admin/teams?leader=<id> opens that team.
      const want = new URLSearchParams(window.location.search).get("leader");
      if (want && (d.leaders || []).some((l: Leader) => l.id === want)) {
        setOpenId(want);
        window.history.replaceState(null, "", window.location.pathname);
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/admin/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, message: d.message as string };
  };

  const byCountry = useMemo(() => {
    const m = new Map<string, Leader[]>();
    for (const l of leaders) {
      const c = l.leaderCountry || "No country";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(l);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [leaders]);

  const reps = leaders.filter((l) => l.leaderRole === "representative");
  const sups = leaders.filter((l) => l.leaderRole === "supervisor");
  const owedAll = leaders.reduce<Pairs>((s, l) => addPairs(s, owedPairs(l.money)), {});
  const disputes = leaders.reduce((s, l) => s + l.disputes, 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PageHeader
          icon={Network}
          title="Field Teams"
          description="Country Representatives, Supervisors and their contributors — and bulk payments through them."
          actions={<Button size="sm" onClick={() => setAppointOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus size={16} />Appoint leader</Button>}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Crown} tone="purple" label="Representatives" value={reps.length} hint={(() => { const n = new Set(leaders.map((l) => l.leaderCountry)).size; return `${n} countr${n === 1 ? "y" : "ies"}`; })()} />
          <StatCard icon={UserCog} tone="sky" label="Supervisors" value={sups.length} />
          <StatCard icon={Users} tone="blue" label="Team members" value={leaders.reduce((s, l) => s + l.memberCount, 0)} />
          <StatCard icon={Wallet} tone="amber" label="Owed (not yet sent)" value={fmtPairs(owedAll)} hint={disputes ? `${disputes} disputed payment${disputes === 1 ? "" : "s"}` : undefined} />
        </div>

        {notice && <Notice tone={notice.ok ? "success" : "error"}>{notice.text}</Notice>}

        <Segmented value={tab} onChange={setTab} options={[{ value: "structure", label: "Structure" }, { value: "payouts", label: "Bulk payments", count: payouts.length }]} />

        {loading ? (
          <SkeletonList />
        ) : tab === "structure" ? (
          leaders.length === 0 ? (
            <EmptyState icon={Network} title="No field teams yet" description="Appoint a Country Representative or Supervisor to start building teams in a country." action={<Button size="sm" onClick={() => setAppointOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus size={16} />Appoint leader</Button>} />
          ) : (
            <div className="space-y-5">
              {byCountry.map(([country, list]) => {
                const countryReps = list.filter((l) => l.leaderRole === "representative");
                const loose = list.filter((l) => l.leaderRole === "supervisor" && !list.some((r) => r.id === l.teamLeaderId));
                const total = list.reduce<Pairs>((s, l) => addPairs(s, owedPairs(l.money)), {});
                return (
                  <Panel key={country} className="overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                      <h2 className="flex items-center gap-2 font-semibold text-foreground"><Globe2 size={16} className="text-zinc-400" />{country}</h2>
                      <span className="text-xs text-zinc-500">{list.length} leader{list.length === 1 ? "" : "s"} · owed <strong className="text-foreground">{fmtPairs(total, list[0]?.currency)}</strong></span>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {countryReps.map((rep) => (
                        <div key={rep.id}>
                          <LeaderRow l={rep} onOpen={() => setOpenId(rep.id)} />
                          {list.filter((s) => s.teamLeaderId === rep.id).map((s) => (
                            <LeaderRow key={s.id} l={s} nested onOpen={() => setOpenId(s.id)} />
                          ))}
                        </div>
                      ))}
                      {loose.map((s) => <LeaderRow key={s.id} l={s} onOpen={() => setOpenId(s.id)} />)}
                    </div>
                  </Panel>
                );
              })}
            </div>
          )
        ) : payouts.length === 0 ? (
          <EmptyState icon={Send} title="No bulk payments yet" description="Open a leader with money owed and choose “Send bulk payment”." />
        ) : (
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50/80 text-left text-xs text-zinc-500 dark:bg-zinc-800/40">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Leader</th><th className="px-4 py-3 text-right">Contributors</th><th className="px-4 py-3 text-right">Fees</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-500">{formatDate(p.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{p.leaderName}<span className="block text-xs font-normal text-zinc-500">{p.itemCount} item{p.itemCount === 1 ? "" : "s"}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(p.amount, p.currency)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(p.feeAmount, p.currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(p.total, p.currency)}{p.kind === "advance" && <span className="ml-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">advance</span>}{p.localAmount && <span className="block text-xs font-normal text-zinc-500">{p.localAmount.toLocaleString()} {p.localCurrency}</span>}</td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{p.method}{p.reference && <span className="block text-xs text-zinc-400">Ref {p.reference}</span>}{p.receiptUrl && <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 hover:underline">Receipt</a>}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", p.status === "acknowledged" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400")}>
                          {p.status === "acknowledged" ? "Received" : "Sent"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>

      {appointOpen && (
        <AppointDialog
          reps={reps}
          onClose={() => setAppointOpen(false)}
          onSubmit={async (body) => {
            const r = await post({ action: "appoint", ...body });
            if (r.ok) { setAppointOpen(false); setNotice({ ok: true, text: r.message }); load(); }
            return r;
          }}
        />
      )}

      {openId && (
        <LeaderDrawer
          id={openId}
          reps={reps}
          currentParent={leaders.find((l) => l.id === openId)?.teamLeaderId ?? null}
          post={post}
          onClose={() => setOpenId(null)}
          onChanged={(text) => { setNotice({ ok: true, text }); load(); }}
        />
      )}
    </AdminLayout>
  );
}

function LeaderRow({ l, nested, onOpen }: { l: Leader; nested?: boolean; onOpen: () => void }) {
  const owed = owedPairs(l.money);
  const hasOwed = Object.keys(owed).length > 0;
  return (
    <button onClick={onOpen} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/60", nested && "pl-10 sm:pl-14")}>
      {nested && <span className="-ml-5 h-6 w-3 shrink-0 rounded-bl-lg border-b-2 border-l-2 border-zinc-200 dark:border-zinc-700" />}
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", l.leaderRole === "representative" ? "bg-gradient-to-br from-violet-500 to-indigo-600" : "bg-gradient-to-br from-sky-500 to-blue-600")}>{initials(l.fullName)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2"><span className="font-medium text-foreground">{l.fullName}</span><RoleBadge role={l.leaderRole} also={l.leaderAlsoSupervisor} /></span>
        <span className="block truncate text-xs text-zinc-500">{l.userId} · code {l.teamCode} · {l.currency} · fee {l.leaderFeePercent ?? 0}% · {l.memberCount} member{l.memberCount === 1 ? "" : "s"}</span>
      </span>
      {l.disputes > 0 && <span className="hidden items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 sm:inline-flex dark:bg-red-500/10 dark:text-red-300"><AlertTriangle size={11} />{l.disputes}</span>}
      <span className="shrink-0 text-right">
        <span className={cn("block text-sm font-semibold tabular-nums", hasOwed ? "text-amber-600" : "text-zinc-400")}>{fmtPairs(owed, l.currency)}</span>
        <span className="block text-[11px] text-zinc-400">owed{Object.keys(l.advanceCredit).length ? ` · ${fmtPairs(l.advanceCredit)} advance left` : ""}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-zinc-300" />
    </button>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className={cn("h-full w-full overflow-y-auto bg-white shadow-2xl dark:bg-zinc-950", wide ? "max-w-2xl" : "max-w-md")} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/90 px-5 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function AppointDialog({ reps, onClose, onSubmit }: { reps: Leader[]; onClose: () => void; onSubmit: (b: Record<string, unknown>) => Promise<{ ok: boolean; message: string }> }) {
  const [form, setForm] = useState({ rep: false, sup: true, country: "", feePercent: "10", parentId: "", currency: "" });
  const [person, setPerson] = useState<PickedUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  const repsInCountry = reps.filter((r) => !form.country || (r.leaderCountry || "").toLowerCase() === form.country.trim().toLowerCase());
  return (
    <Modal title="Appoint a field-team leader" onClose={onClose}>
      <div className="space-y-4">
        <div><span className="mb-1 block text-sm font-medium">Person</span>
          <UserPicker
            autoFocus
            value={person}
            // Their profile country becomes the team's country (editable below).
            onChange={(u) => { setPerson(u); if (u?.country && !form.country) set({ country: COUNTRIES.find((c) => c.name.toLowerCase() === u.country!.trim().toLowerCase())?.name ?? u.country }); }}
          />
          {person?.leaderRole ? (
            <span className="mt-1 block text-xs text-amber-600">Already {leaderLabel(person.leaderRole, person.leaderAlsoSupervisor)} — appointing changes their position.</span>
          ) : (
            <span className="mt-1 block text-xs text-zinc-500">They must already have a HustleClickGH account.</span>
          )}
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium">Position <span className="font-normal text-zinc-400">— pick one or both</span></span>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: "rep", t: "Country Representative", d: "Runs a country; supervisors report to them." }, { v: "sup", t: "Supervisor", d: "Leads a team of contributors." }].map((o) => {
              const on = o.v === "rep" ? form.rep : form.sup;
              return (
                <button key={o.v} type="button"
                  // Pick one or both; at least one stays selected.
                  onClick={() => { const next = { ...form, [o.v]: !on }; if (next.rep || next.sup) set({ [o.v]: !on, parentId: next.rep ? "" : form.parentId }); }}
                  className={cn("relative rounded-xl border-2 p-3 text-left", on ? "border-blue-500 bg-blue-50/60 dark:bg-blue-500/10" : "border-zinc-200 dark:border-zinc-700")}>
                  <span className={cn("absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded border", on ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 dark:border-zinc-600")}>{on && <Check size={11} />}</span>
                  <span className="block pr-5 text-sm font-semibold">{o.t}</span><span className="mt-0.5 block text-xs text-zinc-500">{o.d}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1 block text-sm font-medium">Country</span>
            <select className={inputCls} value={form.country} onChange={(e) => set({ country: e.target.value, parentId: "" })}>
              <option value="">Select…</option>
              {form.country && !COUNTRIES.some((c) => c.name === form.country) && <option value={form.country}>{form.country}</option>}
              <optgroup label="Africa">{COUNTRIES.filter((c) => c.africa).map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}</optgroup>
              <optgroup label="Rest of the world">{COUNTRIES.filter((c) => !c.africa).map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}</optgroup>
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Team currency</span>
            <select className={inputCls} value={form.currency || currencyForCountry(form.country)} onChange={(e) => set({ currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Fee per approved item</span>
            <div className="relative"><input type="number" min="0" max="100" step="0.5" className={cn(inputCls, "pr-8")} value={form.feePercent} onChange={(e) => set({ feePercent: e.target.value })} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">%</span></div>
          </label>
        </div>
        {!form.rep && (
          <label className="block"><span className="mb-1 block text-sm font-medium">Reports to</span>
            <select className={inputCls} value={form.parentId} onChange={(e) => set({ parentId: e.target.value })}>
              <option value="">HustleClickGH directly</option>
              {repsInCountry.map((r) => <option key={r.id} value={r.id}>{r.fullName} — {r.leaderCountry} Representative</option>)}
            </select>
          </label>
        )}
        <p className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          They get a team code to share. Contributors who join with it are paid through them on projects set to “Pay through team leaders”,
          and they earn {Number(form.feePercent) || 0}% on top of each approved item.
        </p>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !person} className="bg-blue-600 hover:bg-blue-700 text-white" onClick={async () => {
            setBusy(true); setErr("");
            const { rep, sup, ...rest } = form;
            const r = await onSubmit({ ...rest, user: person!.id, role: rep ? "representative" : "supervisor", alsoSupervisor: rep && sup, currency: form.currency || currencyForCountry(form.country) });
            if (!r.ok) setErr(r.message || "Couldn't appoint.");
            setBusy(false);
          }}>{busy && <Loader2 size={15} className="animate-spin" />}Appoint</Button>
        </div>
      </div>
    </Modal>
  );
}

function LeaderDrawer({ id, reps, currentParent, post, onClose, onChanged }: {
  id: string; reps: Leader[]; currentParent: string | null; onClose: () => void; onChanged: (text: string) => void;
  post: (b: Record<string, unknown>) => Promise<{ ok: boolean; message: string }>;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [newMember, setNewMember] = useState<PickedUser | null>(null);
  const [fee, setFee] = useState("");
  const [parent, setParent] = useState(currentParent ?? "");
  const [teamCur, setTeamCur] = useState("");
  const [pay, setPay] = useState({ method: "Mobile Money", reference: "", receiptUrl: "", localCurrency: "", localAmount: "", notes: "" });
  const [payOpen, setPayOpen] = useState<string | null>(null); // currency being paid
  // Advance (pay upfront for N items of a project)
  const [advOpen, setAdvOpen] = useState(false);
  const [adv, setAdv] = useState({ projectId: "", items: "", amount: "", currency: "", method: "Mobile Money", reference: "", receiptUrl: "", localCurrency: "", localAmount: "", notes: "" });
  const [projects, setProjects] = useState<{ id: string; title: string; reward: number; status: string; currency: string }[]>([]);
  useEffect(() => {
    if (!advOpen || projects.length) return;
    let alive = true;
    fetch("/api/admin/data-projects").then((r) => r.json()).then((d) => alive && setProjects((d.projects ?? []).filter((p: { status: string }) => p.status === "active"))).catch(() => {});
    return () => { alive = false; };
  }, [advOpen, projects.length]);

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/teams/${id}`)
      .then(async (r) => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok) { setErr(data.message || "Couldn't load"); return; }
        setD(data);
        setFee(String(data.leader.leaderFeePercent ?? 0));
      })
      .catch(() => alive && setErr("Couldn't load"));
    return () => { alive = false; };
  }, [id, reloadKey]);

  const run = async (key: string, body: Record<string, unknown>, after?: () => void) => {
    setBusy(key); setErr("");
    const r = await post(body);
    setBusy("");
    if (!r.ok) { setErr(r.message || "Failed"); return false; }
    after?.(); onChanged(r.message); load();
    return true;
  };

  if (!d) return <Modal title="Leader" onClose={onClose} wide><div className="flex justify-center py-16">{err ? <p className="text-sm text-red-600">{err}</p> : <div className="w-full"><SkeletonList rows={4} className="border-0" /></div>}</div></Modal>;

  const L = d.leader;
  const owedByCur = owedPairs(d.money);
  const currencies = Object.keys(d.money).length ? Object.keys(d.money) : [d.currency];
  const joinLink = typeof window !== "undefined" && L.teamCode ? `${window.location.origin}/join/${L.teamCode}` : "";
  const owedRows = d.payables.filter((p) => p.status === "owed");

  return (
    <Modal title={L.fullName} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          <RoleBadge role={L.leaderRole} /><span>{L.userId}</span><span>·</span><span>{L.leaderCountry}</span><span>·</span><span>{L.phone}</span>
        </div>

        {/* Invite */}
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs font-medium text-zinc-500">Team code</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="font-mono text-xl font-semibold tracking-wider text-foreground">{L.teamCode}</span>
            <button onClick={() => { navigator.clipboard.writeText(joinLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
              {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy invite link"}
            </button>
          </div>
        </div>

        {/* Money */}
        {currencies.map((cur) => {
          const M = d.money[cur] ?? { owed: { amount: 0, fee: 0, count: 0 }, sent: { amount: 0, fee: 0, count: 0 }, paid: { amount: 0, fee: 0, count: 0 } };
          return (
            <div key={cur} className="grid grid-cols-3 gap-2 text-center">
              {([["Owed", M.owed, "text-amber-600"], ["Sent, not yet paid out", M.sent, "text-sky-600"], ["Paid to contributors", M.paid, "text-emerald-600"]] as const).map(([label, mm, cls]) => (
                <div key={label} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                  <p className="text-[11px] text-zinc-500">{label}{currencies.length > 1 ? ` (${cur})` : ""}</p>
                  <p className={cn("text-base font-semibold tabular-nums", cls)}>{formatMoney(mm.amount + mm.fee, cur)}</p>
                  <p className="text-[11px] text-zinc-400">{mm.count} item{mm.count === 1 ? "" : "s"}</p>
                </div>
              ))}
            </div>
          );
        })}

        {/* Bulk payment */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-500/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">Send bulk payment</p>
              <p className="text-xs text-zinc-500">
                {Object.keys(owedByCur).length ? Object.keys(owedByCur).map((c) => (
                  <span key={c} className="block">Covers {d.money[c].owed.count} approved item{d.money[c].owed.count === 1 ? "" : "s"}: {formatMoney(d.money[c].owed.amount, c)} for contributors + {formatMoney(d.money[c].owed.fee, c)} fees{L.leaderRole === "representative" ? " (incl. supervisors under them)" : ""}.</span>
                )) : "Nothing owed right now."}
              </p>
            </div>
            {!payOpen && <div className="flex flex-wrap gap-2">{Object.entries(owedByCur).map(([c, a]) => (
              <Button key={c} size="sm" onClick={() => setPayOpen(c)} className="bg-amber-500 hover:bg-amber-600 text-white"><Send size={14} />Pay {formatMoney(a, c)}</Button>
            ))}</div>}
          </div>
          {payOpen && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">Pay them outside the system first (MoMo, crypto, bank…), then upload the receipt or screenshot and record it here. Their contributors will see it&apos;s on the way.</p>
              <ReceiptUpload value={pay.receiptUrl} onChange={(url) => setPay((p) => ({ ...p, receiptUrl: url }))} required />
              <div className="grid grid-cols-2 gap-3">
                <select className={inputCls} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  {["Mobile Money", "Crypto", "Bank transfer", "Cash", "Other"].map((m) => <option key={m}>{m}</option>)}
                </select>
                <input className={inputCls} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder={pay.method === "Crypto" ? "Transaction hash" : "Transaction reference"} />
                <input className={inputCls} value={pay.localAmount} onChange={(e) => setPay({ ...pay, localAmount: e.target.value })} placeholder="Amount actually sent, if different (optional)" type="number" />
                <input className={inputCls} value={pay.localCurrency} onChange={(e) => setPay({ ...pay, localCurrency: e.target.value })} placeholder={pay.method === "Crypto" ? "Coin, e.g. USDT" : "Its currency, e.g. USD"} />
              </div>
              <textarea className={inputCls} rows={2} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} placeholder="Notes (optional)" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setPayOpen(null)}>Cancel</Button>
                <Button size="sm" disabled={busy === "pay" || !pay.receiptUrl} title={!pay.receiptUrl ? "Upload the receipt first" : undefined} className="bg-amber-500 hover:bg-amber-600 text-white" onClick={async () => {
                  setBusy("pay"); setErr("");
                  const r = await fetch(`/api/admin/teams/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pay, currency: payOpen }) });
                  const data = await r.json().catch(() => ({}));
                  setBusy("");
                  if (!r.ok) { setErr(data.message || "Failed"); return; }
                  setPayOpen(null); onChanged(data.message); load();
                }}>{busy === "pay" && <Loader2 size={14} className="animate-spin" />}Record payment of {payOpen ? formatMoney(owedByCur[payOpen] ?? 0, payOpen) : ""}</Button>
              </div>
            </div>
          )}
          {owedRows.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-300">See the {owedRows.length} item{owedRows.length === 1 ? "" : "s"}</summary>
              <ul className="mt-2 max-h-56 divide-y divide-zinc-100 overflow-y-auto text-xs dark:divide-zinc-800">
                {owedRows.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">{p.contributorName} <span className="text-zinc-400">· {p.projectTitle}{p.leaderId !== id ? ` · via ${p.leaderName}` : ""}</span></span>
                    <span className="shrink-0 tabular-nums">{formatMoney(p.amount, p.currency)} + {formatMoney(p.feeAmount, p.currency)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* Advance */}
        <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 dark:border-sky-900 dark:bg-sky-500/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">Pay in advance</p>
              <p className="text-xs text-zinc-500">
                {Object.keys(d.advanceCredit).length ? <>{fmtPairs(d.advanceCredit)} advance not used yet — approved items are counted against it automatically.</> : "Pay upfront for a number of items; approvals then use it up so nothing is paid twice."}
              </p>
            </div>
            {!advOpen && <Button size="sm" variant="outline" onClick={() => setAdvOpen(true)}>Record advance</Button>}
          </div>
          {advOpen && (() => {
            const proj = projects.find((x) => x.id === adv.projectId);
            const feePct = L.leaderFeePercent ?? 0;
            const suggested = proj && Number(adv.items) > 0 ? Math.round(Number(adv.items) * proj.reward * (1 + feePct / 100) * 100) / 100 : 0;
            const amount = adv.amount || (suggested ? String(suggested) : "");
            // A project's advance is in that project's currency; otherwise the team's default (changeable).
            const advCur = proj?.currency ?? (adv.currency || d.currency);
            return (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <select className={cn(inputCls, "col-span-3 sm:col-span-2")} value={adv.projectId} onChange={(e) => setAdv({ ...adv, projectId: e.target.value, amount: "" })}>
                    <option value="">Any project</option>
                    {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.title} — {formatMoney(pr.reward, pr.currency)}/item</option>)}
                  </select>
                  <input type="number" min="1" className={cn(inputCls, "col-span-3 sm:col-span-1")} value={adv.items} onChange={(e) => setAdv({ ...adv, items: e.target.value, amount: "" })} placeholder="No. of items" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="col-span-2 block"><span className="mb-1 block text-xs font-medium text-zinc-500">Amount ({currencySymbol(advCur)}){suggested ? ` — ${adv.items} × ${formatMoney(proj!.reward, advCur)} + ${feePct}% fee` : ""}</span>
                    <input type="number" min="0" step="0.01" className={inputCls} value={amount} onChange={(e) => setAdv({ ...adv, amount: e.target.value })} placeholder="0.00" />
                  </label>
                  <label className="block"><span className="mb-1 block text-xs font-medium text-zinc-500">Currency</span>
                    <select className={inputCls} value={advCur} disabled={!!proj} onChange={(e) => setAdv({ ...adv, currency: e.target.value })}>
                      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </label>
                </div>
                <ReceiptUpload value={adv.receiptUrl} onChange={(url) => setAdv((a) => ({ ...a, receiptUrl: url }))} required />
                <div className="grid grid-cols-2 gap-3">
                  <select className={inputCls} value={adv.method} onChange={(e) => setAdv({ ...adv, method: e.target.value })}>
                    {["Mobile Money", "Crypto", "Bank transfer", "Cash", "Other"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <input className={inputCls} value={adv.reference} onChange={(e) => setAdv({ ...adv, reference: e.target.value })} placeholder={adv.method === "Crypto" ? "Transaction hash" : "Transaction reference"} />
                  <input className={inputCls} type="number" value={adv.localAmount} onChange={(e) => setAdv({ ...adv, localAmount: e.target.value })} placeholder="Local amount (optional)" />
                  <input className={inputCls} value={adv.localCurrency} onChange={(e) => setAdv({ ...adv, localCurrency: e.target.value })} placeholder={adv.method === "Crypto" ? "Coin, e.g. USDT" : "Currency, e.g. MWK"} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAdvOpen(false)}>Cancel</Button>
                  <Button size="sm" disabled={busy === "adv" || !adv.receiptUrl || !(Number(amount) > 0)} className="bg-sky-600 text-white hover:bg-sky-700" onClick={async () => {
                    setBusy("adv"); setErr("");
                    const r = await fetch(`/api/admin/teams/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...adv, amount, currency: advCur, kind: "advance" }) });
                    const data = await r.json().catch(() => ({}));
                    setBusy("");
                    if (!r.ok) { setErr(data.message || "Failed"); return; }
                    setAdvOpen(false);
                    setAdv({ projectId: "", items: "", amount: "", currency: "", method: "Mobile Money", reference: "", receiptUrl: "", localCurrency: "", localAmount: "", notes: "" });
                    onChanged(data.message); load();
                  }}>{busy === "adv" && <Loader2 size={14} className="animate-spin" />}Record advance{Number(amount) > 0 ? ` of ${formatMoney(Number(amount), advCur)}` : ""}</Button>
                </div>
              </div>
            );
          })()}
          {d.advances.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {d.advances.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>{formatDate(a.createdAt)} · {a.method}{a.itemCount ? ` · ${a.itemCount} items` : ""}{a.receiptUrl && <> · <a href={a.receiptUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">receipt</a></>}</span>
                  <span className="tabular-nums">{formatMoney(a.total, a.currency)} · <strong>{formatMoney(a.creditRemaining, a.currency)} left</strong></span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Disputes */}
        {d.payables.some((p) => p.disputeNote) && (
          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-500/5">
            <p className="mb-2 flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-300"><AlertTriangle size={15} />Reported by contributors</p>
            <ul className="space-y-1.5 text-xs">
              {d.payables.filter((p) => p.disputeNote).map((p) => (
                <li key={p.id}><strong>{p.contributorName}</strong> ({p.projectTitle}, {formatMoney(p.amount, p.currency)}): {p.disputeNote}{p.paidReceiptUrl ? <> · <a href={p.paidReceiptUrl} target="_blank" rel="noreferrer" className="font-medium underline">leader&apos;s proof</a></> : " · no proof uploaded by leader"}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Settings */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-medium text-zinc-500">Fee per approved item (%)</span>
            <div className="flex gap-2">
              <input type="number" min="0" max="100" step="0.5" className={inputCls} value={fee} onChange={(e) => setFee(e.target.value)} />
              {Number(fee) !== (L.leaderFeePercent ?? 0) && <Button size="sm" disabled={busy === "fee"} onClick={() => run("fee", { action: "update", userId: id, feePercent: fee })} className="bg-blue-600 text-white hover:bg-blue-700">Save</Button>}
            </div>
            <span className="mt-1 block text-[11px] text-zinc-400">Applies to items approved from now on.</span>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-zinc-500">Team currency</span>
            <div className="flex gap-2">
              <select className={inputCls} value={teamCur || d.currency} onChange={(e) => setTeamCur(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
              {teamCur && teamCur !== d.currency && <Button size="sm" disabled={busy === "cur"} onClick={() => run("cur", { action: "update", userId: id, currency: teamCur }, () => setTeamCur(""))} className="bg-blue-600 text-white hover:bg-blue-700">Save</Button>}
            </div>
            <span className="mt-1 block text-[11px] text-zinc-400">Default for new projects assigned to this team.</span>
          </label>
          <div className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-zinc-500">Positions</span>
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={L.leaderRole} also={L.leaderAlsoSupervisor} />
              {L.leaderRole === "representative" && (
                <Button size="sm" variant="outline" disabled={busy === "both"} onClick={() => run("both", { action: "update", userId: id, alsoSupervisor: !L.leaderAlsoSupervisor })}>
                  {L.leaderAlsoSupervisor ? "Drop Supervisor position" : "Also make Supervisor"}
                </Button>
              )}
              {L.leaderRole === "supervisor" && (
                <Button size="sm" variant="outline" disabled={busy === "both"} onClick={() => confirm(`Make ${L.fullName} Country Representative as well? They keep leading their own team.`) && run("both", { action: "appoint", user: id, role: "representative", alsoSupervisor: true, country: L.leaderCountry, feePercent: L.leaderFeePercent ?? 0, currency: L.leaderCurrency ?? d.currency })}>
                  Also make Country Representative
                </Button>
              )}
            </div>
          </div>
          {L.leaderRole === "supervisor" && (
            <label className="block"><span className="mb-1 block text-xs font-medium text-zinc-500">Reports to</span>
              <div className="flex gap-2">
                <select className={inputCls} value={parent} onChange={(e) => setParent(e.target.value)}>
                  <option value="">HustleClickGH directly</option>
                  {reps.map((r) => <option key={r.id} value={r.id}>{r.fullName} ({r.leaderCountry})</option>)}
                </select>
                {parent !== (currentParent ?? "") && <Button size="sm" disabled={busy === "parent"} onClick={() => run("parent", { action: "update", userId: id, parentId: parent || null })} className="bg-blue-600 text-white hover:bg-blue-700">Save</Button>}
              </div>
            </label>
          )}
        </div>

        {/* Members */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold text-foreground">Team ({d.members.length})</p>
          </div>
          <div className="mb-3 flex gap-2">
            <div className="min-w-0 flex-1"><UserPicker value={newMember} onChange={setNewMember} placeholder="Add someone — User ID, name or phone" /></div>
            <Button size="sm" disabled={!newMember || busy === "add"} onClick={() => newMember && run("add", { action: "assign", user: newMember.id, leaderId: id }, () => setNewMember(null))} className="bg-blue-600 text-white hover:bg-blue-700"><UserPlus size={14} />Add</Button>
          </div>
          {d.members.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">No members yet — share the invite link.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {d.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium text-foreground">{m.fullName}{m.leaderRole && <RoleBadge role={m.leaderRole} also={m.leaderAlsoSupervisor} />}</span>
                    <span className="block truncate text-xs text-zinc-500">{m.userId} · {m.phone}{m.city ? ` · ${m.city}` : ""}{m.teamJoinedAt ? ` · joined ${formatDate(m.teamJoinedAt)}` : ""}</span>
                  </span>
                  {!m.leaderRole && (
                    <button disabled={busy === m.id} onClick={() => confirm(`Remove ${m.fullName} from this team?`) && run(m.id, { action: "unassign", userId: m.id })} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" title="Remove from team"><Trash2 size={15} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button
            disabled={busy === "remove"}
            onClick={() => confirm(`Remove ${L.fullName}'s ${L.leaderRole} position? ${L.leaderRole === "supervisor" ? "Their members move to their representative (or no team)." : "Their members and supervisors will have no team."}`) && run("remove", { action: "remove", userId: id }, onClose)}
            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Remove leader position
          </button>
        </div>
      </div>
    </Modal>
  );
}
