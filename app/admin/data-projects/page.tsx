"use client";

import { useEffect, useState, useRef } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Mic, Video, ScanFace, Loader2, Trash2, PauseCircle, PlayCircle, CheckCircle, ChevronRight, Upload, Pencil } from "lucide-react";
import Link from "next/link";
import { uploadFile } from "@/lib/upload-file";

const PROJECT_TYPES = [
  { value: "voice", label: "Voice / Audio", icon: Mic, color: "text-blue-600 bg-blue-50" },
  { value: "video", label: "Video", icon: Video, color: "text-purple-600 bg-purple-50" },
  { value: "face", label: "Face Recognition", icon: ScanFace, color: "text-orange-600 bg-orange-50" },
];

const FORMAT_OPTIONS: Record<string, string[]> = {
  voice: ["mp3", "wav", "m4a", "ogg"],
  video: ["mp4", "mov", "webm"],
  face: ["mp4", "mov", "jpg", "png"],
};

interface DataProject {
  id: string;
  title: string;
  description: string;
  instructions: string;
  projectType: string;
  reward: number;
  maxSubmissions: number;
  maxSubmissionsPerUser: number;
  currentSubmissions: number;
  status: string;
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
}

const emptyForm = {
  title: "",
  description: "",
  projectType: "voice",
  instructions: "",
  samplePrompts: "",
  reward: "",
  maxSubmissions: "",
  maxSubmissionsPerUser: "1",
  languages: "",
  minDurationSecs: "3",
  maxDurationSecs: "60",
  maxFileSizeMB: "15",
  expiresAt: "",
  // Audio format (voice projects)
  recordingType: "conversation",
  audioSampleRate: "16000",
  audioChannels: "1",
  audioBitDepth: "16",
  // Gender quotas (optional)
  malesNeeded: "",
  femalesNeeded: "",
};

