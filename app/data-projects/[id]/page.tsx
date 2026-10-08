"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import {
  Loader2, Mic, Video, ScanFace, ArrowLeft, Upload, Download,
  CheckCircle2, Clock, XCircle, AlertCircle, FileAudio, FileVideo, File, MapPin, ImagePlus
} from "lucide-react";
import Link from "next/link";
import { uploadFile, sha256Hex, toDownloadUrl } from "@/lib/upload-file";
import { getLicense } from "@/lib/licenses";
import { analyzeMedia, specLine, type MediaMeta } from "@/lib/media-quality";
import { extractFramesFromFile } from "@/lib/frame-extract";
import { GuidedCapture } from "@/components/guided-capture";
import type { CaptureResult } from "@/lib/guided-capture-engine";
import {
  validateMetadataAnswers, type CaptureConfig, type CaptureMode, type CaptureTrace, type MetadataField,
} from "@/lib/project-config";
import { PageSkeleton } from "@/components/ui/page-kit";

interface DataProject {
  id: string;
  title: string;
  description: string;
  projectType: string;
  license?: string;
  instructions: string;
  samplePrompts: string[];
  reward: number | null;
  maxSubmissions: number;
  currentSubmissions: number;
  slotsRemaining: number;
  malesNeeded: number | null;
  femalesNeeded: number | null;
  malesApproved: number;
  femalesApproved: number;
  malesSlotsRemaining: number | null;
  femalesSlotsRemaining: number | null;
  languages: string[];
  acceptedFormats: string[];
  minDurationSecs: number;
  maxDurationSecs: number;
  maxFileSizeMB: number;
  maxFilesPerSubmission: number;
  status: string;
  expiresAt: string | null;
  audioSampleRate: number | null;
  audioChannels: number | null;
  audioBitDepth: number | null;
  recordingType: string | null;
  sampleVideoUrl: string | null;
  sampleVideoUrls: string[];
  captureMode: CaptureMode;
  captureConfig: CaptureConfig | null;
  metadataFields: MetadataField[];
  locationLabel: string | null;
  requireGeo: boolean;
  payoutMode?: string;
  currency?: string;
}

type GeoFix = { lat: number; lng: number; accuracy: number };

// Ask the device for a GPS fix (projects that need proof of where it was recorded).
function getGeoFix(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This device can't share its location."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED
        ? "Location access was blocked. Allow location for this site, then submit again."
        : "Couldn't get your location. Move to an open area and try again.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  });
}

interface UserSubmission {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSizeMB: number;
  files?: string | null; // JSON array of {url,name,type,sizeMB}
  language: string | null;
  promptUsed: string | null;
  status: string;
  notes: string | null;
  submittedAt: string;
}

type UploadedFile = { fileUrl: string; fileName: string; fileType: string; fileSizeMB: number; fileHash?: string };
type UploadStatus = "analyzing" | "invalid" | "queued" | "uploading" | "uploaded" | "submitting" | "done" | "error";
interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number; // 0–100
  error?: string;
  uploaded?: UploadedFile; // set once the file is in storage
  meta?: MediaMeta; // measured quality specs
}

// How many files upload at once. They're independent — a cap just avoids
// saturating a phone's connection; queued ones start as slots free up.
const UPLOAD_CONCURRENCY = 3;

const TYPE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  voice: { icon: Mic, color: "text-blue-600", label: "Voice Recording" },
  video: { icon: Video, color: "text-purple-600", label: "Video Recording" },
  face: { icon: ScanFace, color: "text-orange-600", label: "Face Recognition" },
};

