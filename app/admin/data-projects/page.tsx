"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { PageHeader, StatCard, Notice } from "@/components/admin/admin-ui";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatUsd, formatDate } from "@/lib/utils";
import { convertUsdToGhs, fallbackRate } from "@/lib/fx";
import { Database, Plus, Mic, Video, ScanFace, Loader2, Trash2, PauseCircle, PlayCircle, CheckCircle, ChevronRight, Upload, Pencil, Building2, Check, X, MapPin, Search, Camera, Tag } from "lucide-react";
import Link from "next/link";
import type { CaptureConfig, CaptureMode, MetadataField } from "@/lib/project-config";
import { ProjectWizard } from "@/components/admin/project-wizard";

const PROJECT_TYPES = [
  { value: "voice", label: "Voice / Audio", icon: Mic, color: "text-blue-600 bg-blue-50" },
  { value: "video", label: "Video", icon: Video, color: "text-purple-600 bg-purple-50" },
  { value: "face", label: "Face Recognition", icon: ScanFace, color: "text-orange-600 bg-orange-50" },
];

interface DataProject {
  id: string;
  title: string;
  description: string;
  instructions: string;
  projectType: string;
  reward: number;
  maxSubmissions: number;
  maxSubmissionsPerUser: number;
  maxFilesPerSubmission: number;
  currentSubmissions: number;
  status: string;
  orgId?: string | null;
  orgName?: string | null;
  orgPrice?: number | null;
  budget?: number;
  spent?: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalSubmissions: number;
  createdAt: string;
  samplePrompts: string[];
  languages: string[];
  minDurationSecs: number;
  maxDurationSecs: number;
  maxFileSizeMB: number;
  expiresAt: string | null;
  malesNeeded: number | null;
  femalesNeeded: number | null;
  audioSampleRate: number | null;
  audioChannels: number | null;
  audioBitDepth: number | null;
  recordingType: string | null;
  captureMode: CaptureMode;
  captureConfig: CaptureConfig | null;
  metadataFields: MetadataField[];
  targetCountries: string[];
  targetRegions: string[];
  targetCities: string[];
  requireGeo: boolean;
  clientName: string | null;
  reviewOrgId?: string | null;
  reviewOrgName?: string | null;
  referenceCode: string | null;
}


