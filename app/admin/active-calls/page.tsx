"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import {
  Phone, Loader2, RefreshCw, AlertCircle, Video,
  Mic, Zap,
} from "lucide-react";

interface ActiveCall {
  id: string;
  callCode: string;
  initiatorId: string;
  initiatorName: string;
  initiatorUserId: string;
  initiatorEmail: string;
  receiverId: string | null;
  receiverName: string | null;
  receiverUserId: string | null;
  receiverEmail: string | null;
  status: string;
  callType: string;
  duration: number;
  createdAt: string;
  updatedAt: string;
}

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-GH", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminActiveCallsPage() {
  const { status } = useSession();
  const router = useRouter();

  const [calls, setCalls] = useState<ActiveCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/active-calls")
      .then(r => r.json())
      .then(d => {
        setCalls(d.calls ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Initial load
  useEffect(() => {
    if (!hasLoadedRef.current && status === "authenticated") {
      hasLoadedRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
  }, [status, load]);

  // Auto-refresh every 3 seconds
  useEffect(() => {
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  const handleReconnect = async (callCode: string) => {
    setReconnecting(prev => new Set(prev).add(callCode));
    try {
      const res = await fetch(`/api/admin/calls/${callCode}/reconnect`, {
        method: "POST",
      });
      if (!res.ok) {
        alert("Failed to trigger reconnect");
      } else {
        // Brief success feedback
        setTimeout(() => {
          setReconnecting(prev => {
            const s = new Set(prev);
            s.delete(callCode);
            return s;
          });
        }, 1000);
      }
    } catch {
      alert("Error triggering reconnect");
      setReconnecting(prev => {
        const s = new Set(prev);
        s.delete(callCode);
        return s;
      });
    }
  };

  if (status === "loading") return null;

  return (
    <AdminLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Active Calls</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Live call connections — help users reconnect if needed</p>
          </div>
          <div className="flex items-center gap-2">
            {calls.length > 0 && (
              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1 rounded-full font-medium flex items-center gap-1">
                <Phone size={12} /> {calls.length} active
              </span>
            )}
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw size={14} className="mr-1.5" />Refresh
            </Button>
          </div>
        </div>

        {/* Calls table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={32} className="animate-spin text-blue-600" />
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-20">
            <Phone size={40} className="mx-auto mb-3 text-zinc-300" />
            <p className="text-zinc-500 font-medium">No active calls</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Initiator</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Receiver</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Duration</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Started</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {calls.map(call => (
                    <tr key={call.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          call.status === "reconnecting"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        }`}>
                          {call.status === "reconnecting" ? (
                            <>
                              <AlertCircle size={11} />Reconnecting
                            </>
                          ) : (
                            <>
                              <Phone size={11} />{call.status}
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">{call.initiatorName}</p>
                        <p className="text-xs text-zinc-400">{call.initiatorUserId}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">
                          {call.receiverName || <span className="text-zinc-400">–</span>}
                        </p>
                        {call.receiverUserId && (
                          <p className="text-xs text-zinc-400">{call.receiverUserId}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          call.callType === "video"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}>
                          {call.callType === "video" ? <Video size={11} /> : <Mic size={11} />}
                          {call.callType}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-700 dark:text-zinc-300">{fmt(call.duration)}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{fmtDate(call.createdAt)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleReconnect(call.callCode)}
                          disabled={reconnecting.has(call.callCode)}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                            reconnecting.has(call.callCode)
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 opacity-60 cursor-wait"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                          }`}
                          title="Force both users to reconnect"
                        >
                          {reconnecting.has(call.callCode) ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />Reconnecting…
                            </>
                          ) : (
                            <>
                              <Zap size={13} />Reconnect
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
