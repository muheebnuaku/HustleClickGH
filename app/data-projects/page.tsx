"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader, Notice, Panel, EmptyState } from "@/components/ui/page-kit";
import { Database } from "lucide-react";
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

// Static class strings (Tailwind can't see classes built at runtime).
const TYPE_META: Record<string, { icon: React.ElementType; label: string; chip: string }> = {
  voice: { icon: Mic, label: "Voice", chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
  video: { icon: Video, label: "Video", chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
  face: { icon: ScanFace, label: "Face", chip: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" },
};

const SUBMISSION_STATUS_BADGE: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  pending: { label: "Under review", icon: Clock, cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  approved: { label: "Approved & paid", icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  rejected: { label: "Rejected", icon: XCircle, cls: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
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
        <PageHeader icon={Database} title="Data Projects" description="Record voice or video for AI training and earn Ghana Cedis." />

        <Notice tone="info">
          <strong>How it works:</strong> open a project → read the instructions → record (some projects record right here in the app, others ask you to upload a file) → submit. You&apos;re paid once your recording is approved.
        </Notice>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {eligibleProjects.length === 0 ? (
          <EmptyState icon={Mic} title="No open projects right now" description="Check back soon — new projects are added regularly." />
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
                <Panel key={p.id} className="flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.chip}`}>
                      <Icon size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground break-words">{p.title}</h3>
                      <p className="mt-0.5 text-sm text-zinc-500 line-clamp-2">{p.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold text-emerald-600 tabular-nums">{formatCurrency(p.reward)}</p>
                      <p className="text-[11px] text-zinc-400">per approval</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.chip}`}>{meta.label}</span>
                    {p.captureMode && p.captureMode !== "upload" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><Camera size={11} />Record in app</span>
                    )}
                    {p.locationLabel && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><MapPin size={11} />{p.locationLabel}</span>
                    )}
                    {p.languages.map((l) => (
                      <span key={l} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{l}</span>
                    ))}
                    {badge && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}><badge.icon size={11} />{badge.label}</span>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>{p.slotsRemaining > 0 ? `${p.slotsRemaining} slots left` : "No slots left"}</span>
                      <span className="tabular-nums">{p.currentSubmissions}/{p.maxSubmissions}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>

                  <div className="mt-auto">
                    {subStatus ? (
                      <Link href={`/data-projects/${p.id}`} className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                        View my submission <ChevronRight size={15} />
                      </Link>
                    ) : isFull ? (
                      <div className="mt-5 w-full rounded-xl bg-zinc-100 px-4 py-2.5 text-center text-sm font-medium text-zinc-400 dark:bg-zinc-800">Project full</div>
                    ) : (
                      <Link href={`/data-projects/${p.id}`} className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                        {p.captureMode && p.captureMode !== "upload" ? "Start recording" : "Submit recording"} <ChevronRight size={15} />
                      </Link>
                    )}
                  </div>
                </Panel>
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
