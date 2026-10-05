"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Mic, Video, ScanFace, Loader2, ChevronRight, CheckCircle2, Clock, XCircle, MapPin, Camera } from "lucide-react";
import Link from "next/link";

interface DataProject {
  id: string;
  title: string;
  description: string;
  projectType: string;
  reward: number;
  maxSubmissions: number;
  currentSubmissions: number;
  slotsRemaining: number;
  languages: string[];
  acceptedFormats: string[];
  status: string;
  userSubmissionStatus: string | null;
  captureMode?: string;
  locationLabel?: string | null;
  eligible?: boolean;
  ineligibleReason?: string | null;
  needsLocation?: boolean;
}

const TYPE_META: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  voice: { icon: Mic, label: "Voice Recording", color: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
  video: { icon: Video, label: "Video Recording", color: "text-purple-600", bg: "bg-purple-50 border-purple-100" },
  face: { icon: ScanFace, label: "Face Recognition", color: "text-orange-600", bg: "bg-orange-50 border-orange-100" },
};

const SUBMISSION_STATUS_BADGE: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  pending: { label: "Under Review", icon: Clock, cls: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Approved & Paid", icon: CheckCircle2, cls: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", icon: XCircle, cls: "bg-red-100 text-red-700" },
};

export default function DataProjectsPage() {
  const [projects, setProjects] = useState<DataProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showOther, setShowOther] = useState(false);

  useEffect(() => {
    fetch("/api/data-projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => setError("Failed to load projects"))
      .finally(() => setLoading(false));
  }, []);

  // Projects already submitted to stay visible even if targeting changed later.
  const eligibleProjects = projects.filter((p) => p.eligible !== false || p.userSubmissionStatus);
  const otherProjects = projects.filter((p) => p.eligible === false && !p.userSubmissionStatus);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20 text-zinc-400">
          <Loader2 size={24} className="animate-spin mr-2" />Loading projects...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Data Projects</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Record and submit voice or video clips to earn Ghana Cedis. All recordings are used for AI training.
          </p>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <strong>How it works:</strong> Browse a project → read the instructions → record (some projects record right here in the app; others ask you to upload a file from your phone) → submit and wait for review. You get paid once your recording is approved.
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {eligibleProjects.length === 0 ? (
          <Card className="p-12 text-center text-zinc-400">
            <Mic size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No open projects right now</p>
            <p className="text-sm mt-1">Check back soon — new projects are added regularly</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {eligibleProjects.map((p) => {
              const meta = TYPE_META[p.projectType] || TYPE_META.voice;
              const Icon = meta.icon;
              const subStatus = p.userSubmissionStatus;
              const badge = subStatus ? SUBMISSION_STATUS_BADGE[subStatus] : null;
              const isFull = p.slotsRemaining <= 0;
              const progressPct = Math.min(100, (p.currentSubmissions / p.maxSubmissions) * 100);

              return (
                <Card key={p.id} className={`border ${meta.bg} overflow-hidden`}>
                  <div className="p-5">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.color} bg-white/60 border border-white`}>
                        <Icon size={20} />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-white/70 ${meta.color}`}>
                          {meta.label}
                        </span>
                        {badge && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${badge.cls}`}>
                            <badge.icon size={10} />{badge.label}
                          </span>
                        )}
                        {isFull && !subStatus && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">Full</span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-bold text-foreground text-base mb-1">{p.title}</h3>
                    <p className="text-sm text-zinc-600 line-clamp-2 mb-3">{p.description}</p>

                    {/* Details */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 mb-3">
                      <span>Reward: <strong className="text-green-600 text-sm">{formatCurrency(p.reward)}</strong></span>
                      <span>{p.slotsRemaining > 0 ? `${p.slotsRemaining} slots left` : "No slots left"}</span>
                      {p.acceptedFormats.length > 0 && (
                        <span>Formats: {p.acceptedFormats.join(", ")}</span>
                      )}
                    </div>

                    {(p.locationLabel || (p.captureMode && p.captureMode !== "upload")) && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {p.locationLabel && (
                          <span className="px-2 py-0.5 bg-white/70 rounded-full text-xs text-emerald-700 border border-white inline-flex items-center gap-1"><MapPin size={10} />{p.locationLabel}</span>
                        )}
                        {p.captureMode && p.captureMode !== "upload" && (
                          <span className="px-2 py-0.5 bg-white/70 rounded-full text-xs text-blue-700 border border-white inline-flex items-center gap-1"><Camera size={10} />Record in app</span>
                        )}
                      </div>
                    )}

                    {/* Languages */}
                    {p.languages.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {p.languages.map((l) => (
                          <span key={l} className="px-2 py-0.5 bg-white/70 rounded-full text-xs text-zinc-600 border border-white">
                            {l}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Progress */}
                    <div className="mb-4">
                      <div className="bg-white/60 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">{p.currentSubmissions} of {p.maxSubmissions} submissions filled</p>
                    </div>

                    {/* CTA */}
                    {subStatus ? (
                      <Link href={`/data-projects/${p.id}`} className="block w-full text-center px-4 py-2 rounded-lg bg-white/70 border text-sm font-medium text-zinc-600 hover:bg-white transition-colors">
                        View My Submission
                      </Link>
                    ) : isFull ? (
                      <div className="w-full text-center px-4 py-2 rounded-lg bg-zinc-100 text-sm font-medium text-zinc-400 cursor-not-allowed">
                        Project Full
                      </div>
                    ) : (
                      <Link href={`/data-projects/${p.id}`} className={`flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${meta.color.replace("text-", "bg-")} hover:opacity-90`}>
                        {p.captureMode && p.captureMode !== "upload" ? "Start Recording" : "Submit Recording"} <ChevronRight size={16} />
                      </Link>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Projects for other locations — listed so contributors know why they can't join */}
        {otherProjects.length > 0 && (
          <div>
            <button onClick={() => setShowOther((v) => !v)} className="text-sm font-medium text-zinc-500 hover:text-foreground">
              {showOther ? "Hide" : "Show"} {otherProjects.length} project{otherProjects.length === 1 ? "" : "s"} not available in your area
            </button>
            {showOther && (
              <div className="mt-3 space-y-2">
                {otherProjects.map((p) => (
                  <Card key={p.id} className="p-4 flex items-start gap-3 opacity-80">
                    <MapPin size={18} className="text-zinc-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{p.title}</p>
                      <p className="text-xs text-zinc-500">{p.ineligibleReason}</p>
                      {p.needsLocation && <Link href="/profile" className="text-xs text-blue-600 hover:underline">Add my location →</Link>}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