export default function AdminDataProjectsPage() {
  const [projects, setProjects] = useState<DataProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [sampleVideoFile, setSampleVideoFile] = useState<File | null>(null);
  const sampleVideoRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  const openEdit = (p: DataProject) => {
    setForm({
      title: p.title,
      description: p.description,
      projectType: p.projectType,
      instructions: p.instructions || "",
      samplePrompts: p.samplePrompts?.join("\n") || "",
      reward: String(p.reward),
      maxSubmissions: String(p.maxSubmissions),
      maxSubmissionsPerUser: String(p.maxSubmissionsPerUser ?? 1),
      languages: p.languages?.join(", ") || "",
      minDurationSecs: String(p.minDurationSecs ?? 3),
      maxDurationSecs: String(p.maxDurationSecs ?? 60),
      maxFileSizeMB: String(p.maxFileSizeMB ?? 15),
      expiresAt: p.expiresAt ? p.expiresAt.slice(0, 10) : "",
      recordingType: p.recordingType || "conversation",
      audioSampleRate: String(p.audioSampleRate ?? 16000),
      audioChannels: String(p.audioChannels ?? 1),
      audioBitDepth: String(p.audioBitDepth ?? 16),
      malesNeeded: p.malesNeeded != null ? String(p.malesNeeded) : "",
      femalesNeeded: p.femalesNeeded != null ? String(p.femalesNeeded) : "",
    });
    setEditingId(p.id);
    setShowForm(true);
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setSampleVideoFile(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    const formats = FORMAT_OPTIONS[form.projectType] || [];
    const langArray = form.languages
      ? form.languages.split(",").map((l) => l.trim()).filter(Boolean)
      : [];
    const promptsArray = form.samplePrompts
      ? form.samplePrompts.split("\n").map((p) => p.trim()).filter(Boolean)
      : [];

    try {
      if (editingId) {
        // ── Edit existing project ──
        const res = await fetch(`/api/admin/data-projects/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            languages: langArray,
            samplePrompts: promptsArray,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || "Failed to update project");
        } else {
          setMessage("Project updated successfully!");
          closeForm();
          fetchProjects();
        }
      } else {
        // ── Create new project ──
        let sampleVideoUrl: string | null = null;
        if (sampleVideoFile && form.projectType === "video") {
          const uploaded = await uploadFile(sampleVideoFile, "sample-videos", sampleVideoFile.name);
          sampleVideoUrl = uploaded.url;
        }

        const res = await fetch("/api/admin/data-projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            acceptedFormats: formats,
            languages: langArray,
            samplePrompts: promptsArray,
            sampleVideoUrl,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || "Failed to create project");
        } else {
          setMessage("Project created successfully!");
          closeForm();
          fetchProjects();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this project and all its submissions?")) return;
    try {
      await fetch(`/api/admin/data-projects/${id}`, { method: "DELETE" });
      fetchProjects();
    } catch {
      setError("Failed to delete project");
    }
  };

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
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[status] || "bg-zinc-100 text-zinc-600"}`}>{status}</span>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dataset Collection</h1>
            <p className="text-sm text-zinc-500 mt-1">Create and manage AI data collection projects</p>
          </div>
          <Button onClick={() => { closeForm(); setShowForm(!showForm); }} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus size={16} className="mr-2" />
            New Project
          </Button>
        </div>

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">{message}</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* Create Form */}
        {showForm && (
          <Card className="p-6 border-blue-200 bg-blue-50/30">
            <h2 className="text-lg font-semibold mb-4">{editingId ? "Edit Project" : "Create New Data Collection Project"}</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Project Title *</label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Twi Voice Dataset Collection" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Project Type *</label>
                  <select
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.projectType}
                    onChange={(e) => setForm({ ...form, projectType: e.target.value })}
                  >
                    {PROJECT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description *</label>
                <textarea
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What data are you collecting and what will it be used for?"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Recording Instructions *</label>
                <textarea
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  placeholder="Step-by-step guide: e.g. 1. Find a quiet room. 2. Open your phone voice recorder. 3. Read the phrase clearly..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Sample Prompts (one per line)</label>
                <textarea
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  value={form.samplePrompts}
                  onChange={(e) => setForm({ ...form, samplePrompts: e.target.value })}
                  placeholder="Me din de Kwame&#10;Wo ho te sɛn?&#10;Medaase paa"
                />
                <p className="text-xs text-zinc-400 mt-1">Phrases or sentences the user should say or read aloud</p>
              </div>

              {/* Sample video — video projects only */}
              {form.projectType === "video" && (
                <div>
                  <label className="block text-sm font-medium mb-1">Sample Video (optional)</label>
                  <div
                    onClick={() => sampleVideoRef.current?.click()}
                    className="border-2 border-dashed border-zinc-200 rounded-xl p-5 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/20 transition-colors"
                  >
                    {sampleVideoFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <Video size={20} className="text-purple-500" />
                        <div className="text-left">
                          <p className="text-sm font-medium text-foreground">{sampleVideoFile.name}</p>
                          <p className="text-xs text-zinc-400">{(sampleVideoFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSampleVideoFile(null); }} className="ml-2 text-xs text-red-500 hover:underline">Remove</button>
                      </div>
                    ) : (
                      <div className="text-zinc-400">
                        <Upload size={24} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-medium">Click to upload a sample video</p>
                        <p className="text-xs mt-1">mp4, mov, webm · Max 50MB · Users will watch this before submitting</p>
                      </div>
                    )}
                  </div>
                  <input ref={sampleVideoRef} type="file" accept="video/*,.mp4,.mov,.webm" onChange={(e) => setSampleVideoFile(e.target.files?.[0] || null)} className="hidden" />
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Reward (GH₵) *</label>
                  <Input type="number" step="0.5" min="0.5" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} placeholder="2.00" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Max Submissions *</label>
                  <Input type="number" min="1" value={form.maxSubmissions} onChange={(e) => setForm({ ...form, maxSubmissions: e.target.value })} placeholder="500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Submits Per User</label>
                  <Input type="number" min="1" max="100" value={form.maxSubmissionsPerUser} onChange={(e) => setForm({ ...form, maxSubmissionsPerUser: e.target.value })} placeholder="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Min Duration (s)</label>
                  <Input type="number" min="1" value={form.minDurationSecs} onChange={(e) => setForm({ ...form, minDurationSecs: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Max Duration (s)</label>
                  <Input type="number" min="5" value={form.maxDurationSecs} onChange={(e) => setForm({ ...form, maxDurationSecs: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Max File Size (MB)</label>
                  <Input type="number" min="1" max="300" value={form.maxFileSizeMB} onChange={(e) => setForm({ ...form, maxFileSizeMB: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Languages (comma-separated)</label>
                  <Input value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="English, Twi, Ga, Hausa" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Expiry Date (optional)</label>
                  <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                </div>
              </div>

              {/* Gender Quota */}
              <div className="border border-pink-200 rounded-lg p-4 bg-pink-50/30 space-y-2">
                <h3 className="text-sm font-semibold text-pink-800">Gender Quota (optional)</h3>
                <p className="text-xs text-pink-600">Leave blank if gender doesn&apos;t matter. When set, users must select their gender and slots will show separately.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-zinc-600">Males Needed</label>
                    <Input type="number" min="0" value={form.malesNeeded} onChange={(e) => setForm({ ...form, malesNeeded: e.target.value })} placeholder="e.g. 20" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-zinc-600">Females Needed</label>
                    <Input type="number" min="0" value={form.femalesNeeded} onChange={(e) => setForm({ ...form, femalesNeeded: e.target.value })} placeholder="e.g. 20" />
                  </div>
                </div>
              </div>

              {/* Audio Format Config — voice projects only */}
              {form.projectType === "voice" && (
                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/40 space-y-3">
                  <h3 className="text-sm font-semibold text-blue-800">Audio Format Specifications</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1 text-zinc-600">Recording Type</label>
                      <select
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.recordingType}
                        onChange={(e) => setForm({ ...form, recordingType: e.target.value })}
                      >
                        <option value="conversation">Conversation (2 people)</option>
                        <option value="single">Single Person</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1 text-zinc-600">Sample Rate</label>
                      <select
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.audioSampleRate}
                        onChange={(e) => setForm({ ...form, audioSampleRate: e.target.value })}
                      >
                        <option value="16000">16 kHz</option>
                        <option value="44100">44.1 kHz</option>
                        <option value="48000">48 kHz</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1 text-zinc-600">Channels</label>
                      <select
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.audioChannels}
                        onChange={(e) => setForm({ ...form, audioChannels: e.target.value })}
                      >
                        <option value="1">Mono (1ch)</option>
                        <option value="2">Stereo (2ch)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1 text-zinc-600">Bit Depth</label>
                      <select
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.audioBitDepth}
                        onChange={(e) => setForm({ ...form, audioBitDepth: e.target.value })}
                      >
                        <option value="16">16-bit PCM</option>
                        <option value="32">32-bit Float</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-blue-700">Live call recordings will be captured as WAV at these exact specs. Upload submissions should match.</p>
                </div>
              )}

              <div className="bg-zinc-50 rounded-lg p-3 text-sm text-zinc-600">
                <strong>Accepted formats for {form.projectType}:</strong> {form.projectType === "voice" ? "wav" : FORMAT_OPTIONS[form.projectType]?.join(", ")}
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {submitting ? <><Loader2 size={16} className="mr-2 animate-spin" />{editingId ? "Saving..." : "Creating..."}</> : editingId ? "Save Changes" : "Create Project"}
                </Button>
                <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
              </div>
            </form>
          </Card>
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
            {projects.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {getTypeIcon(p.projectType)}
                      {getStatusBadge(p.status)}
                      <span className="text-xs text-zinc-400">{formatDate(p.createdAt)}</span>
                    </div>
                    <h3 className="font-semibold text-foreground truncate">{p.title}</h3>
                    <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{p.description}</p>

                    {/* Stats row */}
                    <div className="flex flex-wrap gap-4 mt-3 text-sm">
                      <span className="text-zinc-500">Reward: <strong className="text-green-600">{formatCurrency(p.reward)}</strong></span>
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

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => openEdit(p)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit project">
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
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
