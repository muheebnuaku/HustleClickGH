"use client";

// Project progress, overall and per field team:
// advance → submitted → admin check → client pass/fail → paid out → confirmed.

import { useEffect, useState } from "react";
import { Crown, UserCog, Users, AlertTriangle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { TrackerRow } from "@/lib/project-tracker";

interface Tracker {
  project: { payoutMode: string; maxSubmissions: number; currentSubmissions: number; reviewOrgId: string | null; assignedLeaderIds: string[] };
  rows: TrackerRow[];
  total: Omit<TrackerRow, "key" | "leaderName" | "leaderRole">;
}

/** Leaders reuse this with their own data (`data`); admins pass `projectId` and it loads itself. */
export function ProjectTrackerPanel({ projectId, data, compact }: { projectId?: string; data?: Tracker; compact?: boolean }) {
  const [t, setT] = useState<Tracker | null>(data ?? null);
  useEffect(() => {
    if (data || !projectId) return;
    let alive = true;
    fetch(`/api/admin/data-projects/${projectId}/tracker`).then((r) => (r.ok ? r.json() : null)).then((d) => alive && d && setT(d)).catch(() => {});
    return () => { alive = false; };
  }, [projectId, data]);
  if (!t) return null;

  const T = t.total;
  const viaLeaders = t.project.payoutMode === "via_leader";
  const hasClient = !!t.project.reviewOrgId;
  const steps = [
    ...(viaLeaders && T.advancePaid > 0 ? [{ label: "Advance paid", value: formatCurrency(T.advancePaid), sub: `${formatCurrency(T.advanceLeft)} left` }] : []),
    { label: "Submitted", value: String(T.submitted), sub: `${T.contributors} people` },
    { label: "Awaiting check", value: String(T.pending), sub: T.rejected ? `${T.rejected} rejected` : "by you" },
    { label: "Approved", value: String(T.approved), sub: `of ${t.project.maxSubmissions} needed` },
    ...(hasClient ? [{ label: "Client", value: `${T.clientPass} ✓`, sub: T.clientFail ? `${T.clientFail} failed` : "passed" }] : []),
    ...(viaLeaders ? [
      { label: "With leaders", value: String(T.owed + T.sentToLeader), sub: `${T.owed} not yet sent` },
      { label: "Paid out", value: String(T.paidOut), sub: `${T.confirmed} confirmed` },
    ] : []),
  ];
  const pct = Math.min(100, Math.round((T.approved / Math.max(1, t.project.maxSubmissions)) * 100));
  const teamRows = t.rows.filter((r) => r.submitted > 0 || r.key !== "none");

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-semibold text-foreground">Progress</span>
          <span className="text-zinc-500">{T.approved}/{t.project.maxSubmissions} approved · {pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <ol className={cn("mt-4 grid gap-2", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6")}>
          {steps.map((s, i) => (
            <li key={s.label} className="relative rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{i + 1}. {s.label}</span>
              <span className="block text-lg font-semibold tabular-nums text-foreground">{s.value}</span>
              <span className="block truncate text-[11px] text-zinc-500">{s.sub}</span>
            </li>
          ))}
        </ol>
        {T.disputed > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertTriangle size={13} />{T.disputed} contributor{T.disputed === 1 ? "" : "s"} reported a payment problem — see Field Teams.</p>
        )}
      </div>

      {teamRows.length > 0 && (viaLeaders || teamRows.some((r) => r.key !== "none")) && (
        <div className="overflow-x-auto border-t border-zinc-100 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">Team</th>
                <th className="px-3 py-2 text-right font-medium">Submitted</th>
                <th className="px-3 py-2 text-right font-medium">Pending</th>
                <th className="px-3 py-2 text-right font-medium">Approved</th>
                {hasClient && <th className="px-3 py-2 text-right font-medium">Client ✓/✗</th>}
                {viaLeaders && <th className="px-3 py-2 text-right font-medium">Owed</th>}
                {viaLeaders && <th className="px-3 py-2 text-right font-medium">With leader</th>}
                {viaLeaders && <th className="px-3 py-2 text-right font-medium">Paid / confirmed</th>}
                {viaLeaders && <th className="px-4 py-2 text-right font-medium">Advance left</th>}
              </tr>
            </thead>
            <tbody>
              {teamRows.map((r) => {
                const Icon = r.leaderRole === "representative" ? Crown : r.leaderRole === "supervisor" ? UserCog : Users;
                return (
                  <tr key={r.key} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-medium text-foreground"><Icon size={14} className="shrink-0 text-zinc-400" />{r.leaderName}</span>
                      <span className="block pl-6 text-[11px] text-zinc-500">{r.contributors} contributor{r.contributors === 1 ? "" : "s"}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.submitted}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{r.pending || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{r.approved || "—"}</td>
                    {hasClient && <td className="px-3 py-2.5 text-right tabular-nums">{r.clientPass}/{r.clientFail}</td>}
                    {viaLeaders && <td className="px-3 py-2.5 text-right tabular-nums">{r.owed || "—"}</td>}
                    {viaLeaders && <td className="px-3 py-2.5 text-right tabular-nums">{r.sentToLeader || "—"}</td>}
                    {viaLeaders && <td className="px-3 py-2.5 text-right tabular-nums">{r.paidOut}/{r.confirmed}{r.disputed ? <span className="ml-1 text-red-600">· {r.disputed}!</span> : null}</td>}
                    {viaLeaders && <td className="px-4 py-2.5 text-right tabular-nums">{r.advanceLeft ? formatCurrency(r.advanceLeft) : "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