export default function AdminDataProjectsPage() {
  const [projects, setProjects] = useState<DataProject[]>([]);
  const [loading, setLoading] = useState(true);
  // Create/edit wizard: null = closed; project null = new project.
  const [wizard, setWizard] = useState<{ project: DataProject | null } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // List search / filters
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  // Org-project approval: which project's approve panel is open + the contributor reward being set
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveReward, setApproveReward] = useState("");
  // Live USD→GHS rate for showing the Cedi payout value of buyer USD prices.
  const [fxRate, setFxRate] = useState(fallbackRate());
  const toGhs = (usd: number) => convertUsdToGhs(usd, fxRate);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/data-projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      setError("Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => {
    fetch("/api/fx/rate").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.rate > 0) setFxRate(d.rate); }).catch(() => {});
  }, []);

  const openEdit = (p: DataProject) => {
    setError("");
    setMessage("");
    setWizard({ project: p });
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`/api/admin/data-projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchProjects();
    } catch {
      setError("Failed to update status");
    }
  };

  const handleOrgApprove = async (id: string, action: "approve" | "reject", contributorReward?: number) => {
    if (action === "reject" && !confirm("Reject this organization project?")) return;
    try {
      const res = await fetch(`/api/admin/data-projects/${id}/org-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, contributorReward }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.message || "Action failed"); return; }
      setError("");
      setApprovingId(null);
      fetchProjects();
    } catch {
      setError("Failed to update project");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this project and all its submissions?")) return;
    try {
      await fetch(`/api/admin/data-projects/${id}`, { method: "DELETE" });
      fetchProjects();
    } catch {
      setError("Failed to delete project");
    }
  };

  const q = query.trim().toLowerCase();
  const visibleProjects = projects.filter((p) =>
    (statusFilter === "all" || p.status === statusFilter) &&
    (typeFilter === "all" || p.projectType === typeFilter) &&
    (!q || [p.title, p.clientName, p.referenceCode, p.orgName, ...(p.targetCountries ?? []), ...(p.targetRegions ?? []), ...(p.targetCities ?? [])]
      .some((v) => v?.toLowerCase().includes(q))),
  );

  const getTypeIcon = (type: string) => {
    const t = PROJECT_TYPES.find((p) => p.value === type);
    if (!t) return null;
    const Icon = t.icon;
    return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${t.color}`}><Icon size={12} />{t.label}</span>;
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-green-100 text-green-700",
      paused: "bg-yellow-100 text-yellow-700",
      completed: "bg-zinc-100 text-zinc-600",
      pending_review: "bg-amber-100 text-amber-700",
      rejected: "bg-red-100 text-red-700",
    };
    const label = status === "pending_review" ? "pending review" : status;
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[status] || "bg-zinc-100 text-zinc-600"}`}>{label}</span>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          icon={Database}
          title="Data Projects"
          description="Create, target and review AI data collection projects."
          actions={
            <Button onClick={() => { setError(""); setMessage(""); setWizard({ project: null }); }} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus size={16} />
              New project
            </Button>
          }
        />

        {message && (
          <Notice tone="success">{message}</Notice>
        )}
        {error && (
          <Notice tone="error">{error}</Notice>
        )}

        {wizard && (
          <ProjectWizard
            project={wizard.project}
            onClose={() => setWizard(null)}
            onSaved={(msg) => { setWizard(null); setMessage(msg); fetchProjects(); }}
          />
        )}

        {/* Overview */}        {/* Overview */}
        {!loading && projects.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Database} tone="blue" label="Projects" value={projects.length} hint={`${projects.filter((p) => p.status === "active").length} active`} />
            <StatCard icon={Upload} tone="amber" label="Awaiting review" value={projects.reduce((n, p) => n + (p.pendingCount || 0), 0)} hint="pending submissions" />
            <StatCard icon={CheckCircle} tone="green" label="Approved" value={projects.reduce((n, p) => n + (p.approvedCount || 0), 0)} hint="submissions" />
            <StatCard icon={Camera} tone="purple" label="In-app capture" value={projects.filter((p) => p.captureMode && p.captureMode !== "upload").length} hint="projects" />
          </div>
        )}

        {/* Search + filters */}
        {!loading && projects.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, client, reference, location…"
                className="w-full border border-zinc-200 dark:border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-950">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="pending_review">Pending review</option>
              <option value="completed">Completed</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-950">
              <option value="all">All types</option>
              {PROJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        )}

        {/* Projects List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-400">
            <Loader2 size={24} className="animate-spin mr-2" />Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <Card className="p-12 text-center text-zinc-400">
            <ScanFace size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No data collection projects yet</p>
            <p className="text-sm mt-1">Click &quot;New Project&quot; to create your first one</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {visibleProjects.length === 0 && (
              <Card className="p-8 text-center text-sm text-zinc-400">No projects match these filters.</Card>
            )}
            {visibleProjects.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {getTypeIcon(p.projectType)}
                      {getStatusBadge(p.status)}
                      {p.orgName && <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 inline-flex items-center gap-1"><Building2 size={11} />{p.orgName}</span>}
                      {p.captureMode && p.captureMode !== "upload" && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 inline-flex items-center gap-1">
                          <Camera size={11} />{p.captureMode === "nose_dots" ? `Nose dots · ${p.captureConfig?.dots.length ?? 0}` : "In-app camera"}
                        </span>
                      )}
                      {[...(p.targetCities ?? []), ...(p.targetRegions ?? []), ...(p.targetCountries ?? [])].length > 0 && (
                        <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 inline-flex items-center gap-1 max-w-[16rem] truncate">
                          <MapPin size={11} />{[...(p.targetCities ?? []), ...(p.targetRegions ?? []), ...(p.targetCountries ?? [])].join(", ")}
                        </span>
                      )}
                      {(p.clientName || p.referenceCode) && (
                        <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 inline-flex items-center gap-1">
                          <Tag size={11} />{[p.clientName, p.referenceCode].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      {p.reviewOrgName && (
                        <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 inline-flex items-center gap-1">
                          <Check size={11} />Client review: {p.reviewOrgName}
                        </span>
                      )}
                      <span className="text-xs text-zinc-400">{formatDate(p.createdAt)}</span>
                    </div>
                    <h3 className="font-semibold text-foreground truncate">{p.title}</h3>
                    <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{p.description}</p>

                    {/* Stats row */}
                    <div className="flex flex-wrap gap-4 mt-3 text-sm">
                      {p.orgName ? (
                        <>
                          <span className="text-zinc-500">Buyer price: <strong className="text-emerald-600">{formatUsd(p.orgPrice ?? p.reward)}</strong>/item (≈{formatCurrency(toGhs(p.orgPrice ?? p.reward))})</span>
                          {p.status !== "pending_review" && (
                            <span className="text-zinc-500">Contributor: <strong className="text-green-600">{formatCurrency(p.reward)}</strong> · margin <strong className="text-emerald-600">{formatCurrency(toGhs(p.orgPrice ?? p.reward) - p.reward)}</strong></span>
                          )}
                          {(p.budget ?? 0) > 0 && <span className="text-zinc-500">Budget: {formatUsd(p.spent ?? 0)}/{formatUsd(p.budget ?? 0)}</span>}
                        </>
                      ) : (
                        <span className="text-zinc-500">Reward: <strong className="text-green-600">{formatCurrency(p.reward)}</strong></span>
                      )}
                      <span className="text-zinc-500">Slots: <strong>{p.currentSubmissions}/{p.maxSubmissions}</strong></span>
                      <span className="text-yellow-600 font-medium">{p.pendingCount} pending</span>
                      <span className="text-green-600 font-medium">{p.approvedCount} approved</span>
                      {p.rejectedCount > 0 && <span className="text-red-500 font-medium">{p.rejectedCount} rejected</span>}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3 bg-zinc-100 rounded-full h-1.5 w-full max-w-xs">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (p.currentSubmissions / p.maxSubmissions) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                    {p.status === "pending_review" && p.orgName && (
                      <>
                        <Button size="sm" onClick={() => { setApprovingId(p.id); setApproveReward(String(toGhs(p.orgPrice ?? p.reward))); }} className="bg-green-600 hover:bg-green-700 text-white" title="Set the contributor reward and approve">
                          <Check size={15} className="mr-1" />Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleOrgApprove(p.id, "reject")} className="text-red-600 border-red-300" title="Reject">
                          <X size={15} className="mr-1" />Reject
                        </Button>
                      </>
                    )}
                    <button onClick={() => openEdit(p)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title={p.orgName ? "Edit — you can change the price before approving" : "Edit project"}>
                      <Pencil size={18} />
                    </button>
                    <Link href={`/admin/data-projects/${p.id}`}>
                      <Button variant="outline" size="sm">
                        Review <ChevronRight size={14} className="ml-1" />
                      </Button>
                    </Link>
                    {p.status === "active" && (
                      <button onClick={() => handleStatusChange(p.id, "paused")} className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-lg" title="Pause">
                        <PauseCircle size={18} />
                      </button>
                    )}
                    {p.status === "paused" && (
                      <button onClick={() => handleStatusChange(p.id, "active")} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Activate">
                        <PlayCircle size={18} />
                      </button>
                    )}
                    {p.status !== "completed" && (
                      <button onClick={() => handleStatusChange(p.id, "completed")} className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-lg" title="Mark Completed">
                        <CheckCircle size={18} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(p.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Approve panel: set the contributor reward (≤ buyer price); platform keeps the spread. */}
                {approvingId === p.id && (
                  <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <p className="text-sm font-medium text-foreground mb-1">Set the contributor reward (paid in Cedis)</p>
                    <p className="text-xs text-zinc-500 mb-3">
                      Buyer pays <strong className="text-emerald-600">{formatUsd(p.orgPrice ?? p.reward)}</strong> per item
                      = <strong className="text-foreground">{formatCurrency(toGhs(p.orgPrice ?? p.reward))}</strong>.
                      Pay the contributor part of that; the rest is the platform&rsquo;s margin.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">GH₵</span>
                        <Input type="number" step="0.5" min="0.5" value={approveReward} onChange={(e) => setApproveReward(e.target.value)} className="pl-11 w-40" />
                      </div>
                      {(() => {
                        const r = Number(approveReward); const buyerGhs = toGhs(p.orgPrice ?? p.reward); const margin = buyerGhs - r;
                        return <span className="text-sm text-zinc-500">Platform margin: <strong className={margin >= 0 ? "text-emerald-600" : "text-red-600"}>{formatCurrency(Math.max(0, margin))}</strong>/item</span>;
                      })()}
                      <Button size="sm" onClick={() => handleOrgApprove(p.id, "approve", Number(approveReward))} disabled={!(Number(approveReward) > 0) || Number(approveReward) > toGhs(p.orgPrice ?? p.reward)} className="bg-green-600 hover:bg-green-700 text-white">Confirm & go live</Button>
                      <Button size="sm" variant="outline" onClick={() => setApprovingId(null)}>Cancel</Button>
                    </div>
                    {Number(approveReward) > toGhs(p.orgPrice ?? p.reward) && <p className="text-xs text-red-600 mt-1">Reward can&rsquo;t exceed the buyer&rsquo;s payment in Cedis ({formatCurrency(toGhs(p.orgPrice ?? p.reward))}).</p>}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
