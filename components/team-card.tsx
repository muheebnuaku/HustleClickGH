"use client";

// Contributor side of field teams: who my team leader is (or join with a code),
// and the payments I'm due through them — with confirm / report-a-problem.

import { useEffect, useState } from "react";
import { Network, Loader2, Phone, CheckCircle2, AlertTriangle, Clock, Crown, UserCog } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { leaderLabel } from "@/lib/leader-label";

interface Payable {
  id: string; projectTitle: string; currency: string; amount: number | null; status: "owed" | "sent" | "paid";
  paidAt: string | null; createdAt: string; contributorConfirmedAt: string | null; disputeNote: string | null; paidReceiptUrl: string | null;
}
interface TeamInfo {
  me: { leaderRole: string | null; teamLeaderId: string | null };
  myLeader: { fullName: string; userId: string; phone: string; leaderRole: string | null; leaderAlsoSupervisor?: boolean; leaderCountry: string | null } | null;
  myPayables: Payable[];
}

const STATUS: Record<Payable["status"], { label: string; cls: string; icon: typeof Clock }> = {
  owed: { label: "Approved — waiting for HustleClickGH to send it", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300", icon: Clock },
  sent: { label: "Sent to your leader — they'll pay you", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400", icon: Clock },
  paid: { label: "Your leader says they paid you", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400", icon: CheckCircle2 },
};

/** `mode="team"`: leader + join (Profile). `mode="payments"`: only payments due through a leader (Withdraw page). */
export function TeamCard({ mode = "team" }: { mode?: "team" | "payments" }) {
  const [info, setInfo] = useState<TeamInfo | null>(null);
  const [reload, setReload] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/team").then((r) => (r.ok ? r.json() : null)).then((d) => alive && setInfo(d)).catch(() => {});
    return () => { alive = false; };
  }, [reload]);

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setMsg(null);
    const r = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy("");
    setMsg({ ok: r.ok, text: d.message || (r.ok ? "Done" : "Failed") });
    if (r.ok) { setDisputing(null); setNote(""); setCode(""); setReload((k) => k + 1); }
  };

  if (!info) return null;
  const payables = info.myPayables ?? [];
  // On the Withdraw page only show this when the person is actually paid through a team.
  if (mode === "payments" && !payables.length) return null;
  // Representatives report to HustleClickGH directly — nothing to join.
  if (mode === "team" && info.me.leaderRole === "representative") return null;

  const L = info.myLeader;
  const RoleIcon = L?.leaderRole === "representative" ? Crown : UserCog;

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        <Network size={19} className="text-violet-600" />{mode === "payments" ? "Paid through your team leader" : "Your team"}
      </h2>

      {mode === "team" && (
        L ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"><RoleIcon size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-foreground">{L.fullName}</span>
              <span className="block text-xs text-zinc-500">{leaderLabel(L.leaderRole, L.leaderAlsoSupervisor)}{L.leaderCountry ? ` · ${L.leaderCountry}` : ""}</span>
            </span>
            <a href={`tel:${L.phone}`} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-800"><Phone size={12} />Call</a>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-zinc-500">If a supervisor recruited you, enter their team code. Some projects are paid through your supervisor.</p>
            <div className="mt-3 flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. MW-7KQ2X"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-mono text-sm uppercase tracking-wider focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-500/10 dark:border-zinc-700 dark:bg-zinc-900" />
              <button disabled={!code.trim() || busy === "join"} onClick={() => act("join", { action: "join", code })}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                {busy === "join" && <Loader2 size={14} className="animate-spin" />}Join
              </button>
            </div>
          </div>
        )
      )}

      {msg && <p className={cn("mt-3 text-sm", msg.ok ? "text-emerald-600" : "text-red-600")}>{msg.text}</p>}

      {payables.length > 0 && (
        <div className="mt-4">
          {mode === "team" && <p className="mb-2 text-sm font-medium text-foreground">Payments through {L?.fullName ?? "your leader"}</p>}
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {payables.slice(0, 30).map((p) => {
              const st = STATUS[p.status];
              return (
                <li key={p.id} className="p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{p.projectTitle}</p>
                      <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", st.cls)}><st.icon size={11} />{st.label}</span>
                      <p className="mt-1 text-xs text-zinc-400">
                        Approved {formatDate(p.createdAt)}{p.paidAt ? ` · paid ${formatDate(p.paidAt)}` : ""}
                        {p.paidReceiptUrl && <> · <a href={p.paidReceiptUrl} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">View proof of payment</a></>}
                      </p>
                    </div>
                    {p.amount != null && <p className="shrink-0 font-semibold tabular-nums text-foreground">{formatMoney(p.amount, p.currency)}</p>}
                  </div>
                  {p.disputeNote ? (
                    <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300"><AlertTriangle size={11} className="mr-1 inline" />You reported: {p.disputeNote}. Our team is looking into it.</p>
                  ) : p.contributorConfirmedAt ? (
                    <p className="mt-2 text-xs font-medium text-emerald-600"><CheckCircle2 size={12} className="mr-1 inline" />You confirmed you received it.</p>
                  ) : (p.status === "paid" || p.status === "sent") && (
                    disputing === p.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's wrong? e.g. not received, wrong amount"
                          className="w-full rounded-lg border border-red-200 bg-white px-2.5 py-2 text-xs focus:outline-none dark:border-red-900 dark:bg-zinc-950" />
                        <div className="flex gap-2">
                          <button disabled={!note.trim() || busy === p.id} onClick={() => act(p.id, { action: "dispute", id: p.id, note })} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Send report</button>
                          <button onClick={() => setDisputing(null)} className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {p.status === "paid" && (
                          <button disabled={busy === p.id} onClick={() => act(p.id, { action: "confirm", id: p.id })} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                            <CheckCircle2 size={12} />I received it
                          </button>
                        )}
                        <button onClick={() => { setDisputing(p.id); setNote(""); }} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                          <AlertTriangle size={12} />Report a problem
                        </button>
                      </div>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
