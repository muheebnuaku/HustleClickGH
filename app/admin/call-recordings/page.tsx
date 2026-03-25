"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Video, Mic, Download, ChevronLeft, ChevronRight,
  Loader2, VideoOff, RefreshCw, Search,
} from "lucide-react";

interface Recording {
  id: string;
  callCode: string;
  duration: number;
  fileUrl: string;
  fileSize: number | null;
  callType: string;
  otherName: string | null;
  createdAt: string;
  user: { fullName: string; userId: string };
}

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function fmtBytes(b: number | null) {
  if (!b) return "–";
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1_048_576).toFixed(1)} MB`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-GH", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminCallRecordingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [pages,      setPages]      = useState(1);
  const [total,      setTotal]      = useState(0);
  const [search,     setSearch]     = useState("");
  const [searchInput,setSearchInput]= useState("");
  const [callType,   setCallType]   = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "25" });
    if (search)   params.set("search",   search);
    if (callType) params.set("callType", callType);
    fetch(`/api/admin/call-recordings?${params}`)
      .then(r => r.json())
      .then(d => {
        setRecordings(d.recordings ?? []);
        setPages(d.pages ?? 1);
        setTotal(d.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, callType]);

  useEffect(() => { load(); }, [load]);

  const applySearch = () => { setSearch(searchInput); setPage(1); };

  if (status === "loading") return null;

  return (
    <AdminLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Call Recordings</h1>
            <p className="text-sm text-zinc-500 mt-0.5">All live call recordings across all users</p>
          </div>
          <div className="flex items-center gap-2">
            {total > 0 && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-full font-medium">
                {total} recording{total !== 1 ? "s" : ""}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw size={14} className="mr-1.5" />Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1">
            <Input
              placeholder="Search user, call code, partner…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applySearch()}
              className="w-64 h-9 text-sm"
            />
            <Button size="sm" onClick={applySearch} className="h-9">
              <Search size={14} />
            </Button>
          </div>
          <div className="flex gap-1">
            {["", "audio", "video"].map(t => (
              <button
                key={t}
                onClick={() => { setCallType(t); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  callType === t
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300"
                }`}
              >
                {t === "" ? "All" : t === "audio" ? "🎙 Audio" : "📹 Video"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={32} className="animate-spin text-blue-600" />
          </div>
        ) : recordings.length === 0 ? (
          <div className="text-center py-20">
            <VideoOff size={40} className="mx-auto mb-3 text-zinc-300" />
            <p className="text-zinc-500 font-medium">No recordings found</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">User</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">With</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Call Code</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Duration</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Size</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {recordings.map(r => (
                    <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap text-xs">{fmtDate(r.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">{r.user.fullName}</p>
                        <p className="text-xs text-zinc-400">{r.user.userId}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          r.callType === "video"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}>
                          {r.callType === "video" ? <Video size={11} /> : <Mic size={11} />}
                          {r.callType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r.otherName || <span className="text-zinc-400">–</span>}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{r.callCode || "–"}</td>
                      <td className="px-4 py-3 font-mono text-zinc-700 dark:text-zinc-300">{fmt(r.duration)}</td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">{fmtBytes(r.fileSize)}</td>
                      <td className="px-4 py-3">
                        <a
                          href={r.fileUrl}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          <Download size={13} />Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm text-zinc-500">Page {page} of {pages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}>
              <ChevronRight size={16} />
            </Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
