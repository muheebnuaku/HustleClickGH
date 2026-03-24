"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Loader2, Mic, Video, ScanFace, ArrowLeft, Upload,
  CheckCircle2, Clock, XCircle, AlertCircle, FileAudio, FileVideo, File
} from "lucide-react";
import Link from "next/link";
import { uploadFile } from "@/lib/upload-file";

interface DataProject {
  id: string;
  title: string;
  description: string;
  projectType: string;
  instructions: string;
  samplePrompts: string[];
  reward: number;
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
  status: string;
  expiresAt: string | null;
  audioSampleRate: number | null;
  audioChannels: number | null;
  audioBitDepth: number | null;
  recordingType: string | null;
  sampleVideoUrl: string | null;
}

interface UserSubmission {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSizeMB: number;
  language: string | null;
  promptUsed: string | null;
  status: string;
  notes: string | null;
  submittedAt: string;
}

const TYPE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  voice: { icon: Mic, color: "text-blue-600", label: "Voice Recording" },
  video: { icon: Video, color: "text-purple-600", label: "Video Recording" },
  face: { icon: ScanFace, color: "text-orange-600", label: "Face Recognition" },
};

export default function DataProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<DataProject | null>(null);
  const [userSubmission, setUserSubmission] = useState<UserSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("");
  const [promptUsed, setPromptUsed] = useState("");
  const [gender, setGender] = useState("");
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProject = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/data-projects/${projectId}`);
      const data = await res.json();
      setProject(data.project || null);
      setUserSubmission(data.userSubmission || null);
    } catch {
      setError("Failed to load project");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProject(); }, [projectId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected || !project) return;

    const sizeMB = selected.size / (1024 * 1024);
    if (sizeMB > project.maxFileSizeMB) {
      setError(`File is too large. Maximum allowed size is ${project.maxFileSizeMB}MB. Your file is ${sizeMB.toFixed(1)}MB.`);
      return;
    }

    // Validate by MIME type first (reliable on mobile), fall back to extension
    const mimeType = selected.type.toLowerCase();
    const ext = selected.name.split(".").pop()?.toLowerCase() || "";
    const isValidMime =
      (project.projectType === "voice" && mimeType.startsWith("audio/")) ||
      (project.projectType === "video" && mimeType.startsWith("video/")) ||
      (project.projectType === "face" && (mimeType.startsWith("video/") || mimeType.startsWith("image/")));
    const isValidExt = project.acceptedFormats.includes(ext);

    if (!isValidMime && !isValidExt) {
      setError(`This file type is not accepted. For ${project.projectType} projects, please upload a ${project.projectType === "voice" ? "audio" : "video or image"} file.`);
      return;
    }

    setError("");
    setFile(selected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !project) return;

    if (!consent) {
      setError("You must give consent before submitting.");
      return;
    }

    if ((project.malesNeeded !== null || project.femalesNeeded !== null) && !gender) {
      setError("Please select your gender before submitting.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      // Step 1: Upload file (client-side to Vercel Blob in prod, local FS in dev)
      const uploadData = await uploadFile(file, projectId);

      // Step 2: Submit metadata
      const submitRes = await fetch(`/api/data-projects/${projectId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: uploadData.url,
          fileName: uploadData.fileName,
          fileType: uploadData.fileType,
          fileSizeMB: uploadData.fileSizeMB,
          language: language || null,
          promptUsed: promptUsed || null,
          gender: gender || null,
          consentGiven: consent,
        }),
      });
      const submitData = await submitRes.json();

      if (!submitRes.ok) {
        setError(submitData.message || "Submission failed");
      } else {
        setMessage(submitData.message);
        setFile(null);
        setConsent(false);
        fetchProject();
      }
    } catch {
      setError("An error occurred during submission");
    } finally {
      setUploading(false);
    }
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
        <div className="flex items-center justify-center py-20 text-zinc-400">
          <Loader2 size={24} className="animate-spin mr-2" />Loading project...
        </div>
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
              </div>
              <h1 className="text-xl font-bold text-foreground">{project.title}</h1>
              <p className="text-sm text-zinc-500 mt-1">{project.description}</p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-zinc-100">
            <div className="text-center">
              <p className="text-xl font-bold text-green-600">{formatCurrency(project.reward)}</p>
              <p className="text-xs text-zinc-400">reward per approval</p>
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

        {/* Already submitted */}
        {userSubmission && (
          <Card className="p-5">
            <h2 className="font-semibold mb-3">Your Submission</h2>
            <div className={`flex items-center gap-3 p-3 rounded-lg mb-3 ${
              userSubmission.status === "pending" ? "bg-yellow-50" :
              userSubmission.status === "approved" ? "bg-green-50" : "bg-red-50"
            }`}>
              {userSubmission.status === "pending" && <Clock size={18} className="text-yellow-600" />}
              {userSubmission.status === "approved" && <CheckCircle2 size={18} className="text-green-600" />}
              {userSubmission.status === "rejected" && <XCircle size={18} className="text-red-600" />}
              <div>
                <p className={`font-medium text-sm ${
                  userSubmission.status === "pending" ? "text-yellow-700" :
                  userSubmission.status === "approved" ? "text-green-700" : "text-red-700"
                }`}>
                  {userSubmission.status === "pending" ? "Under review — your submission is being checked by our team" :
                   userSubmission.status === "approved" ? `Approved! ${formatCurrency(project.reward)} has been credited to your balance` :
                   "Rejected — you can record and submit again"}
                </p>
                {userSubmission.notes && (
                  <p className="text-xs text-red-600 mt-1">Reason: {userSubmission.notes}</p>
                )}
              </div>
            </div>
            {userSubmission.status !== "rejected" && (
              <>
                <div className="flex items-center gap-3 text-sm text-zinc-500">
                  {getFileIcon(userSubmission.fileType)}
                  <div>
                    <p className="font-medium text-foreground">{userSubmission.fileName}</p>
                    <p className="text-xs">{formatFileSize(userSubmission.fileSizeMB)} · Submitted {formatDate(userSubmission.submittedAt)}</p>
                  </div>
                </div>
                {userSubmission.fileType.startsWith("audio") && (
                  <audio controls src={userSubmission.fileUrl} className="mt-3 w-full h-10" />
                )}
                {userSubmission.fileType.startsWith("video") && (
                  <video controls src={userSubmission.fileUrl} className="mt-3 rounded-lg max-h-48 bg-black" />
                )}
              </>
            )}
          </Card>
        )}

        {/* Instructions - show if no submission OR if submission was rejected */}
        {(!userSubmission || userSubmission.status === "rejected") && (
          <>
            <Card className="p-5">
              <h2 className="font-semibold mb-3">Recording Instructions</h2>
              <div className="text-sm text-zinc-600 whitespace-pre-line leading-relaxed">
                {project.instructions}
              </div>

              {/* Sample video — video projects */}
              {project.sampleVideoUrl && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold mb-1 text-zinc-700">Sample Video</h3>
                  <p className="text-xs text-zinc-400 mb-2">Watch this example before recording your submission.</p>
                  <video
                    controls
                    src={project.sampleVideoUrl}
                    className="w-full rounded-xl bg-black max-h-72"
                  />
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
              </div>
            </Card>

            {/* Upload Form */}
            {project.status === "active" && project.slotsRemaining > 0 ? (
              <>
                {/* Live call option — voice projects only */}
                {project.projectType === "voice" && (
                  <Card className="p-5 border-blue-100 bg-blue-50/40">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        <Mic size={20} className="text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h2 className="font-semibold text-foreground mb-0.5">Live Call Recording</h2>
                        <p className="text-sm text-zinc-500 mb-3">
                          Connect with another participant in real time. Both sides record automatically during the call.
                        </p>
                        <Link href={`/data-projects/${projectId}/call`}>
                          <Button className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto">
                            <Mic size={16} className="mr-2" />Start or Join a Call
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                )}

                {project.projectType === "voice" && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-zinc-200" />
                    <span className="text-xs text-zinc-400 font-medium">OR upload a pre-recorded file</span>
                    <div className="flex-1 border-t border-zinc-200" />
                  </div>
                )}
              <Card className="p-5">
                <h2 className="font-semibold mb-4">Upload Your Recording</h2>

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

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* File picker */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Recording File *</label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-zinc-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
                    >
                      {file ? (
                        <div className="flex items-center justify-center gap-3">
                          {getFileIcon(file.type)}
                          <div className="text-left">
                            <p className="text-sm font-medium text-foreground">{file.name}</p>
                            <p className="text-xs text-zinc-400">{formatFileSize(file.size / (1024 * 1024))}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-zinc-400">
                          <Upload size={28} className="mx-auto mb-2 opacity-50" />
                          <p className="text-sm font-medium">Tap to select your recording</p>
                          <p className="text-xs mt-1">{project.acceptedFormats.join(", ")} · Max {project.maxFileSizeMB}MB</p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
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
                            } ${project.malesSlotsRemaining === 0 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                            disabled={project.malesSlotsRemaining === 0}
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
                            } ${project.femalesSlotsRemaining === 0 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                            disabled={project.femalesSlotsRemaining === 0}
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

                  {/* Consent */}
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
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
                      !file || !consent || uploading ||
                      ((project.malesNeeded !== null || project.femalesNeeded !== null) && !gender)
                    }
                    className="w-full bg-green-500 hover:bg-green-600 text-white"
                  >
                    {uploading ? (
                      <><Loader2 size={16} className="mr-2 animate-spin" />Uploading & Submitting...</>
                    ) : (
                      <><Upload size={16} className="mr-2" />Submit Recording</>
                    )}
                  </Button>

                  <p className="text-xs text-zinc-400 text-center">
                    After submission, your recording will be reviewed. You&apos;ll be paid {formatCurrency(project.reward)} once approved.
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
