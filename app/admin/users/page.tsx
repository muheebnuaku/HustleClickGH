"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import { PageHeader, StatCard, Panel, Segmented, EmptyState } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import {
  Download, Mail, Phone, Search, Wallet, TrendingUp, Users, Lock, Unlock, MapPin, BadgeCheck,
  MessageCircle, Send, X, Loader2, ShieldAlert, Crown, UserMinus, UserPlus, ChevronRight, Percent,
} from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { DEFAULT_MANAGER_COMMISSION } from "@/lib/constants";
import { VerifiedBadge } from "@/components/verified-badge";

interface UserData {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  balance: number;
  totalEarned: number;
  surveysCompleted: number;
  referralCount: number;
  createdAt: string;
  role: string;
  commissionPercent: number | null;
  managerSubmitLimit: number | null;
  status: string;
  verified: boolean;
  locationRequested: boolean;
  country: string | null;
  region: string | null;
  city: string | null;
  duplicatePhone?: boolean;
  fraudRiskScore?: number | null;
  fraudRiskReason?: string | null;
  fraudFlaggedAt?: string | null;
  suspectedDuplicateOfUserId?: string | null;
  referredById?: string | null;
  commissionEarned?: number;
}

interface UserStats {
  totalUsers: number;
  managers: number;
  activeUsers: number;
  suspendedUsers: number;
  verifiedUsers: number;
  missingLocation: number;
  fraudFlaggedUsers: number;
  totalPaidOut: number;
  totalBalance: number;
}

const EMPTY_STATS: UserStats = {
  totalUsers: 0, managers: 0, activeUsers: 0, suspendedUsers: 0, verifiedUsers: 0,
  missingLocation: 0, fraudFlaggedUsers: 0, totalPaidOut: 0, totalBalance: 0,
};

const UNKNOWN = "Unknown";
const NO_MANAGER = "__none";

type Tab = "contributors" | "managers";
type RoleChange = { user: UserData; action: "make_manager" | "revoke_manager" };

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

