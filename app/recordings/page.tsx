"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video, Mic, Download, Play, X, ChevronLeft, ChevronRight, Loader2, VideoOff } from "lucide-react";

interface CallRecording {
  id: string;
  callCode: string;
  duration: number;
  fileUrl: string;
  fileSize: number | null;
  callType: string;
  otherName: string | null;
  createdAt: string;
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

async function downloadRecording(fileUrl: string, fileName: string) {
  try {
    const res  = await fetch(fileUrl);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // Fallback: open in new tab
    window.open(fileUrl, "_blank");
  }
}

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<CallRecording[]>([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [pages, setPages]           = useState(1);
  const [total, setTotal]           = useState(0);
  const [playing, setPlaying]       = useState<CallRecording | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/call-recordings?page=${page}&limit=20`)
      .then(r => r.json())
      .then(d => {
        setRecordings(d.recordings ?? []);
        setPages(d.pages ?? 1);
        setTotal(d.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Call Recordings</h1>
            <p className="text-sm text-zinc-500 mt-0.5">All your live call recordings — saved automatically</p>
          </div>
          {total > 0 && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-full font-medium">
              {total} recording{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-blue-600" />
          </div>
        ) : recordings.length === 0 ? (
          <Card className="p-12 text-center">
            <VideoOff size={40} className="mx-auto mb-4 text-zinc-300" />
            <p className="font-medium text-zinc-600 dark:text-zinc-400">No recordings yet</p>
            <p className="text-sm text-zinc-400 mt-1">Recordings are saved automatically when you make a live call.</p>
          </Card>
        ) : (
          <>
            {/* Desktop table */}
            <Card className="overflow-hidden hidden sm:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500">With</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500">Duration</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500">Size</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {recordings.map(r => (
                      <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                            r.callType === "video"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          }`}>
                            {r.callType === "video" ? <Video size={11} /> : <Mic size={11} />}
                            {r.callType}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200">{r.otherName || <span className="text-zinc-400">Unknown</span>}</td>
                        <td className="px-4 py-3 font-mono text-zinc-700 dark:text-zinc-300">{fmt(r.duration)}</td>
                        <td className="px-4 py-3 text-zinc-500">{fmtBytes(r.fileSize)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-4">
                            {/* Play */}
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => setPlaying(r)}
                                className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 transition-all duration-200 hover:scale-105 active:scale-90 shadow-sm"
                              >
                                <Play size={16} />
                              </button>
                              <span className="text-[10px] font-medium text-zinc-400">Play</span>
                            </div>
                            {/* Download */}
                            <div className="flex flex-col items-center gap-1">
                              <button
                                disabled={downloading === r.id}
                                onClick={async () => {
                                  setDownloading(r.id);
                                  await downloadRecording(r.fileUrl, `recording-${r.callCode}.webm`);
                                  setDownloading(null);
                                }}
                                className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 ring-1 ring-zinc-200 dark:ring-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-400 transition-all duration-200 hover:scale-105 active:scale-90 shadow-sm disabled:opacity-40"
                              >
                                {downloading === r.id
                                  ? <Loader2 size={16} className="animate-spin" />
                                  : <Download size={16} />}
                              </button>
                              <span className="text-[10px] font-medium text-zinc-400">
                                {downloading === r.id ? "Saving…" : "Save"}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {recordings.map(r => (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          r.callType === "video"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}>
                          {r.callType === "video" ? <Video size={10} /> : <Mic size={10} />}
                          {r.callType}
                        </span>
                        <span className="font-mono text-xs text-zinc-500">{fmt(r.duration)}</span>
                      </div>
                      <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{r.otherName || "Unknown"}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{fmtDate(r.createdAt)} · {fmtBytes(r.fileSize)}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 px-4 py-4 flex items-center justify-center gap-10">
                    {/* Play */}
                    <div className="flex flex-col items-center gap-1.5">
                      <button
                        onClick={() => setPlaying(r)}
                        className="w-12 h-12 rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/15 hover:ring-white/20 flex items-center justify-center text-white/90 transition-all duration-200 hover:scale-105 active:scale-90 shadow-lg"
                      >
                        <Play size={20} />
                      </button>
                      <span className="text-[11px] font-medium tracking-wide text-slate-400">Play</span>
                    </div>
                    {/* Download */}
                    <div className="flex flex-col items-center gap-1.5">
                      <button
                        disabled={downloading === r.id}
                        onClick={async () => {
                          setDownloading(r.id);
                          await downloadRecording(r.fileUrl, `recording-${r.callCode}.webm`);
                          setDownloading(null);
                        }}
                        className="w-12 h-12 rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/15 hover:ring-white/20 flex items-center justify-center text-white/90 transition-all duration-200 hover:scale-105 active:scale-90 shadow-lg disabled:opacity-40"
                      >
                        {downloading === r.id
                          ? <Loader2 size={20} className="animate-spin" />
                          : <Download size={20} />}
                      </button>
                      <span className="text-[11px] font-medium tracking-wide text-slate-400">
                        {downloading === r.id ? "Saving…" : "Save"}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-sm text-zinc-500">Page {page} of {pages}</span>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Play modal ─────────────────────────────────────────────────────── */}
      {playing && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setPlaying(null)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Call with {playing.otherName || "Unknown"}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {fmtDate(playing.createdAt)} · {fmt(playing.duration)} · {fmtBytes(playing.fileSize)}
                </p>
              </div>
              <button
                onClick={() => setPlaying(null)}
                className="w-8 h-8 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Player */}
            <div className="p-5">
              {playing.callType === "video" ? (
                <div className="flex justify-center">
                  <video
                    src={playing.fileUrl}
                    controls
                    autoPlay
                    className="rounded-xl bg-black"
                    style={{ outline: "none", width: "260px", aspectRatio: "9/16" }}
                  />
                </div>
              ) : (
                <audio
                  src={playing.fileUrl}
                  controls
                  autoPlay
                  className="w-full"
                  style={{ outline: "none" }}
                />
              )}
              <div className="flex justify-center mt-4">
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    disabled={downloading === playing.id}
                    onClick={async () => {
                      setDownloading(playing.id);
                      await downloadRecording(playing.fileUrl, `recording-${playing.callCode}.webm`);
                      setDownloading(null);
                    }}
                    className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 ring-1 ring-slate-600 flex items-center justify-center text-white transition-all duration-200 hover:scale-105 active:scale-90 shadow-lg disabled:opacity-40"
                  >
                    {downloading === playing.id
                      ? <Loader2 size={22} className="animate-spin" />
                      : <Download size={22} />}
                  </button>
                  <span className="text-[11px] font-medium tracking-wide text-zinc-400">
                    {downloading === playing.id ? "Saving…" : "Save to device"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
