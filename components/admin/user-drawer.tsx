"use client";

// Everything about one person in a side panel: details, money, and every
// position they can hold (manager, Country Representative, Supervisor) — so an
// admin can act on a user without leaving the Users page.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X, Mail, Phone, MapPin, CalendarDays, MessageCircle, BadgeCheck, Lock, Unlock, Crown, UserCog,
  UserPlus, UserMinus, Network, ChevronRight, Users, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/verified-badge";
import { COUNTRIES } from "@/lib/countries";
import { currencyForCountry } from "@/lib/currency";
import { DEFAULT_MANAGER_COMMISSION } from "@/lib/constants";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

export interface DrawerUser {
  id: string; userId: string; fullName: string; email: string; phone: string;
  balance: number; totalEarned: number; referralCount: number; createdAt: string;
  role: string; commissionPercent: number | null; status: string; verified: boolean;
  country: string | null; region: string | null; city: string | null;
  duplicatePhone?: boolean; fraudRiskScore?: number | null; fraudRiskReason?: string | null;
  referredById?: string | null; commissionEarned?: number;
  leaderRole?: string | null; leaderCountry?: string | null; teamLeaderId?: string | null;
}

const ROLE_LABEL: Record<string, string> = { representative: "Country Representative", supervisor: "Supervisor" };

