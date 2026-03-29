"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Loader2, CheckCircle2, XCircle, ArrowLeft, Mic, Video, ScanFace, Download } from "lucide-react";
import Link from "next/link";

interface Submission {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSizeMB: number;
  language: string | null;
  promptUsed: string | null;
  status: string;
  rewarded: boolean;
  notes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  user: { userId: string; fullName: string; email: string; phone: string };
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
                <div className="flex items-center gap-2 mb-1">
                  {getTypeIcon(project.projectType)}
                  <h1 className="text-xl font-bold text-foreground">{project.title}</h1>
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
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{sub.user.fullName}</p>
                        <p className="text-xs text-zinc-400">{sub.user.userId} · {sub.user.phone}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        sub.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        sub.status === "approved" ? "bg-green-100 text-green-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {sub.status}
                      </span>
                    </div>

                    {/* File details */}
                    <div className="text-sm text-zinc-500 space-y-1">
                      <p><span className="font-medium">File:</span> {sub.fileName} · {sub.fileSizeMB.toFixed(1)}MB · {sub.fileType}</p>
                      {sub.language && <p><span className="font-medium">Language:</span> {sub.language}</p>}
                      {sub.promptUsed && <p><span className="font-medium">Prompt recorded:</span> &ldquo;{sub.promptUsed}&rdquo;</p>}
                      <p><span className="font-medium">Submitted:</span> {formatDate(sub.submittedAt)}</p>
                      {sub.reviewedAt && <p><span className="font-medium">Reviewed:</span> {formatDate(sub.reviewedAt)}</p>}
                      {sub.notes && (
                        <p className="text-red-600"><span className="font-medium">Notes:</span> {sub.notes}</p>
                      )}
                    </div>

                    {/* Media preview */}
                    <div className="mt-2">
                      {isAudio(sub.fileType) ? (
                        <audio controls src={sub.fileUrl} className="w-full max-w-sm h-10" />
                      ) : isVideo(sub.fileType) ? (
                        <video controls src={sub.fileUrl} className="rounded-lg max-w-xs max-h-40 bg-black" />
                      ) : (
                        <img src={sub.fileUrl} alt="submission" className="rounded-lg max-w-xs max-h-40 object-cover" />
                      )}
                      <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                        <Download size={12} />Download file
                      </a>
                    </div>
                  </div>

                  {/* Actions (only for pending) */}
                  {sub.status === "pending" && (
                    <div className="rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 p-4 flex flex-col gap-3 min-w-[210px]">
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
    </AdminLayout>
  );
}