export default function DataProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<DataProject | null>(null);
  const [userSubmissions, setUserSubmissions] = useState<UserSubmission[]>([]);
  const [submissionsUsed, setSubmissionsUsed] = useState(0);
  const [maxPerUser, setMaxPerUser] = useState(1);
  const [canSubmitMore, setCanSubmitMore] = useState(true);
  const [bypassSlots, setBypassSlots] = useState(false);
  const [inTeam, setInTeam] = useState(false);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; reason: string | null; needsLocation: boolean }>({ eligible: true, reason: null, needsLocation: false });
  // In-app capture + per-submission details
  const [captureTrace, setCaptureTrace] = useState<CaptureTrace | null>(null);
  const [captureKey, setCaptureKey] = useState(0); // remount the recorder after a submit
  const captureUploadRef = useRef<Promise<boolean> | null>(null);
  const [metaAnswers, setMetaAnswers] = useState<Record<string, string>>({});
  const [metaUploading, setMetaUploading] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [language, setLanguage] = useState("");
  const [promptUsed, setPromptUsed] = useState("");
  const [gender, setGenderState] = useState("");
  const [consent, setConsent] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);

  const updateItem = (id: string, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const fetchProject = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/data-projects/${projectId}`);
      const data = await res.json();
      setProject(data.project || null);
      setUserSubmissions(data.userSubmissions || []);
      setSubmissionsUsed(data.userSubmissionsUsed || 0);
      setMaxPerUser(data.maxSubmissionsPerUser || 1);
      setCanSubmitMore(data.canSubmitMore ?? true);
      setBypassSlots(!!data.bypassSlots);
      setInTeam(!!data.inTeam);
      setEligibility({ eligible: data.eligible ?? true, reason: data.ineligibleReason ?? null, needsLocation: !!data.needsLocation });
    } catch {
      setError("Failed to load project");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProject(); }, [projectId]);

  // Returns an error string if the file is unacceptable, else null.
  const validateFile = (f: File): string | null => {
    if (!project) return "Project not loaded";
    const sizeMB = f.size / (1024 * 1024);
    // 0 / blank = no project size limit (files still bounded by Supabase storage).
    if (project.maxFileSizeMB > 0 && sizeMB > project.maxFileSizeMB) {
      return `Too large (${sizeMB.toFixed(1)}MB, max ${project.maxFileSizeMB}MB)`;
    }
    const mimeType = f.type.toLowerCase();
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    const isValidMime =
      (project.projectType === "voice" && mimeType.startsWith("audio/")) ||
      (project.projectType === "video" && mimeType.startsWith("video/")) ||
      (project.projectType === "face" && (mimeType.startsWith("video/") || mimeType.startsWith("image/")));
    const isValidExt = project.acceptedFormats.includes(ext);
    if (!isValidMime && !isValidExt) {
      return `Not an accepted ${project.projectType === "voice" ? "audio" : "video/image"} file`;
    }
    return null;
  };

  // Measure a file's quality; block clearly-bad ones, attach specs to the rest.
  const analyzeItem = async (item: UploadItem) => {
    if (!project) return;
    try {
      const { meta, hardError } = await analyzeMedia(item.file, {
        minDurationSecs: project.minDurationSecs,
        maxDurationSecs: project.maxDurationSecs,
      });
      if (hardError) updateItem(item.id, { status: "invalid", error: hardError, meta });
      else updateItem(item.id, { status: "queued", meta });
    } catch {
      updateItem(item.id, { status: "queued" }); // never block on analyzer failure
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length || !project) return;

    const rejected: string[] = [];
    const additions: UploadItem[] = [];
    const maxFiles = project.maxFilesPerSubmission || 1;
    let remaining = Math.max(0, maxFiles - items.length);
    for (const f of selected) {
      if (remaining <= 0) {
        rejected.push(`This project allows at most ${maxFiles} file${maxFiles === 1 ? "" : "s"} per submission.`);
        break;
      }
      const err = validateFile(f);
      if (err) { rejected.push(`${f.name}: ${err}`); continue; }
      additions.push({ id: `f${idCounter.current++}`, file: f, status: "analyzing", progress: 0 });
      remaining--;
    }
    if (additions.length) {
      setItems((prev) => [...prev, ...additions]);
      additions.forEach((it) => analyzeItem(it)); // async quality check per file
    }
    setError(rejected.join("\n"));
    setMessage("");
    e.target.value = ""; // allow re-picking the same file
  };

  const removeItem = (id: string) => {
    uploadedRef.current.delete(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Uploaded-file data, tracked outside React so it survives across retries and
  // is readable synchronously when we build the final grouped submission.
  const uploadedRef = useRef<Map<string, UploadedFile>>(new Map());

  // Upload ONE file to storage (independent — a failure here never touches
  // another item). It does NOT submit; the whole set is submitted together.
  const uploadOne = async (item: UploadItem): Promise<boolean> => {
    updateItem(item.id, { status: "uploading", progress: 0, error: undefined });
    try {
      // Hash in the browser so the server can dedup without re-downloading.
      const fileHash = await sha256Hex(item.file);
      const u = await uploadFile(item.file, projectId, item.file.name, (pct) =>
        updateItem(item.id, { progress: pct })
      );
      const data: UploadedFile = { fileUrl: u.url, fileName: u.fileName, fileType: u.fileType, fileSizeMB: u.fileSizeMB, fileHash };
      uploadedRef.current.set(item.id, data);
      updateItem(item.id, { status: "uploaded", progress: 100, uploaded: data });
      return true;
    } catch (err) {
      uploadedRef.current.delete(item.id);
      updateItem(item.id, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
      return false;
    }
  };

  // Upload a batch with a small concurrency cap; each item is independent.
  const uploadPool = async (list: UploadItem[]) => {
    let i = 0;
    const worker = async () => {
      while (i < list.length) await uploadOne(list[i++]);
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, list.length) }, worker));
  };

  // Projects with a gender quota may also ask "Gender" as a details question —
  // answering either one fills in the other, so nobody is stuck on a grey button.
  const genderField = project?.metadataFields.find((f) =>
    f.type === "select" && /gender|sex/i.test(`${f.key} ${f.label}`) &&
    (f.options ?? []).some((o) => /^(male|female)$/i.test(o.trim())));
  const hasQuota = !!project && (project.malesNeeded !== null || project.femalesNeeded !== null);
  const setGender = (g: string) => {
    setGenderState(g);
    const opt = genderField?.options?.find((o) => o.trim().toLowerCase() === g);
    if (genderField && opt) setMetaAnswers((a) => ({ ...a, [genderField.key]: opt }));
  };
  const onMetaAnswer = (key: string, v: string) => {
    setMetaAnswers((a) => ({ ...a, [key]: v }));
    const g = v.trim().toLowerCase();
    if (hasQuota && genderField?.key === key && (g === "male" || g === "female")) setGenderState(g);
  };

  const preflight = (): string | null => {
    if (!items.length) return project?.captureMode && project.captureMode !== "upload" ? "Record your video first." : "Add your file first.";
    if (!consent) return "You must give consent before submitting.";
    if (project && (project.malesNeeded !== null || project.femalesNeeded !== null) && !gender)
      return "Please select your gender before submitting.";
    if (project && project.languages.length > 0 && !language) return "Please select the language you used.";
    if (project && project.captureMode === "nose_dots" && !captureTrace?.completed) return "Connect all the dots with the camera before submitting.";
    if (project?.metadataFields.length) {
      const check = validateMetadataAnswers(project.metadataFields, metaAnswers);
      if (!check.ok) return check.error;
    }
    return null;
  };

  // Send the whole set as ONE submission. Counts as one submission from one
  // user (one slot, one gender count, one reward).
  const submitSet = async (files: (UploadedFile & { meta?: MediaMeta })[], geo: GeoFix | null): Promise<string | null> => {
    setItems((prev) => prev.map((it) => (it.status === "uploaded" ? { ...it, status: "submitting" } : it)));
    try {
      const res = await fetch(`/api/data-projects/${projectId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files,
          language: language || null,
          promptUsed: promptUsed || null,
          gender: gender || null,
          consentGiven: consent,
          metadata: metaAnswers,
          captureData: captureTrace,
          geo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setItems((prev) => prev.map((it) => (it.status === "submitting" ? { ...it, status: "uploaded" } : it)));
        setError(data.message || "Submission failed");
        return null;
      }
      setMessage(data.message || "Submission received! Your files are under review.");
      uploadedRef.current.clear();
      setItems([]);
      setConsent(false);
      setCaptureTrace(null);
      setCaptureKey((k) => k + 1);
      setMetaAnswers({});
      fetchProject();
      return (data.submissionId as string) || null;
    } catch {
      setItems((prev) => prev.map((it) => (it.status === "submitting" ? { ...it, status: "uploaded" } : it)));
      setError("An error occurred while submitting.");
      return null;
    }
  };

  // Fire-and-forget: after submitting, extract a few frames from the LOCAL files
  // and ask the server for an AI quality suggestion (stored on the submission).
  // Cheap + best-effort — never blocks the contributor.
  const autoScoreSubmission = async (submissionId: string, localFiles: File[]) => {
    try {
      const frames: string[] = [];
      for (const f of localFiles) {
        if (frames.length >= 6) break;
        const per = f.type.startsWith("video") ? 2 : 1; // spread across video timeline
        const fr = await extractFramesFromFile(f, per);
        frames.push(...fr);
      }
      const capped = frames.slice(0, 6);
      if (!capped.length) return;
      await fetch(`/api/data-projects/${projectId}/submissions/${submissionId}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames: capped }),
      }).catch(() => {});
    } catch { /* best-effort */ }
  };

  const handleSubmitAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!items.length) { setError("Add at least one file to submit."); return; }
    // Quality gate: wait for analysis, and block files that failed it.
    if (items.some((it) => it.status === "analyzing")) { setError("Still checking your files — try again in a moment."); return; }
    const invalid = items.filter((it) => it.status === "invalid");
    if (invalid.length) {
      setError(`${invalid.length} file${invalid.length === 1 ? " doesn't" : "s don't"} meet the quality requirements. Remove or replace ${invalid.length === 1 ? "it" : "them"} before submitting.`);
      return;
    }
    const problem = preflight();
    if (problem) { setError(problem); return; }

    setError(""); setMessage("");
    setProcessing(true);

    // GPS proof of location, when the project requires it.
    let geo: GeoFix | null = null;
    if (project.requireGeo) {
      try { geo = await getGeoFix(); }
      catch (err) { setProcessing(false); setError(err instanceof Error ? err.message : "Couldn't get your location."); return; }
    }

    // An in-app recording starts uploading the moment it's saved — let it finish.
    if (captureUploadRef.current) await captureUploadRef.current;

    // 1. Upload any files that aren't in storage yet (queued or previously failed).
    const toUpload = items.filter((it) => it.status === "queued" || it.status === "error");
    if (toUpload.length) await uploadPool(toUpload);

    // 2. Only submit when EVERY file uploaded — a partial set would be incomplete.
    const allUploaded = items.every((it) => uploadedRef.current.has(it.id));
    if (!allUploaded) {
      setProcessing(false);
      const failed = items.filter((it) => !uploadedRef.current.has(it.id)).length;
      setError(`${failed} file${failed === 1 ? "" : "s"} failed to upload. Retry ${failed === 1 ? "it" : "them"} below, then submit.`);
      return;
    }

    // 3. Submit the full set as one submission (preserve the picked order), with specs.
    const files = items
      .map((it) => {
        const up = uploadedRef.current.get(it.id);
        return up ? { ...up, meta: it.meta } : null;
      })
      .filter(Boolean) as (UploadedFile & { meta?: MediaMeta })[];
    // Capture the local files for AI scoring BEFORE submitSet clears the list.
    const localFiles = items.map((it) => it.file);
    const submissionId = await submitSet(files, geo);
    setProcessing(false);
    // Auto AI quality suggestion — fire-and-forget, doesn't block the contributor.
    if (submissionId) autoScoreSubmission(submissionId, localFiles);
  };

  // In-app recording finished: it becomes the submission's file and starts
  // uploading straight away ("stops and saves automatically").
  const handleCaptured = (r: CaptureResult) => {
    const name = `${project?.captureMode === "nose_dots" ? "nose-dots" : "capture"}-${Date.now()}.${r.ext}`;
    const file = new window.File([r.blob], name, { type: r.mimeType }); // `File` is the lucide icon here
    const durationSecs = Math.round(r.trace.durationMs / 100) / 10;
    const item: UploadItem = {
      id: `f${idCounter.current++}`,
      file,
      status: "queued",
      progress: 0,
      meta: { kind: "video", width: r.trace.videoWidth, height: r.trace.videoHeight, durationSecs, warnings: [] },
    };
    uploadedRef.current.clear();
    setItems([item]);
    setCaptureTrace(r.trace);
    setError("");
    captureUploadRef.current = uploadOne(item);
  };

  const handleRetake = () => {
    uploadedRef.current.clear();
    captureUploadRef.current = null;
    setItems([]);
    setCaptureTrace(null);
  };

  // Photo-type metadata (e.g. ID card): upload right away, keep the URL as the answer.
  const handleMetaPhoto = async (field: MetadataField, f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError(`"${field.label}" must be a photo.`); return; }
    setMetaUploading((m) => ({ ...m, [field.key]: true }));
    try {
      const u = await uploadFile(f, `${projectId}-meta`, f.name);
      setMetaAnswers((a) => ({ ...a, [field.key]: u.url }));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setMetaUploading((m) => ({ ...m, [field.key]: false }));
    }
  };

  // Retry uploading one failed file without touching the others.
  const retryOne = async (item: UploadItem) => {
    setError("");
    await uploadOne(item);
  };

  // A submission may carry several files (new) or one (legacy) — normalize.
  const parseSubmissionFiles = (sub: UserSubmission): { url: string; name: string; type: string; sizeMB: number }[] => {
    if (sub.files) {
      try {
        const arr = JSON.parse(sub.files);
        if (Array.isArray(arr) && arr.length) return arr;
      } catch {}
    }
    return [{ url: sub.fileUrl, name: sub.fileName, type: sub.fileType, sizeMB: sub.fileSizeMB }];
  };

  const formatFileSize = (mb: number) => mb < 1 ? `${(mb * 1024).toFixed(0)}KB` : `${mb.toFixed(1)}MB`;

  const getFileIcon = (type: string) => {
    if (type?.startsWith("audio")) return <FileAudio size={20} className="text-blue-500" />;
    if (type?.startsWith("video")) return <FileVideo size={20} className="text-purple-500" />;
    return <File size={20} className="text-zinc-400" />;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <PageSkeleton stats={0} rows={3} />
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout>
        <div className="text-center py-20 text-zinc-400">
          <AlertCircle size={40} className="mx-auto mb-3" />
          <p>Project not found.</p>
          <Link href="/data-projects" className="text-blue-600 hover:underline text-sm mt-2 inline-block">Back to projects</Link>
        </div>
      </DashboardLayout>
    );
  }

  const meta = TYPE_META[project.projectType] || TYPE_META.voice;
  const Icon = meta.icon;

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6">
        {/* Back */}
        <Link href="/data-projects" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-foreground">
          <ArrowLeft size={16} />Back to projects
        </Link>

        {/* Project Header */}
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-zinc-50 border ${meta.color}`}>
              <Icon size={24} />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 ${meta.color}`}>{meta.label}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  project.status === "active" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
                }`}>{project.status}</span>
                {project.locationLabel && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                    <MapPin size={11} />{project.locationLabel}
                  </span>
                )}
                {project.captureMode !== "upload" && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    {project.captureMode === "nose_dots" ? "Guided camera task" : "Record in app"}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-foreground">{project.title}</h1>
              <p className="text-sm text-zinc-500 mt-1">{project.description}</p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-zinc-100">
            <div className="text-center">
              {project.reward == null ? (
                <><p className="whitespace-nowrap text-base font-semibold text-violet-600 dark:text-violet-300">Team pay</p><p className="text-xs text-zinc-400">from your leader</p></>
              ) : (
                <><p className="text-xl font-bold text-green-600">{formatMoney(project.reward, project.currency)}</p><p className="text-xs text-zinc-400">reward per approval</p></>
              )}
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">{project.slotsRemaining}</p>
              <p className="text-xs text-zinc-400">slots remaining</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground">{project.maxDurationSecs}s</p>
              <p className="text-xs text-zinc-400">max duration</p>
            </div>
          </div>

          {/* Gender quota stats */}
          {(project.malesNeeded !== null || project.femalesNeeded !== null) && (
            <div className="mt-3 pt-3 border-t border-zinc-100 grid grid-cols-2 gap-3">
              {project.malesNeeded !== null && (
                <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                  <span className="text-lg font-bold text-blue-700">{project.malesSlotsRemaining}</span>
                  <div>
                    <p className="text-xs font-medium text-blue-700">male slots left</p>
                    <p className="text-xs text-zinc-400">of {project.malesNeeded}</p>
                  </div>
                </div>
              )}
              {project.femalesNeeded !== null && (
                <div className="flex items-center gap-2 bg-pink-50 rounded-lg px-3 py-2">
                  <span className="text-lg font-bold text-pink-700">{project.femalesSlotsRemaining}</span>
                  <div>
                    <p className="text-xs font-medium text-pink-700">female slots left</p>
                    <p className="text-xs text-zinc-400">of {project.femalesNeeded}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Success banner (visible even after the form hides on submit) */}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            <CheckCircle2 size={16} className="inline mr-2" />{message}
          </div>
        )}

        {/* Your submissions */}
        {userSubmissions.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Your Submission{userSubmissions.length === 1 ? "" : "s"}</h2>
              {maxPerUser > 1 && (
                <span className="text-xs text-zinc-500">{submissionsUsed} of {maxPerUser} used</span>
              )}
            </div>

            {/* Limit reached — make it clear they can't submit again */}
            {!canSubmitMore && project.status === "active" && (
              <div className="flex items-center gap-2 p-3 rounded-lg mb-3 bg-blue-50 border border-blue-100">
                <AlertCircle size={18} className="text-blue-600 shrink-0" />
                <p className="text-sm text-blue-700">
                  You&rsquo;ve used all your submission{maxPerUser === 1 ? "" : "s"} for this project
                  {maxPerUser > 1 ? ` (${submissionsUsed}/${maxPerUser})` : ""}. You can&rsquo;t submit again.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {userSubmissions.map((sub) => {
                const subFiles = parseSubmissionFiles(sub);
                return (
                  <div key={sub.id} className="border border-zinc-100 rounded-xl p-3">
                    <div className={`flex items-center gap-3 p-2 rounded-lg mb-2 ${
                      sub.status === "pending" ? "bg-yellow-50" : sub.status === "approved" ? "bg-green-50" : "bg-red-50"
                    }`}>
                      {sub.status === "pending" && <Clock size={16} className="text-yellow-600 shrink-0" />}
                      {sub.status === "approved" && <CheckCircle2 size={16} className="text-green-600 shrink-0" />}
                      {sub.status === "rejected" && <XCircle size={16} className="text-red-600 shrink-0" />}
                      <div className="min-w-0">
                        <p className={`font-medium text-sm ${
                          sub.status === "pending" ? "text-yellow-700" : sub.status === "approved" ? "text-green-700" : "text-red-700"
                        }`}>
                          {sub.status === "pending" ? "Pending review — being checked by our team" :
                           sub.status === "approved" ? (project.payoutMode === "via_leader" ? (project.reward == null ? "Approved! Your team leader pays you." : `Approved! ${formatMoney(project.reward, project.currency)} — your team leader pays you`) : `Approved! ${formatMoney(project.reward ?? 0, project.currency)} credited to your balance`) :
                           "Rejected — you can submit again"}
                        </p>
                        <p className="text-xs text-zinc-400">{subFiles.length} file{subFiles.length === 1 ? "" : "s"} · {formatDate(sub.submittedAt)}</p>
                        {sub.notes && <p className="text-xs text-red-600 mt-0.5">Reason: {sub.notes}</p>}
                      </div>
                    </div>
                    {sub.status !== "rejected" && (
                      <div className="space-y-2">
                        {subFiles.map((f, i) => (
                          <div key={`${f.url}-${i}`}>
                            <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 mb-1">
                              <span className="inline-flex items-center gap-2 min-w-0">{getFileIcon(f.type)}<span className="truncate">{f.name} · {formatFileSize(f.sizeMB)}</span></span>
                              <a href={toDownloadUrl(f.url, f.name)} download={f.name} className="inline-flex items-center gap-1 text-blue-600 hover:underline shrink-0">
                                <Download size={12} />Save
                              </a>
                            </div>
                            {f.type.startsWith("audio") && <audio controls src={f.url} className="w-full h-9" />}
                            {f.type.startsWith("video") && <video controls src={f.url} className="rounded-lg max-h-44 bg-black w-full" />}
                            {f.type.startsWith("image") && <img src={f.url} alt={f.name} className="rounded-lg max-h-44 object-contain" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Not open to this contributor's location */}
        {canSubmitMore && !eligibility.eligible && (
          <Card className="p-6 text-center">
            <MapPin size={32} className="mx-auto mb-2 text-emerald-600 opacity-70" />
            <p className="font-medium text-foreground">Not available in your area</p>
            <p className="text-sm text-zinc-500 mt-1">{eligibility.reason}</p>
            {eligibility.needsLocation && (
              <Link href="/profile" className="inline-block mt-3 text-sm font-medium text-blue-600 hover:underline">Add my location →</Link>
            )}
          </Card>
        )}

        {/* Instructions + upload — only while the user can still submit */}
        {/* Paid through field-team leaders */}
        {canSubmitMore && eligibility.eligible && project.payoutMode === "via_leader" && (
          inTeam ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-500/10 dark:text-violet-300">
              <strong>Paid through your team leader.</strong> When your recording is approved, your supervisor pays you — you&apos;ll see it under Withdraw → &ldquo;Paid through your team leader&rdquo;.
            </div>
          ) : (
            <Card className="p-6 text-center">
              <p className="font-medium text-foreground">Join your supervisor&apos;s team to take this project</p>
              <p className="text-sm text-zinc-500 mt-1">This project is paid through field-team supervisors. Ask your supervisor for their team code.</p>
              <Link href="/profile" className="inline-block mt-3 text-sm font-medium text-blue-600 hover:underline">Enter a team code →</Link>
            </Card>
          )
        )}

        {canSubmitMore && eligibility.eligible && (project.payoutMode !== "via_leader" || inTeam) && (
          <>
            <Card className="p-5">
              <h2 className="font-semibold mb-3">Recording Instructions</h2>
              <div className="text-sm text-zinc-600 whitespace-pre-line leading-relaxed">
                {project.instructions}
              </div>

              {/* Sample videos — video projects */}
              {(project.sampleVideoUrls?.length ? project.sampleVideoUrls : project.sampleVideoUrl ? [project.sampleVideoUrl] : []).length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold mb-1 text-zinc-700">Sample Video{(project.sampleVideoUrls?.length || 1) > 1 ? "s" : ""}</h3>
                  <p className="text-xs text-zinc-400 mb-2">Watch {(project.sampleVideoUrls?.length || 1) > 1 ? "these examples" : "this example"} before recording your submission.</p>
                  <div className="space-y-3">
                    {(project.sampleVideoUrls?.length ? project.sampleVideoUrls : [project.sampleVideoUrl!]).map((url, i) => (
                      <video key={`${url}-${i}`} controls src={url} className="w-full rounded-xl bg-black max-h-72" />
                    ))}
                  </div>
                </div>
              )}

              {project.samplePrompts.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold mb-2 text-zinc-700">Sample Prompts to Record</h3>
                  <div className="space-y-2">
                    {project.samplePrompts.map((prompt, i) => (
                      <div key={i} className="bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-foreground">
                        &ldquo;{prompt}&rdquo;
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {project.captureMode !== "upload" ? (
              <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                <p><strong>How to record:</strong></p>
                <p>• You record right here on this page — no need to upload a file.</p>
                {project.captureMode === "nose_dots" ? (
                  <>
                    <p>• Numbered dots appear on the camera. Move your <strong>nose</strong> to dot 1, then 2, and so on. Each dot turns green when connected.</p>
                    <p>• The video stops and saves by itself once every dot is green. You have up to {project.maxDurationSecs} seconds.</p>
                  </>
                ) : (
                  <p>• Length: {project.minDurationSecs}–{project.maxDurationSecs} seconds.</p>
                )}
                <p>• Good light on your face, phone held steady at eye level.</p>
                {project.requireGeo && <p>• Your device location is recorded when you submit.</p>}
              </div>
              ) : (
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700 space-y-1">
                <p><strong>File requirements:</strong></p>
                <p>• Format: {project.projectType === "voice" && project.audioSampleRate ? "wav" : project.acceptedFormats.join(", ")}</p>
                <p>• Max size: {project.maxFileSizeMB}MB</p>
                <p>• Duration: {project.minDurationSecs}–{project.maxDurationSecs} seconds</p>
                {project.projectType === "voice" && project.audioSampleRate && (
                  <>
                    <p>• Sample rate: {project.audioSampleRate >= 1000 ? `${project.audioSampleRate / 1000} kHz` : `${project.audioSampleRate} Hz`}</p>
                    <p>• Channels: {project.audioChannels === 1 ? "Mono" : project.audioChannels === 2 ? "Stereo" : "—"}</p>
                    <p>• Bit depth: {project.audioBitDepth ? `${project.audioBitDepth}-bit` : "—"}</p>
                    {project.recordingType && (
                      <p>• Type: {project.recordingType === "conversation" ? "Conversation (2 people)" : "Single person"}</p>
                    )}
                  </>
                )}
                {project.languages.length > 0 && (
                  <p>• Languages: {project.languages.join(", ")}</p>
                )}
                {project.requireGeo && <p>• Your device location is recorded when you submit.</p>}
              </div>
              )}
            </Card>

            {/* Upload Form — managers may submit even when the project's slots are full */}
            {project.status === "active" && (project.slotsRemaining > 0 || bypassSlots) ? (
              <>
              <Card className="p-5">
                <h2 className="font-semibold mb-4">{project.captureMode === "upload" ? "Upload Your Recording" : "Record Your Video"}</h2>

                {message && (
                  <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm mb-4">
                    <CheckCircle2 size={16} className="inline mr-2" />{message}
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                    <AlertCircle size={16} className="inline mr-2" />{error}
                  </div>
                )}

                <form onSubmit={handleSubmitAll} className="space-y-4">
                  {/* File picker — accepts multiple files */}
                  <div>
                    {project.captureMode !== "upload" && project.captureConfig ? (
                      <GuidedCapture
                        key={captureKey}
                        mode={project.captureMode}
                        config={project.captureConfig}
                        minDurationSecs={project.minDurationSecs}
                        maxDurationSecs={project.maxDurationSecs}
                        disabled={processing}
                        onCaptured={handleCaptured}
                        onRetake={handleRetake}
                      />
                    ) : (
                    <>
                    <label className="block text-sm font-medium mb-2">Recording Files *</label>
                    <div
                      onClick={() => !processing && fileInputRef.current?.click()}
                      className={`border-2 border-dashed border-zinc-200 rounded-xl p-6 text-center transition-colors ${processing ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-blue-400 hover:bg-blue-50/30"}`}
                    >
                      <div className="text-zinc-400">
                        <Upload size={28} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-medium">{items.length ? "Tap to add more files" : "Tap to select your recording" + ((project.maxFilesPerSubmission || 1) > 1 ? "s" : "")}</p>
                        <p className="text-xs mt-1">
                          {project.acceptedFormats.join(", ")}
                          {project.maxFileSizeMB > 0 ? ` · Max ${project.maxFileSizeMB}MB each` : ""} ·{" "}
                          {(project.maxFilesPerSubmission || 1) > 1
                            ? `Up to ${project.maxFilesPerSubmission} files per submission`
                            : "1 file per submission"}
                        </p>
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={
                        project.projectType === "voice"
                          ? "audio/*,.mp3,.wav,.m4a,.ogg,.aac,.opus"
                          : project.projectType === "video"
                          ? "video/*,.mp4,.mov,.webm,.3gp"
                          : "video/*,image/jpeg,image/png,.mp4,.mov,.jpg,.png"
                      }
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    </>
                    )}

                    {/* Selected files with independent progress / status / retry */}
                    {items.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {items.map((it) => (
                          <div key={it.id} className="border border-zinc-200 rounded-xl p-3">
                            <div className="flex items-center gap-3">
                              {getFileIcon(it.file.type)}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground truncate">{it.file.name}</p>
                                <p className="text-xs text-zinc-400">{formatFileSize(it.file.size / (1024 * 1024))}</p>
                              </div>
                              {/* Status pill / actions */}
                              {it.status === "analyzing" && (
                                <span className="text-xs text-zinc-500 inline-flex items-center gap-1 shrink-0"><Loader2 size={13} className="animate-spin" />Checking…</span>
                              )}
                              {it.status === "invalid" && (
                                <span className="inline-flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-red-600 font-medium inline-flex items-center gap-1"><XCircle size={13} />Rejected</span>
                                  <button type="button" onClick={() => removeItem(it.id)} className="text-xs text-zinc-400 hover:text-red-500">Remove</button>
                                </span>
                              )}
                              {(it.status === "queued" || it.status === "uploaded") && (
                                <span className="text-xs inline-flex items-center gap-2 shrink-0">
                                  {it.status === "uploaded" ? (
                                    <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle2 size={14} />Ready</span>
                                  ) : (
                                    <span className="text-zinc-400">{processing ? "Queued" : "Ready to submit"}</span>
                                  )}
                                  {!processing && <button type="button" onClick={() => removeItem(it.id)} className="text-zinc-400 hover:text-red-500">Remove</button>}
                                </span>
                              )}
                              {it.status === "submitting" && (
                                <span className="text-xs text-zinc-500 inline-flex items-center gap-1 shrink-0"><Loader2 size={13} className="animate-spin" />Submitting…</span>
                              )}
                              {it.status === "error" && (
                                <span className="inline-flex items-center gap-2 shrink-0">
                                  <button type="button" onClick={() => retryOne(it)} disabled={processing} className="text-xs text-blue-600 font-medium hover:underline disabled:opacity-50">Retry</button>
                                  {!processing && <button type="button" onClick={() => removeItem(it.id)} className="text-xs text-zinc-400 hover:text-red-500">Remove</button>}
                                </span>
                              )}
                              {it.status === "uploading" && (
                                <span className="text-xs text-zinc-500 inline-flex items-center gap-1 shrink-0"><Loader2 size={13} className="animate-spin" />{it.progress}%</span>
                              )}
                            </div>

                            {/* Measured specs */}
                            {it.meta && specLine(it.meta) && (
                              <p className="mt-1 text-xs text-zinc-400">{specLine(it.meta)}</p>
                            )}
                            {/* Advisory warnings (not blocking) */}
                            {it.status !== "invalid" && it.meta?.warnings && it.meta.warnings.length > 0 && (
                              <p className="mt-1 text-xs text-amber-600 break-words">⚠ {it.meta.warnings.join(" · ")}</p>
                            )}

                            {/* Progress bar while uploading */}
                            {(it.status === "uploading" || it.status === "submitting") && (
                              <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                                <div className="h-full bg-blue-600 transition-all" style={{ width: `${it.status === "submitting" ? 100 : it.progress}%` }} />
                              </div>
                            )}
                            {(it.status === "error" || it.status === "invalid") && it.error && (
                              <p className="mt-1.5 text-xs text-red-600 break-words">{it.error}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Gender selector — only when project has gender quotas */}
                  {(project.malesNeeded !== null || project.femalesNeeded !== null) && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Your Gender *</label>
                      <div className="grid grid-cols-2 gap-3">
                        {project.malesNeeded !== null && (
                          <button
                            type="button"
                            onClick={() => setGender("male")}
                            className={`flex items-center justify-center gap-2 border-2 rounded-xl py-3 text-sm font-medium transition-colors ${
                              gender === "male"
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-zinc-200 text-zinc-500 hover:border-blue-300"
                            } ${!bypassSlots && project.malesSlotsRemaining === 0 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                            disabled={!bypassSlots && project.malesSlotsRemaining === 0}
                          >
                            <span>Male</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                              gender === "male" ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-500"
                            }`}>{project.malesSlotsRemaining ?? "?"} left</span>
                          </button>
                        )}
                        {project.femalesNeeded !== null && (
                          <button
                            type="button"
                            onClick={() => setGender("female")}
                            className={`flex items-center justify-center gap-2 border-2 rounded-xl py-3 text-sm font-medium transition-colors ${
                              gender === "female"
                                ? "border-pink-500 bg-pink-50 text-pink-700"
                                : "border-zinc-200 text-zinc-500 hover:border-pink-300"
                            } ${!bypassSlots && project.femalesSlotsRemaining === 0 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                            disabled={!bypassSlots && project.femalesSlotsRemaining === 0}
                          >
                            <span>Female</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                              gender === "female" ? "bg-pink-100 text-pink-700" : "bg-zinc-100 text-zinc-500"
                            }`}>{project.femalesSlotsRemaining ?? "?"} left</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Language select */}
                  {project.languages.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Language Used *</label>
                      <select
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        required
                      >
                        <option value="">Select language...</option>
                        {project.languages.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Prompt used */}
                  {project.samplePrompts.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Which prompt did you record?</label>
                      <select
                        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={promptUsed}
                        onChange={(e) => setPromptUsed(e.target.value)}
                      >
                        <option value="">Select a prompt...</option>
                        {project.samplePrompts.map((p, i) => (
                          <option key={i} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Extra details the project collects with each submission */}
                  {project.metadataFields.length > 0 && (
                    <div className="space-y-3 border border-zinc-200 rounded-xl p-4">
                      <p className="text-sm font-semibold">Your details for this submission</p>
                      {project.metadataFields.map((f) => {
                        const val = metaAnswers[f.key] ?? "";
                        const set = (v: string) => onMetaAnswer(f.key, v);
                        const inputCls = "w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
                        return (
                          <div key={f.key}>
                            <label className="block text-sm font-medium mb-1">{f.label}{f.required ? " *" : ""}</label>
                            {f.type === "select" ? (
                              <select className={inputCls} value={val} onChange={(e) => set(e.target.value)}>
                                <option value="">Select…</option>
                                {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : f.type === "yesno" ? (
                              <div className="grid grid-cols-2 gap-2">
                                {["yes", "no"].map((o) => (
                                  <button key={o} type="button" onClick={() => set(o)} className={`border-2 rounded-lg py-2 text-sm font-medium capitalize ${val === o ? "border-blue-500 bg-blue-50 text-blue-700" : "border-zinc-200 text-zinc-500"}`}>{o}</button>
                                ))}
                              </div>
                            ) : f.type === "photo" ? (
                              <div className="flex items-center gap-3">
                                {val && <img src={val} alt={f.label} className="h-16 w-24 rounded-lg object-cover border border-zinc-200" />}
                                <label className={`inline-flex items-center gap-2 border border-dashed border-zinc-300 rounded-lg px-3 py-2 text-sm text-zinc-600 ${metaUploading[f.key] ? "opacity-50" : "cursor-pointer hover:border-blue-400"}`}>
                                  {metaUploading[f.key] ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                                  {metaUploading[f.key] ? "Uploading…" : val ? "Change photo" : "Take / choose photo"}
                                  <input type="file" accept="image/*" className="hidden" disabled={metaUploading[f.key]}
                                    onChange={(e) => { handleMetaPhoto(f, e.target.files?.[0]); e.target.value = ""; }} />
                                </label>
                              </div>
                            ) : (
                              <input
                                className={inputCls}
                                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                                value={val}
                                onChange={(e) => set(e.target.value)}
                              />
                            )}
                            {f.help && <p className="text-xs text-zinc-400 mt-1">{f.help}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Consent */}
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                    <p className="text-xs text-zinc-600 mb-3 pb-3 border-b border-zinc-200">
                      <strong>How your recording will be used:</strong> {getLicense(project.license).contributorNote}
                    </p>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-zinc-300 text-blue-600"
                      />
                      <span className="text-sm text-zinc-600">
                        I confirm that I am the person in this recording and I consent to my voice/video data being used for AI training purposes. I understand this is collected under HustleClickGH&apos;s data collection program in accordance with Ghana&apos;s Data Protection Act 2012.
                      </span>
                    </label>
                  </div>

                  <Button
                    type="submit"
                    disabled={
                      processing ||
                      items.some((it) => it.status === "analyzing") ||
                      Object.values(metaUploading).some(Boolean)
                    }
                    className="w-full bg-green-500 hover:bg-green-600 text-white"
                  >
                    {processing ? (
                      <><Loader2 size={16} className="mr-2 animate-spin" />Uploading & Submitting…</>
                    ) : (
                      <><Upload size={16} className="mr-2" />Submit {items.length || ""} File{items.length === 1 ? "" : "s"}</>
                    )}
                  </Button>
                  {!processing && (() => {
                    // Live: the first thing still missing, right under the button.
                    const waiting = items.some((it) => it.status === "analyzing") ? "Checking your file…" : Object.values(metaUploading).some(Boolean) ? "Uploading your photo…" : null;
                    const invalid = items.some((it) => it.status === "invalid") ? "Replace the file that doesn't meet the requirements." : null;
                    const missing = waiting ?? invalid ?? preflight();
                    return missing ? (
                      <p className="-mt-1 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-amber-600"><AlertCircle size={13} className="shrink-0" />{missing}</p>
                    ) : null;
                  })()}
                  <p className="text-xs text-zinc-500 text-center -mt-1">All your files are submitted together as one submission.</p>

                  <p className="text-xs text-zinc-400 text-center">
                    After submission, your recording will be reviewed. {project.reward == null ? "Your team leader pays you once it's approved." : <>You&apos;ll be paid {formatMoney(project.reward, project.currency)} once approved.</>}
                  </p>
                </form>
              </Card>
              </>
            ) : (
              <Card className="p-6 text-center text-zinc-400">
                <AlertCircle size={32} className="mx-auto mb-2 opacity-40" />
                <p className="font-medium">
                  {project.status !== "active" ? "This project is no longer accepting submissions" : "This project is full"}
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