export default function AdminUsersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<UserData[]>([]);
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("contributors");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "suspended">("all");
  const [filterManager, setFilterManager] = useState<string>("all"); // manager id | NO_MANAGER | all
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Manager position changes (confirm dialog)
  const [roleChange, setRoleChange] = useState<RoleChange | null>(null);
  const [changingRole, setChangingRole] = useState(false);
  const [roleError, setRoleError] = useState("");
  // Admin → user direct message composer
  const [messageTarget, setMessageTarget] = useState<UserData | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageResult, setMessageResult] = useState<string | null>(null);
  // Manager settings drafts
  const [commissionDraft, setCommissionDraft] = useState<Record<string, string>>({});
  const [savingCommission, setSavingCommission] = useState<string | null>(null);
  const [limitDraft, setLimitDraft] = useState<Record<string, string>>({});
  const [savingLimit, setSavingLimit] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(data.users || []);
      setStats(data.stats || EMPTY_STATS);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const patchUser = (userId: string, action: string, value?: unknown) =>
    fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, value }),
    });

  const sendAdminMessage = async () => {
    if (!messageTarget || !messageBody.trim() || sendingMessage) return;
    setSendingMessage(true);
    setMessageResult(null);
    try {
      const res = await fetch("/api/admin/users/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: messageTarget.id, body: messageBody.trim() }),
      });
      if (res.ok) {
        setMessageResult("Message sent.");
        setMessageBody("");
        setTimeout(() => { setMessageTarget(null); setMessageResult(null); }, 1200);
      } else {
        const e = await res.json().catch(() => ({}));
        setMessageResult(e.message || "Failed to send.");
      }
    } catch {
      setMessageResult("Failed to send.");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSetCommission = async (userId: string, value: string) => {
    const pct = Number(value);
    if (!isFinite(pct) || pct < 0 || pct > 100) { alert("Commission must be between 0 and 100."); return; }
    setSavingCommission(userId);
    try {
      const res = await patchUser(userId, "set_commission", pct);
      if (res.ok) { await fetchUsers(); setCommissionDraft((d) => { const n = { ...d }; delete n[userId]; return n; }); }
      else { const e = await res.json().catch(() => ({})); alert(e.message || "Failed to update commission."); }
    } catch { alert("Failed to update commission."); } finally { setSavingCommission(null); }
  };

  // Blank = unlimited submissions per project for this manager.
  const handleSetSubmitLimit = async (userId: string, value: string) => {
    setSavingLimit(userId);
    try {
      const res = await patchUser(userId, "set_submit_limit", value.trim());
      if (res.ok) { await fetchUsers(); setLimitDraft((d) => { const n = { ...d }; delete n[userId]; return n; }); }
      else { const e = await res.json().catch(() => ({})); alert(e.message || "Failed to update submit limit."); }
    } catch { alert("Failed to update submit limit."); } finally { setSavingLimit(null); }
  };

  const handleSuspendUser = async (userId: string, currentStatus: string) => {
    setSuspendingId(userId);
    try {
      const res = await patchUser(userId, currentStatus === "active" ? "suspend" : "unsuspend");
      if (res.ok) await fetchUsers();
    } catch (error) {
      console.error("Failed to update user status:", error);
    } finally {
      setSuspendingId(null);
    }
  };

  const handleVerifyUser = async (userId: string, currentlyVerified: boolean) => {
    setVerifyingId(userId);
    try {
      const res = await patchUser(userId, currentlyVerified ? "unverify" : "verify");
      if (res.ok) await fetchUsers();
    } catch (error) {
      console.error("Failed to update verification:", error);
    } finally {
      setVerifyingId(null);
    }
  };

  const confirmRoleChange = async () => {
    if (!roleChange) return;
    setChangingRole(true);
    setRoleError("");
    try {
      const res = await patchUser(roleChange.user.id, roleChange.action);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setRoleError(e.message || "Couldn't change the position.");
        return;
      }
      setNotice(roleChange.action === "make_manager"
        ? `${roleChange.user.fullName} is now a manager.`
        : `${roleChange.user.fullName}'s manager position was revoked.`);
      if (roleChange.action === "make_manager") setTab("managers");
      setRoleChange(null);
      await fetchUsers();
    } catch {
      setRoleError("Couldn't change the position.");
    } finally {
      setChangingRole(false);
    }
  };

  const handleRequestLocation = async () => {
    if (!confirm(`Ask all users without a location (${stats.missingLocation}) to provide it? They'll see a location prompt on their dashboard.`)) return;
    setRequestingLocation(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_location_all" }),
      });
      const data = await res.json();
      alert(data.message || "Done.");
      await fetchUsers();
    } catch (error) {
      console.error("Failed to request location:", error);
    } finally {
      setRequestingLocation(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      if (session?.user?.role !== "admin") {
        router.push("/dashboard");
        return;
      }
      fetchUsers();
    }
  }, [status, router, session]);

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const managers = useMemo(() => users.filter((u) => u.role === "manager"), [users]);
  const contributors = useMemo(() => users.filter((u) => u.role !== "manager"), [users]);

  // Each manager's team = everyone they referred.
  const teamOf = useMemo(() => {
    const m = new Map<string, UserData[]>();
    for (const u of users) {
      if (!u.referredById) continue;
      const ref = byId.get(u.referredById);
      if (ref?.role !== "manager") continue;
      if (!m.has(ref.id)) m.set(ref.id, []);
      m.get(ref.id)!.push(u);
    }
    return m;
  }, [users, byId]);

  const managerOf = (u: UserData) => {
    const ref = u.referredById ? byId.get(u.referredById) : undefined;
    return ref?.role === "manager" ? ref : undefined;
  };

  const countryGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users) {
      const c = u.country?.trim() || UNKNOWN;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [users]);

  const matches = (user: UserData) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !q ||
      user.fullName.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      user.userId.toLowerCase().includes(q) ||
      user.phone.includes(searchTerm) ||
      (user.city?.toLowerCase().includes(q) ?? false) ||
      (user.region?.toLowerCase().includes(q) ?? false);
    const country = user.country?.trim() || UNKNOWN;
    return matchesSearch &&
      (filterCountry === "all" || country === filterCountry) &&
      (filterStatus === "all" || user.status === filterStatus);
  };

  const filteredUsers = useMemo(() => contributors.filter((u) => {
    if (!matches(u)) return false;
    if (filterManager === "all") return true;
    const mgr = managerOf(u);
    return filterManager === NO_MANAGER ? !mgr : mgr?.id === filterManager;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [contributors, searchTerm, filterCountry, filterStatus, filterManager, byId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredManagers = useMemo(() => managers.filter(matches), [managers, searchTerm, filterCountry, filterStatus]);

  const exportList = tab === "managers" ? filteredManagers : filteredUsers;
  const exportEmails = () => {
    navigator.clipboard.writeText(exportList.map((u) => u.email).join("\n"));
    alert(`${exportList.length} emails copied to clipboard!`);
  };
  const exportPhones = () => {
    navigator.clipboard.writeText(exportList.map((u) => u.phone).join("\n"));
    alert(`${exportList.length} phone numbers copied to clipboard!`);
  };
  const exportCSV = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["User ID", "Name", "Role", "Manager", "Email", "Phone", "Country", "Region", "City", "Balance", "Total Earned", "Surveys", "Referrals", "Joined"];
    const rows = exportList.map((u) => [
      u.userId, u.fullName, u.role, managerOf(u)?.fullName ?? "", u.email, u.phone, u.country ?? "", u.region ?? "", u.city ?? "",
      u.balance, u.totalEarned, u.surveysCompleted, u.referralCount, formatDate(u.createdAt),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const locationLabel = (u: UserData) => {
    const parts = [u.city, u.region, u.country].filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  };

  const openMessage = (u: UserData) => { setMessageTarget(u); setMessageBody(""); setMessageResult(null); };
  const viewTeam = (m: UserData) => { setFilterManager(m.id); setTab("contributors"); window.scrollTo({ top: 0, behavior: "smooth" }); };

  if (status === "loading" || isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 size={28} className="animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  const selectCls = "h-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm";
  const teamFilterManager = filterManager !== "all" && filterManager !== NO_MANAGER ? byId.get(filterManager) : undefined;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PageHeader
          icon={Users}
          title="Users"
          description="Contributors and managers — search, verify, suspend, message and manage positions."
          actions={
            <Button
              size="sm"
              onClick={handleRequestLocation}
              disabled={requestingLocation || stats.missingLocation === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              title="Show a location prompt to users who haven't set their location"
            >
              <MapPin size={15} />
              {requestingLocation ? "Sending…" : `Request location (${stats.missingLocation})`}
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} tone="blue" label="Total users" value={stats.totalUsers} hint={`${stats.activeUsers} active`} />
          <StatCard icon={Crown} tone="purple" label="Managers" value={stats.managers ?? managers.length} hint={`${Array.from(teamOf.values()).reduce((n, t) => n + t.length, 0)} people in teams`} />
          <StatCard icon={BadgeCheck} tone="sky" label="Verified" value={stats.verifiedUsers} />
          <StatCard icon={Lock} tone="red" label="Suspended" value={stats.suspendedUsers} />
          <StatCard icon={ShieldAlert} tone="orange" label="AI flagged" value={stats.fraudFlaggedUsers} />
          <StatCard icon={MapPin} tone="slate" label="No location" value={stats.missingLocation} />
          <StatCard icon={TrendingUp} tone="green" label="Total paid out" value={formatCurrency(stats.totalPaidOut)} />
          <StatCard icon={Wallet} tone="amber" label="Total balance" value={formatCurrency(stats.totalBalance)} />
        </div>

        {notice && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100"><X size={16} /></button>
          </div>
        )}

        {/* Tabs + toolbar */}
        <Panel className="p-4 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "contributors", label: "Contributors", count: contributors.length },
                { value: "managers", label: "Managers", count: managers.length },
              ]}
            />
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={exportEmails}><Mail size={15} /> Emails</Button>
              <Button variant="outline" size="sm" onClick={exportPhones}><Phone size={15} /> Phones</Button>
              <Button variant="outline" size="sm" onClick={exportCSV}><Download size={15} /> CSV</Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
            <div className="relative flex-1 md:min-w-[16rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input
                placeholder="Search name, email, ID, phone, city…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn(selectCls, "w-full pl-9 pr-3")}
              />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} className={selectCls}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className={selectCls}>
              <option value="all">All countries</option>
              {countryGroups.map(([country, count]) => (
                <option key={country} value={country}>{country} ({count})</option>
              ))}
            </select>
            {tab === "contributors" && (
              <select value={filterManager} onChange={(e) => setFilterManager(e.target.value)} className={selectCls}>
                <option value="all">Any manager</option>
                <option value={NO_MANAGER}>No manager</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>Team: {m.fullName} ({teamOf.get(m.id)?.length ?? 0})</option>
                ))}
              </select>
            )}
          </div>
          {teamFilterManager && tab === "contributors" && (
            <div className="flex items-center gap-2 rounded-xl bg-violet-50 dark:bg-violet-950/30 px-3 py-2 text-sm text-violet-800 dark:text-violet-300">
              <Crown size={15} />Showing {teamFilterManager.fullName}&apos;s team
              <button onClick={() => setFilterManager("all")} className="ml-auto text-xs font-medium hover:underline">Show everyone</button>
            </div>
          )}
        </Panel>

        {/* ── Managers ─────────────────────────────────────────────── */}
        {tab === "managers" && (
          filteredManagers.length === 0 ? (
            <EmptyState
              icon={Crown}
              title={managers.length ? "No managers match your filters" : "No managers yet"}
              description="Open a contributor in the Contributors tab and choose “Make manager” to give them the position."
            />
          ) : (
            <>
              <p className="text-sm text-zinc-500">
                Managers refer unlimited people and earn a commission whenever someone in their team is rewarded on a project
                (default {DEFAULT_MANAGER_COMMISSION}%). They can also submit beyond a project&apos;s slots, up to their own limit.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {filteredManagers.map((m) => {
                  const team = teamOf.get(m.id) ?? [];
                  const teamEarned = team.reduce((s, u) => s + u.totalEarned, 0);
                  const current = m.commissionPercent ?? DEFAULT_MANAGER_COMMISSION;
                  const draft = commissionDraft[m.id] ?? String(current);
                  const curLimit = m.managerSubmitLimit != null ? String(m.managerSubmitLimit) : "";
                  const limitVal = limitDraft[m.id] ?? curLimit;
                  return (
                    <Panel key={m.id} className={cn("overflow-hidden", m.status !== "active" && "opacity-75")}>
                      <div className="flex items-start gap-3 p-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-semibold text-white">
                          {initials(m.fullName) || "M"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 font-semibold text-foreground">
                            <span className="truncate">{m.fullName}</span>
                            {m.verified && <VerifiedBadge size={15} />}
                          </p>
                          <p className="truncate text-xs text-zinc-500">{m.userId} · {m.phone}</p>
                          <p className="truncate text-xs text-zinc-500 flex items-center gap-1"><MapPin size={11} />{locationLabel(m)}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                          <Crown size={11} />Manager
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-px bg-zinc-100 dark:bg-zinc-800 border-y border-zinc-100 dark:border-zinc-800 text-center">
                        {[
                          ["Team", String(team.length)],
                          ["Team earned", formatCurrency(teamEarned)],
                          ["Commission", formatCurrency(m.commissionEarned ?? 0)],
                        ].map(([k, v]) => (
                          <div key={k} className="bg-white dark:bg-zinc-900 py-2.5">
                            <p className="text-[11px] text-zinc-500">{k}</p>
                            <p className="text-sm font-semibold text-foreground tabular-nums">{v}</p>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-3 p-4">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-zinc-500">Commission rate</label>
                          <div className="flex items-center gap-1.5">
                            <div className="relative flex-1">
                              <input
                                type="number" min="0" max="100" step="0.5"
                                value={draft}
                                onChange={(e) => setCommissionDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                                className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 pl-3 pr-7 text-sm"
                              />
                              <Percent size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                            </div>
                            {Number(draft) !== current && (
                              <button onClick={() => handleSetCommission(m.id, draft)} disabled={savingCommission === m.id}
                                className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                                {savingCommission === m.id ? "…" : "Save"}
                              </button>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-zinc-500">Submits per project</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" min="0" placeholder="Unlimited"
                              value={limitVal}
                              onChange={(e) => setLimitDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                              className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm"
                            />
                            {limitVal !== curLimit && (
                              <button onClick={() => handleSetSubmitLimit(m.id, limitVal)} disabled={savingLimit === m.id}
                                className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                                {savingLimit === m.id ? "…" : "Save"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 dark:border-zinc-800 px-4 py-3">
                        <button onClick={() => viewTeam(m)} disabled={!team.length}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-900/20 disabled:opacity-40">
                          View team<ChevronRight size={13} />
                        </button>
                        <div className="ml-auto flex flex-wrap items-center gap-1.5">
                          <MessageButton onClick={() => openMessage(m)} />
                          <VerifyButton user={m} busy={verifyingId === m.id} onClick={() => handleVerifyUser(m.id, m.verified)} />
                          <SuspendButton user={m} busy={suspendingId === m.id} onClick={() => handleSuspendUser(m.id, m.status)} />
                          <button
                            onClick={() => { setRoleError(""); setRoleChange({ user: m, action: "revoke_manager" }); }}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <UserMinus size={13} />Revoke manager
                          </button>
                        </div>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </>
          )
        )}

        {/* ── Contributors ─────────────────────────────────────────── */}
        {tab === "contributors" && (
          filteredUsers.length === 0 ? (
            <EmptyState icon={Search} title="No users match your filters" />
          ) : (
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{filteredUsers.length} contributor{filteredUsers.length === 1 ? "" : "s"}</p>
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-50/80 dark:bg-zinc-800/40">
                    <tr className="text-left text-xs font-medium text-zinc-500">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Manager</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                      <th className="py-3 px-4 text-right">Earned</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const mgr = managerOf(user);
                      return (
                        <tr key={user.id} className="border-t border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{initials(user.fullName)}</div>
                              <div className="min-w-0">
                                <p className="font-medium text-foreground flex items-center gap-1.5 break-words">{user.fullName}{user.verified && <VerifiedBadge size={14} />}</p>
                                <p className="text-xs text-zinc-500">{user.userId} · joined {formatDate(user.createdAt)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm text-foreground break-all">{user.email}</p>
                            <p className="text-xs text-zinc-500 flex flex-wrap items-center gap-1.5">
                              {user.phone}
                              <RiskBadges user={user} />
                            </p>
                          </td>
                          <td className="py-3 px-4 text-sm text-zinc-600 dark:text-zinc-400">{locationLabel(user)}</td>
                          <td className="py-3 px-4">
                            {mgr ? (
                              <button onClick={() => setFilterManager(mgr.id)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300" title="Show this manager's team">
                                <Crown size={11} />{mgr.fullName}
                              </button>
                            ) : <span className="text-xs text-zinc-400">—</span>}
                          </td>
                          <td className="py-3 px-4 text-center"><StatusBadge status={user.status} /></td>
                          <td className="py-3 px-4 text-right font-medium text-emerald-600 tabular-nums">{formatCurrency(user.balance)}</td>
                          <td className="py-3 px-4 text-right text-foreground tabular-nums">{formatCurrency(user.totalEarned)}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-1.5">
                              <MessageButton onClick={() => openMessage(user)} />
                              <VerifyButton user={user} busy={verifyingId === user.id} onClick={() => handleVerifyUser(user.id, user.verified)} />
                              <SuspendButton user={user} busy={suspendingId === user.id} onClick={() => handleSuspendUser(user.id, user.status)} />
                              <MakeManagerButton onClick={() => { setRoleError(""); setRoleChange({ user, action: "make_manager" }); }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredUsers.map((user) => {
                  const mgr = managerOf(user);
                  return (
                    <div key={user.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300">{initials(user.fullName)}</div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate flex items-center gap-1.5">{user.fullName}{user.verified && <VerifiedBadge size={14} />}</p>
                            <p className="text-xs text-zinc-500">{user.userId}</p>
                          </div>
                        </div>
                        <StatusBadge status={user.status} />
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <p className="text-foreground break-all">{user.email}</p>
                        <p className="text-zinc-500 flex flex-wrap items-center gap-1.5">{user.phone}<RiskBadges user={user} /></p>
                        <p className="text-zinc-500 flex items-center gap-1"><MapPin size={13} /> {locationLabel(user)}</p>
                        {mgr && (
                          <p className="flex items-center gap-1 text-violet-700 dark:text-violet-300 text-xs font-medium"><Crown size={12} />Team of {mgr.fullName}</p>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        {[["Balance", formatCurrency(user.balance)], ["Earned", formatCurrency(user.totalEarned)], ["Referrals", String(user.referralCount)]].map(([k, v]) => (
                          <div key={k} className="rounded-lg bg-zinc-50 dark:bg-zinc-900 py-2">
                            <p className="text-xs text-zinc-500">{k}</p>
                            <p className="text-sm font-semibold text-foreground">{v}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
                        <MessageButton onClick={() => openMessage(user)} />
                        <VerifyButton user={user} busy={verifyingId === user.id} onClick={() => handleVerifyUser(user.id, user.verified)} />
                        <SuspendButton user={user} busy={suspendingId === user.id} onClick={() => handleSuspendUser(user.id, user.status)} />
                        <MakeManagerButton onClick={() => { setRoleError(""); setRoleChange({ user, action: "make_manager" }); }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )
        )}
      </div>

      {/* Manager position confirm dialog */}
      {roleChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !changingRole && setRoleChange(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <div className={cn("mb-4 flex h-12 w-12 items-center justify-center rounded-xl",
              roleChange.action === "make_manager" ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10" : "bg-red-50 text-red-600 dark:bg-red-500/10")}>
              {roleChange.action === "make_manager" ? <UserPlus size={22} /> : <UserMinus size={22} />}
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {roleChange.action === "make_manager" ? `Make ${roleChange.user.fullName} a manager?` : `Revoke ${roleChange.user.fullName}'s manager position?`}
            </h3>
            <ul className="mt-3 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-300 list-disc pl-5">
              {roleChange.action === "make_manager" ? (
                <>
                  <li>They can refer unlimited people.</li>
                  <li>They earn {DEFAULT_MANAGER_COMMISSION}% commission (you can change it) when their team is rewarded.</li>
                  <li>They can submit beyond a project&apos;s slots, up to the limit you set.</li>
                  <li>They don&apos;t need to finish contributor onboarding while they&apos;re a manager.</li>
                </>
              ) : (
                <>
                  <li>They become a regular contributor straight away — no more commission on future rewards.</li>
                  <li>The normal referral limit applies to new referrals; people already in their team stay referred by them.</li>
                  <li>Commission already earned stays in their balance.</li>
                  <li>Their commission rate and submit limit are kept, in case you give the position back.</li>
                  <li>If they never completed onboarding (location, ID, consent), they&apos;ll be asked to next time they use the site.</li>
                </>
              )}
            </ul>
            {roleError && <p className="mt-3 text-sm text-red-600">{roleError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRoleChange(null)} disabled={changingRole}>Cancel</Button>
              <Button
                onClick={confirmRoleChange}
                disabled={changingRole}
                className={roleChange.action === "make_manager" ? "bg-violet-600 hover:bg-violet-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              >
                {changingRole && <Loader2 size={15} className="animate-spin" />}
                {roleChange.action === "make_manager" ? "Make manager" : "Revoke position"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Admin → user direct message composer */}
      {messageTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !sendingMessage && setMessageTarget(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 min-w-0">
                <MessageCircle size={18} className="text-blue-600 shrink-0" />
                <h3 className="font-semibold truncate">Message {messageTarget.fullName}</h3>
              </div>
              <button onClick={() => setMessageTarget(null)} disabled={sendingMessage} className="p-1 text-zinc-400 hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-zinc-500">
                Sent as a direct message to <strong>{messageTarget.userId}</strong>. They&apos;ll see it in their inbox and can reply.
              </p>
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={5}
                maxLength={4000}
                autoFocus
                placeholder="Write your message…"
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {messageResult && (
                <p className={`text-sm ${messageResult === "Message sent." ? "text-green-600" : "text-red-600"}`}>{messageResult}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMessageTarget(null)} disabled={sendingMessage}>Cancel</Button>
                <Button onClick={sendAdminMessage} disabled={sendingMessage || !messageBody.trim()} className="bg-blue-600 hover:bg-blue-700">
                  {sendingMessage ? <><Loader2 size={16} className="mr-1 animate-spin" />Sending…</> : <><Send size={16} className="mr-1" />Send</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function RiskBadges({ user }: { user: UserData }) {
  return (
    <>
      {user.duplicatePhone && (
        <span title="This phone number is used by more than one account" className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">shared phone</span>
      )}
      {user.fraudRiskScore != null && (
        <span
          title={`AI duplicate-account risk: ${user.fraudRiskScore}/100 — ${user.fraudRiskReason ?? "no reason given"}`}
          className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        >
          <ShieldAlert size={10} /> AI flagged ({user.fraudRiskScore})
        </span>
      )}
    </>
  );
}

const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50";

function MessageButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Send a direct message" className={cn(iconBtn, "border-zinc-200 text-blue-600 hover:bg-blue-50 dark:border-zinc-700 dark:hover:bg-blue-900/20")}>
      <MessageCircle size={15} />
    </button>
  );
}

function MakeManagerButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Make manager" className={cn(iconBtn, "border-zinc-200 text-violet-600 hover:bg-violet-50 dark:border-zinc-700 dark:hover:bg-violet-900/20")}>
      <Crown size={15} />
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
      status === "active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "active" ? "bg-emerald-500" : "bg-red-500")} />
      {status === "active" ? "Active" : "Suspended"}
    </span>
  );
}

function VerifyButton({ user, busy, onClick }: { user: { verified: boolean }; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={user.verified ? "Remove verification badge" : "Give this user a verified badge"}
      className={cn(iconBtn, user.verified
        ? "border-sky-200 bg-sky-50 text-sky-600 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-500/10"
        : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800")}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={15} />}
    </button>
  );
}

function SuspendButton({ user, busy, onClick }: { user: { status: string }; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={user.status === "active" ? "Suspend" : "Unsuspend"}
      className={cn(iconBtn, user.status === "active"
        ? "border-zinc-200 text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-900/20"
        : "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-900/20")}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : user.status === "active" ? <Lock size={15} /> : <Unlock size={15} />}
    </button>
  );
}