export function UserDrawer({ user, byId, teamSize, busy, onClose, onMessage, onVerify, onSuspend, onManager, onShowTeam, onChanged }: {
  user: DrawerUser;
  byId: Map<string, DrawerUser>;
  /** People this manager referred. */
  teamSize: number;
  busy: { verify: boolean; suspend: boolean };
  onClose: () => void;
  onMessage: () => void;
  onVerify: () => void;
  onSuspend: () => void;
  onManager: (action: "make_manager" | "revoke_manager") => void;
  onShowTeam: (managerId: string) => void;
  onChanged: (message: string) => void;
}) {
  const [appoint, setAppoint] = useState<null | "representative" | "supervisor">(null);
  const [form, setForm] = useState({ country: "", feePercent: "10", parentId: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);

  const isManager = user.role === "manager";
  const referrer = user.referredById ? byId.get(user.referredById) : undefined;
  const fieldLeader = user.teamLeaderId ? byId.get(user.teamLeaderId) : undefined;
  const reps = Array.from(byId.values()).filter((u) => u.leaderRole === "representative" && u.id !== user.id
    && (!form.country || (u.leaderCountry ?? "").toLowerCase() === form.country.toLowerCase()));
  const location = [user.city, user.region, user.country].filter(Boolean).join(", ");

  const startAppoint = (role: "representative" | "supervisor") => {
    setErr("");
    setForm({ country: COUNTRIES.find((c) => c.name.toLowerCase() === (user.country ?? "").trim().toLowerCase())?.name ?? user.country ?? "", feePercent: "10", parentId: "" });
    setAppoint(role);
  };

  const teamsCall = async (body: Record<string, unknown>) => {
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/admin/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.message || "Couldn't save."); return; }
      setAppoint(null);
      onChanged(d.message || "Saved.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-md dark:bg-zinc-950" role="dialog" aria-label={user.fullName}>
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold",
            isManager || user.leaderRole ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300")}>
            {user.fullName.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-lg font-semibold text-foreground"><span className="truncate">{user.fullName}</span>{user.verified && <VerifiedBadge size={16} />}</p>
            <p className="text-xs text-zinc-500">{user.userId}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill tone={user.status === "active" ? "green" : "red"}>{user.status === "active" ? "Active" : "Suspended"}</Pill>
              {isManager && <Pill tone="violet"><Crown size={10} />Manager</Pill>}
              {user.leaderRole && <Pill tone="violet">{user.leaderRole === "representative" ? <Crown size={10} /> : <UserCog size={10} />}{ROLE_LABEL[user.leaderRole]}{user.leaderCountry ? ` · ${user.leaderCountry}` : ""}</Pill>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="scrollbar-none flex-1 space-y-5 overflow-y-auto p-5">
          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-2">
            <QuickAction icon={MessageCircle} label="Message" onClick={onMessage} className="text-blue-600" />
            <QuickAction icon={BadgeCheck} label={user.verified ? "Unverify" : "Verify"} onClick={onVerify} disabled={busy.verify} className="text-sky-600" />
            <QuickAction icon={user.status === "active" ? Lock : Unlock} label={user.status === "active" ? "Suspend" : "Unsuspend"} onClick={onSuspend} disabled={busy.suspend} className={user.status === "active" ? "text-red-600" : "text-emerald-600"} />
          </div>

          {/* Details */}
          <section className="space-y-2.5 text-sm">
            <Row icon={Mail}><span className="break-all">{user.email}</span></Row>
            <Row icon={Phone}>
              <span className="flex flex-wrap items-center gap-1.5">{user.phone || "—"}
                {user.duplicatePhone && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">shared phone</span>}
              </span>
            </Row>
            <Row icon={MapPin}>{location || <span className="text-zinc-400">No location yet</span>}</Row>
            <Row icon={CalendarDays}>Joined {formatDate(user.createdAt)}</Row>
            {user.fraudRiskScore != null && (
              <p className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />AI duplicate-account risk {user.fraudRiskScore}/100 — {user.fraudRiskReason ?? "no reason given"}
              </p>
            )}
          </section>

          {/* Money */}
          <section className="grid grid-cols-3 gap-2 text-center">
            {[["Balance", formatCurrency(user.balance)], ["Earned", formatCurrency(user.totalEarned)], ["Referrals", String(user.referralCount)]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-zinc-50 py-2.5 dark:bg-zinc-900">
                <p className="text-[11px] text-zinc-500">{k}</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">{v}</p>
              </div>
            ))}
          </section>

          {/* Teams they belong to */}
          {(referrer?.role === "manager" || fieldLeader) && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Belongs to</h3>
              {referrer?.role === "manager" && (
                <button onClick={() => onShowTeam(referrer.id)} className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-left text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
                  <Crown size={14} className="text-violet-600" /><span className="flex-1">Referred by manager <strong>{referrer.fullName}</strong></span><ChevronRight size={14} className="text-zinc-400" />
                </button>
              )}
              {fieldLeader && (
                <Link href={`/admin/teams?leader=${fieldLeader.id}`} className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
                  <Network size={14} className="text-blue-600" /><span className="flex-1">Field team of <strong>{fieldLeader.fullName}</strong></span><ChevronRight size={14} className="text-zinc-400" />
                </Link>
              )}
            </section>
          )}

          {/* Positions */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Positions</h3>

            {/* Manager (referral commission) */}
            <div className="rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800">
              <div className="flex items-start gap-3">
                <Crown size={16} className="mt-0.5 shrink-0 text-violet-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Manager</p>
                  <p className="text-xs text-zinc-500">
                    {isManager
                      ? `${user.commissionPercent ?? DEFAULT_MANAGER_COMMISSION}% commission · ${teamSize} referred · ${formatCurrency(user.commissionEarned ?? 0)} earned`
                      : "Refers unlimited people and earns commission on their rewards."}
                  </p>
                </div>
                {isManager
                  ? <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900" onClick={() => onManager("revoke_manager")}><UserMinus size={13} />Revoke</Button>
                  : <Button size="sm" className="bg-violet-600 text-white hover:bg-violet-700" onClick={() => onManager("make_manager")}><UserPlus size={13} />Make</Button>}
              </div>
              {isManager && teamSize > 0 && (
                <button onClick={() => onShowTeam(user.id)} className="mt-2 inline-flex items-center gap-1 pl-7 text-xs font-medium text-violet-700 hover:underline dark:text-violet-300"><Users size={12} />See their team<ChevronRight size={12} /></button>
              )}
            </div>

            {/* Field team leader (country rep / supervisor) */}
            <div className="rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-800">
              <div className="flex items-start gap-3">
                <Network size={16} className="mt-0.5 shrink-0 text-blue-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Field team leader</p>
                  <p className="text-xs text-zinc-500">
                    {user.leaderRole
                      ? `${ROLE_LABEL[user.leaderRole]}${user.leaderCountry ? ` for ${user.leaderCountry}` : ""} — gets bulk payments and pays their team.`
                      : "Country Representative or Supervisor — runs a team you pay in bulk."}
                  </p>
                </div>
              </div>
              {user.leaderRole ? (
                <div className="mt-3 flex flex-wrap gap-2 pl-7">
                  <Link href={`/admin/teams?leader=${user.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">Open team<ChevronRight size={13} /></Link>
                  {user.leaderRole === "supervisor" && (
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => startAppoint("representative")}>Promote to Representative</Button>
                  )}
                  <Button size="sm" variant="outline" disabled={saving} className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900"
                    onClick={() => confirm(`Remove ${user.fullName}'s ${ROLE_LABEL[user.leaderRole!]} position? Their team moves up a level.`) && teamsCall({ action: "remove", userId: user.id })}>
                    <UserMinus size={13} />Remove
                  </Button>
                </div>
              ) : !appoint && (
                <div className="mt-3 grid grid-cols-2 gap-2 pl-7">
                  <Button size="sm" variant="outline" onClick={() => startAppoint("representative")}><Crown size={13} />Representative</Button>
                  <Button size="sm" variant="outline" onClick={() => startAppoint("supervisor")}><UserCog size={13} />Supervisor</Button>
                </div>
              )}

              {appoint && (
                <div className="mt-3 space-y-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                  <p className="text-sm font-medium">Make {user.fullName.split(" ")[0]} a {ROLE_LABEL[appoint]}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs text-zinc-500">Country
                      <select className={cn(inputCls, "mt-1")} value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, parentId: "" }))}>
                        <option value="">Select…</option>
                        {form.country && !COUNTRIES.some((c) => c.name === form.country) && <option value={form.country}>{form.country}</option>}
                        {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs text-zinc-500">Fee per item
                      <div className="relative mt-1"><input type="number" min="0" max="100" step="0.5" className={cn(inputCls, "pr-7")} value={form.feePercent} onChange={(e) => setForm((f) => ({ ...f, feePercent: e.target.value }))} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">%</span></div>
                    </label>
                  </div>
                  {appoint === "supervisor" && (
                    <label className="block text-xs text-zinc-500">Reports to
                      <select className={cn(inputCls, "mt-1")} value={form.parentId} onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
                        <option value="">HustleClickGH directly</option>
                        {reps.map((r) => <option key={r.id} value={r.id}>{r.fullName} — {r.leaderCountry} Representative</option>)}
                      </select>
                    </label>
                  )}
                  <p className="text-[11px] text-zinc-500">Team currency: {currencyForCountry(form.country)} (change it later in Field Teams).</p>
                  {err && <p className="text-xs text-red-600">{err}</p>}
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setAppoint(null)} disabled={saving}>Cancel</Button>
                    <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving || !form.country}
                      onClick={() => teamsCall({ action: "appoint", user: user.id, role: appoint, country: form.country, feePercent: form.feePercent, parentId: form.parentId, currency: currencyForCountry(form.country) })}>
                      {saving ? "Saving…" : "Appoint"}
                    </Button>
                  </div>
                </div>
              )}
              {err && !appoint && <p className="mt-2 pl-7 text-xs text-red-600">{err}</p>}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function Pill({ tone, children }: { tone: "green" | "red" | "violet"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
      tone === "green" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
      tone === "red" && "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
      tone === "violet" && "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300")}>{children}</span>
  );
}

function Row({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return <div className="flex items-start gap-2.5 text-foreground"><Icon size={15} className="mt-0.5 shrink-0 text-zinc-400" /><div className="min-w-0 flex-1">{children}</div></div>;
}

function QuickAction({ icon: Icon, label, onClick, disabled, className }: { icon: typeof Mail; label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex flex-col items-center gap-1 rounded-xl border border-zinc-200 py-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900">
      <Icon size={17} className={className} />{label}
    </button>
  );
}
