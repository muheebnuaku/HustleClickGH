"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import {
  LogIn, LogOut, UserPlus, Phone, PhoneOff, PhoneCall, PhoneMissed,
  AlertCircle, CheckCircle2, Upload, Wallet, Wifi, WifiOff, X,
  RefreshCw, Search, Filter, Clock, User, ChevronDown, ChevronRight,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LogEntry {
  id: string;
  type: string;
  userId: string | null;
  userName: string | null;
  severity: string;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const LOG_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string; border: string }
> = {
  login:                   { label: "User Login",            icon: LogIn,      color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200"  },
  login_failed:            { label: "Login Failed",          icon: AlertCircle, color: "text-red-700",   bg: "bg-red-50",     border: "border-red-200"    },
  logout:                  { label: "User Logout",           icon: LogOut,     color: "text-zinc-600",   bg: "bg-zinc-50",    border: "border-zinc-200"   },
  register:                { label: "New Registration",      icon: UserPlus,   color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200"   },
  call_start:              { label: "Call Started",          icon: PhoneCall,  color: "text-indigo-700", bg: "bg-indigo-50",  border: "border-indigo-200" },
  call_connecting:         { label: "Call Connecting",       icon: Phone,      color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200"   },
  call_connected:          { label: "Call Connected",        icon: CheckCircle2, color: "text-green-700", bg: "bg-green-50", border: "border-green-200"  },
  call_reconnecting:       { label: "Call Reconnecting",     icon: Wifi,       color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200"  },
  call_end:                { label: "Call Ended",            icon: PhoneOff,   color: "text-slate-700",  bg: "bg-slate-50",   border: "border-slate-200"  },
  call_cancel:             { label: "Call Cancelled",        icon: X,          color: "text-orange-700", bg: "bg-orange-50",  border: "border-orange-200" },
  call_decline:            { label: "Call Declined",         icon: PhoneMissed, color: "text-red-700",   bg: "bg-red-50",     border: "border-red-200"    },
  call_timeout:            { label: "Call Timeout",          icon: Clock,      color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200"  },
  call_error:              { label: "Call Error",            icon: WifiOff,    color: "text-red-700",    bg: "bg-red-50",     border: "border-red-200"    },
  page_close_during_call:  { label: "Page Closed in Call",  icon: AlertCircle, color: "text-red-700",   bg: "bg-red-50",     border: "border-red-200"    },
  submission:              { label: "Submission",            icon: Upload,     color: "text-purple-700", bg: "bg-purple-50",  border: "border-purple-200" },
  submission_approved:     { label: "Submission Approved",   icon: CheckCircle2, color: "text-green-700", bg: "bg-green-50", border: "border-green-200"  },
  submission_rejected:     { label: "Submission Rejected",   icon: AlertCircle, color: "text-red-700",   bg: "bg-red-50",     border: "border-red-200"    },
  withdrawal_request:      { label: "Withdrawal Request",    icon: Wallet,     color: "text-yellow-700", bg: "bg-yellow-50",  border: "border-yellow-200" },
  withdrawal_approved:     { label: "Withdrawal Approved",   icon: Wallet,     color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200"  },
  withdrawal_rejected:     { label: "Withdrawal Rejected",   icon: Wallet,     color: "text-red-700",    bg: "bg-red-50",     border: "border-red-200"    },
};

const DEFAULT_CONFIG = {
  label: "System Event",
  icon: Activity,
  color: "text-zinc-600",
  bg: "bg-zinc-50",
  border: "border-zinc-200",
};

const SEVERITY_BADGE: Record<string, string> = {
  info:    "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  error:   "bg-red-100 text-red-700",
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return new Date(date).toLocaleDateString();
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Log Row ───────────────────────────────────────────────────────────────────
function LogRow({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = LOG_CONFIG[log.type] ?? DEFAULT_CONFIG;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden transition-all`}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Icon */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border}`}>
          <Icon size={16} className={cfg.color} />
        </div>

        {/* Label + user */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[log.severity] ?? SEVERITY_BADGE.info}`}>
              {log.severity}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {log.userName && (
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <User size={11} />
                {log.userName}
              </span>
            )}
            {log.ip && (
              <span className="text-xs text-zinc-400 font-mono">{log.ip}</span>
            )}
            {log.metadata?.callCode && (
              <span className="text-xs text-zinc-500 font-mono">
                Call: {log.metadata.callCode as string}
              </span>
            )}
            {log.metadata?.error && (
              <span className="text-xs text-red-500 truncate max-w-[200px]">
                {log.metadata.error as string}
              </span>
            )}
          </div>
        </div>

        {/* Time + expand */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-400 whitespace-nowrap" title={formatDateTime(log.createdAt)}>
            {timeAgo(log.createdAt)}
          </span>
          {log.metadata && Object.keys(log.metadata).length > 0
            ? (expanded ? <ChevronDown size={14} className="text-zinc-400" /> : <ChevronRight size={14} className="text-zinc-400" />)
            : null}
        </div>
      </div>

      {/* Expanded metadata */}
      {expanded && log.metadata && (
        <div className="px-4 pb-4 pt-1 border-t border-current/10">
          <p className="text-xs text-zinc-500 mb-2 font-semibold uppercase tracking-wide">Details</p>
          <div className="bg-white/60 rounded-lg p-3 font-mono text-xs text-zinc-700 space-y-1">
            <p className="text-zinc-400">Timestamp: {formatDateTime(log.createdAt)}</p>
            {log.userId && <p>User ID: {log.userId}</p>}
            {Object.entries(log.metadata).map(([k, v]) => (
              <p key={k}>
                <span className="text-zinc-400">{k}:</span>{" "}
                <span>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const ALL_TYPES = Object.keys(LOG_CONFIG);
const SEVERITIES = ["info", "success", "warning", "error"];

export default function ActivityLogPage() {
  const router  = useRouter();
  const { data: session, status } = useSession();

  const [logs,      setLogs]      = useState<LogEntry[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [pages,     setPages]     = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filters
  const [search,   setSearch]   = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sevFilter,  setSevFilter]  = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "50" });
      if (typeFilter) params.set("type", typeFilter);
      if (sevFilter)  params.set("severity", sevFilter);
      if (search)     params.set("search", search);

      const res = await fetch(`/api/admin/activity-log?${params}`);
      const d   = await res.json();
      setLogs(d.logs ?? []);
      setTotal(d.total ?? 0);
      setPage(d.page ?? 1);
      setPages(d.pages ?? 1);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [typeFilter, sevFilter, search]);

  // Auth gate
  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated" && session?.user?.role !== "admin") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  // Initial + filter-driven fetch
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "admin") {
      fetchLogs(1);
    }
  }, [status, session, fetchLogs]);

  // Auto-refresh every 5 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchLogs(page), 5000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchLogs, page]);

  // Group logs by date for the timeline
  const grouped = logs.reduce<Record<string, LogEntry[]>>((acc, log) => {
    const day = new Date(log.createdAt).toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    (acc[day] = acc[day] ?? []).push(log);
    return acc;
  }, {});

  const totalCalls    = logs.filter(l => l.type === "call_start").length;
  const totalErrors   = logs.filter(l => l.severity === "error").length;
  const totalLogins   = logs.filter(l => l.type === "login").length;
  const totalSubmits  = logs.filter(l => l.type === "submission").length;

  if (status === "loading") return null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Activity size={24} className="text-blue-600" />
              Activity Log
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              Live system events — {total.toLocaleString()} total entries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(r => !r)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                autoRefresh
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-zinc-50 border-zinc-200 text-zinc-500"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-green-500 animate-pulse" : "bg-zinc-400"}`} />
              {autoRefresh ? "Live" : "Paused"}
            </button>
            <Button variant="outline" size="sm" onClick={() => fetchLogs(page)}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)}>
              <Filter size={14} />
              Filters
            </Button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Logins",      value: totalLogins,  color: "text-green-600",  bg: "bg-green-50" },
            { label: "Calls",       value: totalCalls,   color: "text-indigo-600", bg: "bg-indigo-50" },
            { label: "Submissions", value: totalSubmits, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Errors",      value: totalErrors,  color: "text-red-600",    bg: "bg-red-50" },
          ].map(s => (
            <div key={s.label} className={`rounded-xl ${s.bg} p-4 text-center`}>
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-zinc-400">on this page</p>
            </div>
          ))}
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Input
                  placeholder="Search user, type, or metadata…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm px-3"
              >
                <option value="">All event types</option>
                {ALL_TYPES.map(t => (
                  <option key={t} value={t}>{LOG_CONFIG[t]?.label ?? t}</option>
                ))}
              </select>
              <select
                value={sevFilter}
                onChange={e => setSevFilter(e.target.value)}
                className="h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm px-3"
              >
                <option value="">All severities</option>
                {SEVERITIES.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              {(typeFilter || sevFilter || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setTypeFilter(""); setSevFilter(""); setSearch(""); }}
                >
                  <X size={14} /> Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-zinc-400">
            <Activity size={40} className="mx-auto mb-3 opacity-40" />
            <p>No activity logged yet.</p>
            <p className="text-sm mt-1">Events will appear here as users interact with the system.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([day, dayLogs]) => (
              <div key={day}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                    {day}
                  </span>
                  <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                </div>
                <div className="space-y-2">
                  {dayLogs.map(log => <LogRow key={log.id} log={log} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => fetchLogs(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-zinc-500">
              Page {page} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => fetchLogs(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
