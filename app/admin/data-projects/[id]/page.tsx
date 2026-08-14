"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Loader2, CheckCircle2, XCircle, ArrowLeft, Mic, Video, ScanFace, Download, MessageSquare, Send, X, Trash2, Sparkles } from "lucide-react";
import { toDownloadUrl } from "@/lib/upload-file";
import type { AiReviewResult } from "@/lib/ai-review";
import Link from "next/link";

interface Submission {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSizeMB: number;
  files?: string | null; // JSON array of {url,name,type,sizeMB}
  language: string | null;
  promptUsed: string | null;
  status: string;
  rewarded: boolean;
  notes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  user: { id: string; userId: string; fullName: string; email: string; phone: string };
  contributorQuality?: { approved: number; rejected: number; reviewed: number; score: number; tier: "new" | "trusted" | "watch" } | null;
}

interface Project {
  id: string;
  title: string;
  projectType: string;
  reward: number;
  maxSubmissions: number;
  currentSubmissions: number;
  status: string;
}

const STATUS_FILTER = ["all", "pending", "approved", "rejected"];

export default function AdminProjectSubmissionsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Admin → contributor direct message (from a submission)
  const [msgTarget, setMsgTarget] = useState<{ id: string; name: string } | null>(null);
  const [msgBody, setMsgBody] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgError, setMsgError] = useState("");
  // Bulk delete of (non-approved) submissions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ── AI quality review (suggestion only; human still decides) ──
  const [aiResults, setAiResults] = useState<Record<string, AiReviewResult>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiError, setAiError] = useState<Record<string, string>>({});

  // Downscale a video/image element to a small JPEG data URL for the model.
  const toFrame = (src: CanvasImageSource, w: number, h: number): string | null => {
    try {
      const max = 768;
      const scale = Math.min(1, max / Math.max(w || max, h || max));
      const cw = Math.max(1, Math.round((w || max) * scale));
      const ch = Math.max(1, Math.round((h || max) * scale));
      const c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(src, 0, 0, cw, ch);
      return c.toDataURL("image/jpeg", 0.7); // throws (returns via catch) if canvas is CORS-tainted
    } catch { return null; }
  };

  const extractFrame = (url: string, type: string): Promise<string | null> =>
    new Promise((resolve) => {
      if (type.startsWith("image")) {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(toFrame(img, img.naturalWidth, img.naturalHeight));
        img.onerror = () => resolve(null);
        img.src = url;
      } else if (type.startsWith("video")) {
        const v = document.createElement("video");
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.preload = "metadata";
        v.src = url;
        v.onloadedmetadata = () => { try { v.currentTime = Math.min((v.duration || 1) / 2, (v.duration || 1) - 0.1); } catch { resolve(null); } };
        v.onseeked = () => resolve(toFrame(v, v.videoWidth, v.videoHeight));
        v.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 9000);
      } else resolve(null);
    });

  const handleAiReview = async (sub: Submission) => {
    setAiLoading(sub.id);
    setAiError((e) => { const n = { ...e }; delete n[sub.id]; return n; });
    try {
      const files = subFiles(sub).slice(0, 6);
      const frames: string[] = [];
      for (const f of files) { const fr = await extractFrame(f.url, f.type); if (fr) frames.push(fr); }
      if (!frames.length) {
        setAiError((e) => ({ ...e, [sub.id]: "Couldn't read frames (video/image only, and storage must allow CORS)." }));
        return;
      }
      const res = await fetch(`/api/admin/data-projects/${projectId}/submissions/${sub.id}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames }),
      });
      const d = await res.json();
      if (!res.ok) { setAiError((e) => ({ ...e, [sub.id]: d.message || "AI review failed." })); return; }
      setAiResults((r) => ({ ...r, [sub.id]: d.result }));
    } catch {
      setAiError((e) => ({ ...e, [sub.id]: "AI review failed." }));
    } finally {
      setAiLoading(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!selected.size) return;
    const approvedCount = submissions.filter((s) => selected.has(s.id) && s.status === "approved").length;
    const warn = approvedCount > 0
      ? `\n\n${approvedCount} of these are APPROVED — deleting them removes the delivered data and files but does NOT refund the contributor (already paid). Project counts stay as the historical record.`
      : "";
    if (!confirm(`Permanently delete ${selected.size} submission${selected.size === 1 ? "" : "s"} and ${selected.size === 1 ? "its" : "their"} files? This cannot be undone.${warn}`)) return;
    setDeleting(true);
    setError(""); setMessage("");
    try {
      const res = await fetch(`/api/admin/data-projects/${projectId}/submissions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.message || "Delete failed"); return; }
      setMessage(`Deleted ${d.deleted} submission${d.deleted === 1 ? "" : "s"} and freed their storage.`);
      setSelected(new Set());
      fetchData();
    } catch {
      setError("Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const sendAdminMessage = async () => {
    if (!msgTarget || !msgBody.trim()) return;
    setMsgSending(true);
    setMsgError("");
    try {
      const res = await fetch("/api/admin/users/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: msgTarget.id, body: msgBody.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setMsgError(data.message || "Could not send message."); return; }
      setMessage(`Message sent to ${msgTarget.name}.`);
      setMsgTarget(null);
      setMsgBody("");
    } catch {
      setMsgError("Could not send message.");
    } finally {
      setMsgSending(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projRes, subRes] = await Promise.all([
        fetch(`/api/admin/data-projects`),
        fetch(`/api/admin/data-projects/${projectId}/submissions`),
      ]);
      const projData = await projRes.json();
      const subData = await subRes.json();
      const found = projData.projects?.find((p: Project) => p.id === projectId);
      setProject(found || null);
      setSubmissions(subData.submissions || []);
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const handleApprove = async (subId: string) => {
    setActionLoading(subId);
    setMessage("");
    setError("");
    try {
      const res = await fetch(
        `/api/admin/data-projects/${projectId}/submissions/${subId}/approve`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) setError(data.message);
      else { setMessage(data.message); fetchData(); }
    } catch {
      setError("An error occurred");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (subId: string) => {
    setActionLoading(subId);
    setMessage("");
    setError("");
    try {
      const res = await fetch(
        `/api/admin/data-projects/${projectId}/submissions/${subId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: rejectNotes[subId] || "" }),
        }
      );
      const data = await res.json();
      if (!res.ok) setError(data.message);
      else { setMessage(data.message); fetchData(); }
    } catch {
      setError("An error occurred");
    } finally {
      setActionLoading(null);
    }
  };

  const filteredSubmissions =
    filter === "all"
      ? submissions
      : submissions.filter((s) => s.status === filter);

  const counts = {
    all: submissions.length,
    pending: submissions.filter((s) => s.status === "pending").length,
    approved: submissions.filter((s) => s.status === "approved").length,
    rejected: submissions.filter((s) => s.status === "rejected").length,
  };

  const getTypeIcon = (type: string) => {
    if (type === "voice") return <Mic size={16} className="text-blue-600" />;
    if (type === "video") return <Video size={16} className="text-purple-600" />;
    return <ScanFace size={16} className="text-orange-600" />;
  };

  const isAudio = (fileType: string) => fileType.startsWith("audio");
  const isVideo = (fileType: string) => fileType.startsWith("video");

  // A submission may hold several files (new) or one (legacy) — normalize.
  type SubFileMeta = { width?: number; height?: number; durationSecs?: number; brightness?: number; sharpness?: number; loudnessDb?: number; warnings?: string[] };
  type SubFileRow = { url: string; name: string; type: string; sizeMB: number; meta?: SubFileMeta | null };
  const subFiles = (sub: Submission): SubFileRow[] => {
    if (sub.files) {
      try {
        const arr = JSON.parse(sub.files);
        if (Array.isArray(arr) && arr.length) return arr;
      } catch {}
    }
    return [{ url: sub.fileUrl, name: sub.fileName, type: sub.fileType, sizeMB: sub.fileSizeMB }];
  };

  // Short spec line for a file's measured quality metadata.
  const fileSpec = (m?: SubFileMeta | null): string => {
    if (!m) return "";
    const p: string[] = [];
    if (m.width && m.height) p.push(`${m.width}×${m.height}`);
    if (m.durationSecs) p.push(`${m.durationSecs}s`);
    if (m.brightness !== undefined) p.push(`bright ${m.brightness}%`);
    if (m.sharpness !== undefined) p.push(`sharp ${m.sharpness}`);
    if (m.loudnessDb !== undefined && m.loudnessDb > -99) p.push(`${m.loudnessDb}dB`);
    return p.join(" · ");
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Back + Header */}
        <div>
          <Link href="/admin/data-projects" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-foreground mb-3">
            <ArrowLeft size={16} />Back to Projects
          </Link>
          {project && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  {getTypeIcon(project.projectType)}
                  <h1 className="text-xl font-bold text-foreground break-words">{project.title}</h1>
                </div>
                <p className="text-sm text-zinc-500">
                  Reward: <strong className="text-green-600">{formatCurrency(project.reward)}</strong> per approval &nbsp;·&nbsp;
                  Slots: <strong>{project.currentSubmissions}/{project.maxSubmissions}</strong>
                </p>
              </div>
            </div>
          )}
        </div>

        {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{message}</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTER.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}{" "}
              <span className="ml-1 opacity-70">({counts[f as keyof typeof counts]})</span>
            </button>
          ))}
        </div>

        {/* Bulk delete bar — any submission in the current view (incl. approved) */}
        {!loading && filteredSubmissions.length > 0 && (() => {
          const deletableIds = filteredSubmissions.map((s) => s.id);
          const allChecked = deletableIds.length > 0 && deletableIds.every((id) => selected.has(id));
          return (
            <div className="flex flex-wrap items-center gap-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => setSelected(e.target.checked ? new Set(deletableIds) : new Set())}
                  className="w-4 h-4 rounded border-zinc-300"
                />
                Select all {filter === "all" ? "" : filter} ({deletableIds.length})
              </label>
              {selected.size > 0 && (
                <>
                  <span className="text-xs text-zinc-500">{selected.size} selected</span>
                  <button onClick={handleBulkDelete} disabled={deleting} className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-1.5 disabled:opacity-50">
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete {selected.size}
                  </button>
                  <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-500 hover:underline">Clear</button>
                </>
              )}
            </div>
          );
        })()}

        {/* Submissions */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-400">
            <Loader2 size={24} className="animate-spin mr-2" />Loading submissions...
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <Card className="p-12 text-center text-zinc-400">
            <p className="font-medium">No {filter === "all" ? "" : filter} submissions</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredSubmissions.map((sub) => (
              <Card key={sub.id} className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* User Info */}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(sub.id)}
                        onChange={() => toggleSelect(sub.id)}
                        className="w-4 h-4 rounded border-zinc-300 shrink-0"
                        title="Select for deletion"
                      />
                      <div>
                        <p className="font-semibold text-foreground flex items-center gap-1.5">
                          {sub.user.fullName}
                          {sub.contributorQuality && sub.contributorQuality.reviewed >= 3 && (
                            <span
                              title={`Approval rate from past reviews: ${sub.contributorQuality.approved} approved / ${sub.contributorQuality.rejected} rejected`}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                sub.contributorQuality.tier === "trusted"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              }`}
                            >
                              {sub.contributorQuality.tier === "trusted" ? "Trusted" : "Low approval"} · {Math.round(sub.contributorQuality.score * 100)}%
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-zinc-400">{sub.user.userId} · {sub.user.phone}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        sub.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        sub.status === "approved" ? "bg-green-100 text-green-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {sub.status}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => handleAiReview(sub)}
                          disabled={aiLoading === sub.id}
                          title="Get an AI quality suggestion for this submission"
                          className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded-lg px-2.5 py-1 disabled:opacity-50"
                        >
                          {aiLoading === sub.id ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                          {aiLoading === sub.id ? "Scoring…" : "Score with AI"}
                        </button>
                        {sub.status === "rejected" && (
                          <button
                            onClick={() => handleApprove(sub.id)}
                            disabled={actionLoading === sub.id}
                            title="Approve this rejected submission instead"
                            className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 rounded-lg px-2.5 py-1 disabled:opacity-50"
                          >
                            {actionLoading === sub.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => { setMsgTarget({ id: sub.user.id, name: sub.user.fullName }); setMsgBody(""); setMsgError(""); }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 dark:border-blue-900 rounded-lg px-2.5 py-1"
                        >
                          <MessageSquare size={13} />Message
                        </button>
                      </div>
                    </div>

                    {/* File details */}
                    {(() => {
                      const files = subFiles(sub);
                      return (
                        <>
                          <div className="text-sm text-zinc-500 space-y-1 break-words">
                            <p><span className="font-medium">{files.length} file{files.length === 1 ? "" : "s"}</span> · {files.reduce((s, f) => s + f.sizeMB, 0).toFixed(1)}MB total</p>
                            {sub.language && <p><span className="font-medium">Language:</span> {sub.language}</p>}
                            {sub.promptUsed && <p><span className="font-medium">Prompt recorded:</span> &ldquo;{sub.promptUsed}&rdquo;</p>}
                            <p><span className="font-medium">Submitted:</span> {formatDate(sub.submittedAt)}</p>
                            {sub.reviewedAt && <p><span className="font-medium">Reviewed:</span> {formatDate(sub.reviewedAt)}</p>}
                            {sub.notes && (
                              <p className="text-red-600"><span className="font-medium">Notes:</span> {sub.notes}</p>
                            )}
                          </div>

                          {/* Media preview — responsive grid; audio spans full width */}
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {files.map((f, i) => (
                              <div
                                key={`${f.url}-${i}`}
                                className={`border border-zinc-100 dark:border-zinc-800 rounded-lg p-2 flex flex-col ${isAudio(f.type) ? "sm:col-span-2" : ""}`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <p className="text-xs font-medium text-foreground truncate">{f.name}</p>
                                  <a href={toDownloadUrl(f.url, f.name)} download={f.name} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0">
                                    <Download size={12} />Save
                                  </a>
                                </div>
                                <p className="text-[11px] text-zinc-400 mb-1">{f.sizeMB.toFixed(1)}MB · {f.type}{fileSpec(f.meta) ? ` · ${fileSpec(f.meta)}` : ""}</p>
                                {f.meta?.warnings && f.meta.warnings.length > 0 && (
                                  <p className="text-[11px] text-amber-600 mb-1">⚠ {f.meta.warnings.join(" · ")}</p>
                                )}
                                {isAudio(f.type) ? (
                                  <audio controls src={f.url} className="w-full h-10 mt-1" />
                                ) : isVideo(f.type) ? (
                                  <video controls playsInline src={f.url} className="rounded-lg mx-auto max-w-full max-h-72 bg-black" />
                                ) : (
                                  <img src={f.url} alt={f.name} className="rounded-lg mx-auto max-w-full max-h-72 object-contain bg-zinc-50 dark:bg-zinc-900" />
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    {/* AI quality suggestion (human still decides) */}
                    {aiError[sub.id] && (
                      <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{aiError[sub.id]}</div>
                    )}
                    {aiResults[sub.id] && (() => {
                      const r = aiResults[sub.id];
                      const cls = r.verdict === "approve"
                        ? "border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-900"
                        : r.verdict === "reject"
                        ? "border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900"
                        : "border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900";
                      return (
                        <div className={`rounded-lg border p-3 ${cls}`}>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Sparkles size={14} className="text-purple-600" />
                            <span className="text-sm font-semibold text-foreground capitalize">AI: {r.verdict} · {r.score}/100</span>
                            <span className="text-[10px] text-zinc-400 ml-auto">{r.model} · suggestion only</span>
                          </div>
                          {r.summary && <p className="text-xs text-zinc-600 dark:text-zinc-300 mb-1">{r.summary}</p>}
                          {r.reasons.length > 0 && (
                            <ul className="text-xs text-zinc-500 list-disc pl-4 space-y-0.5">
                              {r.reasons.map((x, i) => <li key={i}>{x}</li>)}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions (only for pending) */}
                  {sub.status === "pending" && (
                    <div className="rounded-2xl bg-slate-800 p-4 flex flex-col gap-3 w-full lg:w-[210px] lg:shrink-0">
                      {/* Approve */}
                      <div className="flex flex-col items-center gap-1.5">
                        <button
                          onClick={() => handleApprove(sub.id)}
                          disabled={actionLoading === sub.id}
                          className="w-14 h-14 rounded-full bg-green-500/20 ring-1 ring-green-400/40 hover:bg-green-500/30 hover:ring-green-400/60 flex items-center justify-center text-green-400 transition-all duration-200 hover:scale-105 active:scale-90 shadow-lg disabled:opacity-40"
                        >
                          {actionLoading === sub.id
                            ? <Loader2 size={22} className="animate-spin" />
                            : <CheckCircle2 size={22} />}
                        </button>
                        <span className="text-[11px] font-medium tracking-wide text-slate-300">
                          Approve · {formatCurrency(project?.reward || 0)}
                        </span>
                      </div>

                      {/* Rejection note */}
                      <textarea
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-red-400/50"
                        rows={2}
                        placeholder="Rejection reason (optional)"
                        value={rejectNotes[sub.id] || ""}
                        onChange={(e) => setRejectNotes({ ...rejectNotes, [sub.id]: e.target.value })}
                      />

                      {/* Reject */}
                      <div className="flex flex-col items-center gap-1.5">
                        <button
                          onClick={() => handleReject(sub.id)}
                          disabled={actionLoading === sub.id}
                          className="w-14 h-14 rounded-full bg-red-500/20 ring-1 ring-red-400/40 hover:bg-red-500/30 hover:ring-red-400/60 flex items-center justify-center text-red-400 transition-all duration-200 hover:scale-105 active:scale-90 shadow-lg disabled:opacity-40"
                        >
                          <XCircle size={22} />
                        </button>
                        <span className="text-[11px] font-medium tracking-wide text-slate-400">Reject</span>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Admin → contributor message modal */}
      {msgTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !msgSending && setMsgTarget(null)}>
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><MessageSquare size={18} /> Message {msgTarget.name}</h3>
              <button onClick={() => !msgSending && setMsgTarget(null)} className="text-zinc-400 hover:text-zinc-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-zinc-500 mb-2">This goes to the contributor&rsquo;s inbox, their email, and a push notification.</p>
            {msgError && <div className="bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm mb-2">{msgError}</div>}
            <textarea
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value)}
              rows={4}
              maxLength={4000}
              autoFocus
              placeholder="Type your message… e.g. Please re-record in better lighting and avoid moving your head so fast."
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setMsgTarget(null)} disabled={msgSending} className="px-3 py-2 text-sm rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50">Cancel</button>
              <button onClick={sendAdminMessage} disabled={msgSending || !msgBody.trim()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1.5 disabled:opacity-50">
                {msgSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {msgSending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
