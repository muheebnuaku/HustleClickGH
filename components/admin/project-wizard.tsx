"use client";

// Step-by-step create / edit flow for data projects. Each choice opens only the
// steps and fields it needs: the project type decides whether a capture method
// is asked, the capture method decides whether a camera/dots step appears, and
// yes/no toggles reveal optional settings (quotas, deadline, extra details).

import { useEffect, useRef, useState } from "react";
import {
  Mic, Video, ScanFace, Upload, Camera, Crosshair, Check, ChevronLeft, ChevronRight, X, Loader2,
  FileText, MapPin, ListChecks, Wallet, Eye, Sparkles, Trash2, Lock, Users, Network, Crown, UserCog,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/upload-file";
import { MultiSelect } from "@/components/admin/multi-select";
import { CURRENCIES, currencySymbol, formatMoney } from "@/lib/currency";
import {
  DEFAULT_CAPTURE_CONFIG, IN_APP_CAPTURE_FORMATS,
  type CaptureConfig, type CaptureMode, type MetadataField,
} from "@/lib/project-config";
import { DotPatternEditor } from "@/components/admin/dot-pattern-editor";
import { MetadataFieldsEditor, toEditable, fromEditable, type EditableField } from "@/components/admin/metadata-fields-editor";

/** The fields of an existing project the wizard needs to edit it. */
export interface WizardProject {
  id: string;
  title: string;
  description: string;
  instructions: string;
  projectType: string;
  reward: number;
  maxSubmissions: number;
  maxSubmissionsPerUser: number;
  maxFilesPerSubmission: number;
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
  referenceCode: string | null;
  orgName?: string | null;
  reviewOrgId?: string | null;
  payoutMode?: string | null;
  showReward?: boolean;
  assignedLeaderIds?: string[];
  currency?: string;
}

const TYPES: { value: string; label: string; help: string; icon: LucideIcon; tint: string }[] = [
  { value: "voice", label: "Voice / Audio", help: "Speech, phrases, conversations and call recordings.", icon: Mic, tint: "from-sky-500 to-blue-600" },
  { value: "video", label: "Video", help: "Actions, gestures, movement and guided camera tasks.", icon: Video, tint: "from-violet-500 to-purple-600" },
  { value: "face", label: "Face", help: "Face images or clips for recognition and liveness data.", icon: ScanFace, tint: "from-orange-500 to-amber-600" },
];

const CAPTURE: { value: CaptureMode; label: string; help: string; icon: LucideIcon }[] = [
  { value: "upload", label: "Upload a file", help: "People record with their own phone app, then upload the file.", icon: Upload },
  { value: "camera", label: "Record in the app", help: "People open the camera on the site and record. It saves automatically.", icon: Camera },
  { value: "nose_dots", label: "Guided nose-dot task", help: "Numbered dots on the camera. People touch each with their nose; it turns green, then recording stops and saves.", icon: Crosshair },
];

const FORMAT_OPTIONS: Record<string, string[]> = {
  voice: ["mp3", "wav", "m4a", "ogg"],
  video: ["mp4", "mov", "webm"],
  face: ["mp4", "mov", "jpg", "png"],
};

type StepId = "type" | "capture" | "setup" | "basics" | "audience" | "people" | "details" | "pay" | "review";
const STEP_META: Record<StepId, { label: string; icon: LucideIcon }> = {
  type: { label: "Project type", icon: Sparkles },
  capture: { label: "How people record", icon: Camera },
  setup: { label: "Camera & dots", icon: Crosshair },
  basics: { label: "Basics", icon: FileText },
  audience: { label: "Who can take it", icon: MapPin },
  people: { label: "Team & client", icon: Network },
  details: { label: "Details to collect", icon: ListChecks },
  pay: { label: "Pay & limits", icon: Wallet },
  review: { label: "Review", icon: Eye },
};

const splitList = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

function initialForm(p?: WizardProject | null) {
  return {
    title: p?.title ?? "",
    description: p?.description ?? "",
    projectType: p?.projectType ?? "",
    instructions: p?.instructions ?? "",
    samplePrompts: p?.samplePrompts?.join("\n") ?? "",
    reward: p ? String(p.reward) : "",
    maxSubmissions: p ? String(p.maxSubmissions) : "",
    maxSubmissionsPerUser: String(p?.maxSubmissionsPerUser ?? 1),
    maxFilesPerSubmission: String(p?.maxFilesPerSubmission ?? 1),
    languages: p?.languages?.join(", ") ?? "",
    minDurationSecs: String(p?.minDurationSecs ?? 3),
    maxDurationSecs: String(p?.maxDurationSecs ?? 60),
    maxFileSizeMB: p?.maxFileSizeMB ? String(p.maxFileSizeMB) : "",
    expiresAt: p?.expiresAt ? p.expiresAt.slice(0, 10) : "",
    recordingType: p?.recordingType || "conversation",
    audioSampleRate: String(p?.audioSampleRate ?? 16000),
    audioChannels: String(p?.audioChannels ?? 1),
    audioBitDepth: String(p?.audioBitDepth ?? 16),
    malesNeeded: p?.malesNeeded != null ? String(p.malesNeeded) : "",
    femalesNeeded: p?.femalesNeeded != null ? String(p.femalesNeeded) : "",
    clientName: p?.clientName ?? "",
    reviewOrgId: p?.reviewOrgId ?? "",
    payoutMode: p?.payoutMode === "via_leader" ? "via_leader" : "individual",
    showReward: p?.showReward ?? true,
    assignedLeaderIds: p?.assignedLeaderIds ?? ([] as string[]),
    currency: p?.currency ?? "GHS",
    referenceCode: p?.referenceCode ?? "",
    captureMode: (p?.captureMode ?? "upload") as CaptureMode,
    targetCountries: p?.targetCountries ?? ([] as string[]),
    targetRegions: p?.targetRegions ?? ([] as string[]),
    targetCities: p?.targetCities ?? ([] as string[]),
    requireGeo: !!p?.requireGeo,
  };
}

// ── Small presentational helpers ────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function Field({ label, hint, required, children, className }: { label: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function ChoiceCard({ icon: Icon, label, help, selected, onClick, tint, disabled }: {
  icon: LucideIcon; label: string; help: string; selected: boolean; onClick: () => void; tint?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative flex w-full items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all",
        selected
          ? "border-blue-500 bg-blue-50/60 shadow-md shadow-blue-500/10 dark:bg-blue-500/10"
          : "border-zinc-200 bg-white hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900",
        disabled && "cursor-not-allowed opacity-50 hover:translate-y-0 hover:shadow-none",
      )}
    >
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm bg-gradient-to-br", tint ?? "from-zinc-700 to-zinc-900")}>
        <Icon size={22} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-zinc-900 dark:text-zinc-50">{label}</span>
        <span className="mt-0.5 block text-sm text-zinc-500">{help}</span>
      </span>
      {selected && (
        <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
          <Check size={14} />
        </span>
      )}
    </button>
  );
}

/** Yes/No switch that reveals its children when on. */
function Reveal({ title, help, on, onChange, children }: { title: string; help?: string; on: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border transition-colors", on ? "border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-500/5" : "border-zinc-200 dark:border-zinc-800")}>
      <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-4 p-4 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
          {help && <span className="mt-0.5 block text-xs text-zinc-500">{help}</span>}
        </span>
        <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700")}>
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
        </span>
      </button>
      {on && children && <div className="border-t border-blue-100 p-4 pt-4 dark:border-blue-900/50">{children}</div>}
    </div>
  );
}

function StepTitle({ title, help }: { title: string; help?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">{title}</h2>
      {help && <p className="mt-1 text-sm text-zinc-500">{help}</p>}
    </div>
  );
}

// ── Wizard ──────────────────────────────────────────────────────────────────

export function ProjectWizard({ project, onClose, onSaved }: { project?: WizardProject | null; onClose: () => void; onSaved: (message: string) => void }) {
  const editing = !!project;
  const [form, setForm] = useState(() => initialForm(project));
  const [captureConfig, setCaptureConfig] = useState<CaptureConfig>(project?.captureConfig ?? DEFAULT_CAPTURE_CONFIG);
  const [metaFields, setMetaFields] = useState<EditableField[]>(toEditable(project?.metadataFields ?? []));
  const [sampleVideoFiles, setSampleVideoFiles] = useState<File[]>([]);
  const sampleVideoRef = useRef<HTMLInputElement>(null);
  // Optional sections, revealed by toggles
  const [useQuota, setUseQuota] = useState(project ? project.malesNeeded != null || project.femalesNeeded != null : false);
  const [useDeadline, setUseDeadline] = useState(!!project?.expiresAt);
  const [useDetails, setUseDetails] = useState((project?.metadataFields?.length ?? 0) > 0);
  const [useLocation, setUseLocation] = useState(
    !!project && (project.targetCountries.length + project.targetRegions.length + project.targetCities.length > 0),
  );
  // New projects start with no capture method highlighted until one is picked.
  const [capturePicked, setCapturePicked] = useState(editing);
  const [useLanguages, setUseLanguages] = useState((project?.languages?.length ?? 0) > 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  // Client organizations that can be given review access.
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  // Field-team leaders that can be assigned to run the project.
  const [leaders, setLeaders] = useState<{ id: string; fullName: string; leaderRole: string; leaderCountry: string | null; memberCount: number; currency?: string }[]>([]);
  const [currencyTouched, setCurrencyTouched] = useState(!!project);
  const [useTeams, setUseTeams] = useState((project?.assignedLeaderIds?.length ?? 0) > 0);
  useEffect(() => {
    fetch("/api/admin/teams")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLeaders(d?.leaders ?? []))
      .catch(() => {});
  }, []);
  // Locations people in our system have — the targeting dropdowns offer only these.
  type Loc = { name: string; count: number; country?: string; region?: string | null };
  const [locs, setLocs] = useState<{ countries: Loc[]; regions: Loc[]; cities: Loc[] }>({ countries: [], regions: [], cities: [] });
  useEffect(() => {
    fetch("/api/admin/locations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLocs(d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setOrgs((d?.organizations ?? []).map((o: { id: string; name: string }) => ({ id: o.id, name: o.name }))))
      .catch(() => {});
  }, []);

  const isCameraType = form.projectType === "video" || form.projectType === "face";
  const steps: StepId[] = [
    "type",
    ...(isCameraType ? (["capture"] as StepId[]) : []),
    ...(isCameraType && form.captureMode !== "upload" ? (["setup"] as StepId[]) : []),
    "basics", "audience", "people", "details", "pay", "review",
  ];
  // Editing starts at the basics (type can't change after creation).
  const [stepId, setStepId] = useState<StepId>(editing ? "basics" : "type");
  const idx = Math.max(0, steps.indexOf(stepId));
  const [maxVisited, setMaxVisited] = useState(editing ? steps.length - 1 : 0);

  const goTo = (s: StepId) => {
    const i = steps.indexOf(s);
    setStepId(s);
    setMaxVisited((m) => Math.max(m, i));
    setError("");
    document.getElementById("wizard-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // What's missing on a step (null = ok to continue).
  const problemOn = (s: StepId): string | null => {
    switch (s) {
      case "type": return form.projectType ? null : "Choose a project type.";
      case "capture": return capturePicked ? null : "Choose how people will record.";
      case "people":
        if (useTeams && !form.assignedLeaderIds.length) return "Pick at least one field team, or turn assignment off.";
        return null;
      case "audience":
        if (useQuota && !(Number(form.malesNeeded) > 0) && !(Number(form.femalesNeeded) > 0)) return "Enter how many men and/or women you need, or turn the quota off.";
        if (useLocation && !form.targetRegions.length && !form.targetCities.length && !form.targetCountries.length) return "Pick at least one region, city or country, or turn location off.";
        if (useLanguages && !splitList(form.languages).length) return "List at least one language, or turn languages off.";
        return null;
      case "setup": return form.captureMode === "nose_dots" && captureConfig.dots.length === 0 ? "Add at least one dot." : null;
      case "basics":
        if (!form.title.trim()) return "Give the project a title.";
        if (!form.description.trim()) return "Add a short description.";
        if (!form.instructions.trim()) return "Add recording instructions.";
        return null;
      case "pay":
        if (!(Number(form.reward) > 0)) return "Set a reward per approved submission.";
        if (form.currency !== "GHS" && form.payoutMode !== "via_leader") return `A ${form.currency} project must be paid through team leaders (contributors' balances are in GH₵).`;
        if (!(Number(form.maxSubmissions) > 0)) return "Set how many submissions you need.";
        if (Number(form.maxDurationSecs) < Number(form.minDurationSecs)) return "Max duration must be at least the min duration.";
        return null;
      default: return null;
    }
  };

  const next = () => {
    const p = problemOn(stepId);
    if (p) { setError(p); return; }
    if (idx < steps.length - 1) goTo(steps[idx + 1]);
  };
  const back = () => { if (idx > 0) goTo(steps[idx - 1]); };

  // Picking a card on a choice step moves straight on.
  const pickType = (t: string) => {
    if (editing) return;
    set({ projectType: t, captureMode: t === "voice" ? "upload" : form.captureMode });
    setError("");
    const nextStep: StepId = t === "voice" ? "basics" : "capture";
    setStepId(nextStep);
    setMaxVisited((m) => Math.max(m, 1));
  };
  const pickCapture = (m: CaptureMode) => {
    set({ captureMode: m });
    setCapturePicked(true);
    setError("");
    const nextStep: StepId = m === "upload" ? "basics" : "setup";
    setStepId(nextStep);
    setMaxVisited((v) => Math.max(v, 2));
  };

  const submit = async () => {
    for (const s of steps) {
      const p = problemOn(s);
      if (p) { setError(p); setStepId(s); return; }
    }
    setSubmitting(true);
    setError("");
    const baseFormats = FORMAT_OPTIONS[form.projectType] || [];
    const formats = form.captureMode === "upload" ? baseFormats : Array.from(new Set([...baseFormats, ...IN_APP_CAPTURE_FORMATS]));
    const body = {
      ...form,
      malesNeeded: useQuota ? form.malesNeeded : "",
      femalesNeeded: useQuota ? form.femalesNeeded : "",
      expiresAt: useDeadline ? form.expiresAt : "",
      captureMode: form.captureMode,
      captureConfig: form.captureMode === "upload" ? null : captureConfig,
      metadataFields: useDetails ? fromEditable(metaFields) : [],
      targetCountries: useLocation ? form.targetCountries : [],
      targetRegions: useLocation ? form.targetRegions : [],
      targetCities: useLocation ? form.targetCities : [],
      requireGeo: form.requireGeo,
      assignedLeaderIds: useTeams ? form.assignedLeaderIds : [],
      showReward: form.payoutMode === "via_leader" ? form.showReward : true,
      languages: useLanguages ? splitList(form.languages) : [],
      samplePrompts: form.samplePrompts.split("\n").map((p) => p.trim()).filter(Boolean),
    };
    try {
      if (editing && project) {
        const res = await fetch(`/api/admin/data-projects/${project.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.message || "Failed to update project"); return; }
        onSaved("Project updated.");
      } else {
        let sampleVideoUrls: string[] = [];
        if (sampleVideoFiles.length && isCameraType) {
          const uploaded = await Promise.all(sampleVideoFiles.map((f) => uploadFile(f, "sample-videos", f.name)));
          sampleVideoUrls = uploaded.map((u) => u.url);
        }
        const res = await fetch("/api/admin/data-projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, acceptedFormats: formats, sampleVideoUrls }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.message || "Failed to create project"); return; }
        onSaved("Project published — it's now live for contributors.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const typeMeta = TYPES.find((t) => t.value === form.projectType);
  const captureMeta = CAPTURE.find((c) => c.value === form.captureMode);
  const locationSummary = [form.targetCities.join(", "), form.targetRegions.join(", "), form.targetCountries.join(", ")].filter(Boolean).join(" · ");

  // ── Step bodies ──
  const body = (() => {
    switch (stepId) {
      case "type":
        return (
          <>
            <StepTitle title="What are you collecting?" help="Pick one to continue — the next steps adapt to your choice." />
            <div className="grid gap-3">
              {TYPES.map((t) => (
                <ChoiceCard key={t.value} icon={t.icon} label={t.label} help={t.help} tint={t.tint} selected={form.projectType === t.value} onClick={() => pickType(t.value)} disabled={editing} />
              ))}
            </div>
          </>
        );
      case "capture":
        return (
          <>
            <StepTitle title="How will people record?" help="In-app recording gives you full control over how the video is captured." />
            <div className="grid gap-3">
              {CAPTURE.map((c) => (
                <ChoiceCard key={c.value} icon={c.icon} label={c.label} help={c.help} tint={typeMeta?.tint} selected={capturePicked && form.captureMode === c.value} onClick={() => pickCapture(c.value)} />
              ))}
            </div>
          </>
        );
      case "setup":
        return (
          <>
            <StepTitle
              title={form.captureMode === "nose_dots" ? "Place the dots" : "Camera settings"}
              help={form.captureMode === "nose_dots"
                ? "Tap the frame to add a dot, drag to move, select one to remove. People connect them in number order."
                : "Choose the camera contributors record with."}
            />
            <DotPatternEditor value={captureConfig} onChange={setCaptureConfig} showDots={form.captureMode === "nose_dots"} />
          </>
        );
      case "basics":
        return (
          <>
            <StepTitle title="The basics" help="What contributors see when they open the project." />
            <div className="space-y-5">
              <Field label="Project title" required>
                <input className={inputCls} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Accra face-motion dataset" autoFocus />
              </Field>
              <Field label="Description" required hint="What you're collecting and why — one or two sentences.">
                <textarea className={cn(inputCls, "resize-none")} rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
              <Field label="Recording instructions" required hint="Step by step. Each new line shows as its own line.">
                <textarea className={cn(inputCls, "resize-y")} rows={5} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })}
                  placeholder={"1. Find a well-lit, quiet place.\n2. Hold your phone at eye level.\n3. …"} />
              </Field>
              {form.projectType === "voice" && (
                <Field label="Phrases to read (optional)" hint="One per line. Contributors pick which one they recorded.">
                  <textarea className={cn(inputCls, "resize-y")} rows={3} value={form.samplePrompts} onChange={(e) => set({ samplePrompts: e.target.value })} placeholder={"Me din de Kwame\nWo ho te sɛn?"} />
                </Field>
              )}
              {isCameraType && !editing && (
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-200">Example videos (optional)</span>
                  <div className="space-y-2">
                    {sampleVideoFiles.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
                        <Video size={18} className="shrink-0 text-violet-500" />
                        <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                        <span className="text-xs text-zinc-400">{(f.size / 1048576).toFixed(1)} MB</span>
                        <button type="button" onClick={() => setSampleVideoFiles((p) => p.filter((_, k) => k !== i))} className="text-zinc-400 hover:text-red-500"><Trash2 size={15} /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => sampleVideoRef.current?.click()}
                      className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-zinc-200 p-5 text-sm text-zinc-500 hover:border-blue-400 hover:bg-blue-50/40 dark:border-zinc-700 dark:hover:bg-blue-500/5">
                      <Upload size={20} className="opacity-60" />
                      {sampleVideoFiles.length ? "Add another example" : "Upload example videos contributors watch first"}
                    </button>
                    <input ref={sampleVideoRef} type="file" multiple accept="video/*,.mp4,.mov,.webm" className="hidden"
                      onChange={(e) => { const picked = Array.from(e.target.files || []); if (picked.length) setSampleVideoFiles((p) => [...p, ...picked]); e.target.value = ""; }} />
                  </div>
                </div>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Client" hint="Internal only — never shown to contributors.">
                  <input className={inputCls} value={form.clientName} onChange={(e) => set({ clientName: e.target.value })} placeholder="Who the data is for" />
                </Field>
                <Field label="Reference / batch code" hint="Used in export file names.">
                  <input className={inputCls} value={form.referenceCode} onChange={(e) => set({ referenceCode: e.target.value })} placeholder="e.g. NOSE-ACC-B1" />
                </Field>
              </div>
            </div>
          </>
        );
      case "audience":
        return (
          <>
            <StepTitle title="Who can take it?" help="Open to everyone by default. Turn on what you need." />
            <div className="space-y-3">
              <Reveal title="Limit to certain locations" help="Matched against each contributor's profile location." on={useLocation} onChange={setUseLocation}>
                <div className="space-y-4">
                  <Field label="Countries" hint="Leave empty for any country">
                    <MultiSelect
                      placeholder="Any country"
                      emptyText="No contributors with a country yet"
                      value={form.targetCountries}
                      onChange={(v) => set({ targetCountries: v })}
                      options={locs.countries.map((c) => ({ value: c.name, count: c.count }))}
                    />
                  </Field>
                  <Field label="Regions" hint={form.targetCountries.length ? "Only regions in the countries above" : "Leave empty for any region"}>
                    <MultiSelect
                      placeholder="Any region"
                      emptyText="No regions on record for these countries"
                      value={form.targetRegions}
                      onChange={(v) => set({ targetRegions: v })}
                      options={locs.regions
                        .filter((r) => !form.targetCountries.length || form.targetCountries.includes(r.country!))
                        .map((r) => ({ value: r.name, hint: r.country, count: r.count }))
                        .filter((o, k, a) => a.findIndex((x) => x.value === o.value) === k)}
                    />
                  </Field>
                  <Field label="Cities / towns" hint="Leave empty for any city">
                    <MultiSelect
                      placeholder="Any city"
                      emptyText="No cities on record for this selection"
                      value={form.targetCities}
                      onChange={(v) => set({ targetCities: v })}
                      options={locs.cities
                        .filter((c) => !form.targetCountries.length || form.targetCountries.includes(c.country!))
                        .filter((c) => !form.targetRegions.length || (!!c.region && form.targetRegions.includes(c.region)))
                        .map((c) => ({ value: c.name, hint: [c.region, c.country].filter(Boolean).join(", "), count: c.count }))
                        .filter((o, k, a) => a.findIndex((x) => x.value === o.value) === k)}
                    />
                  </Field>
                  <p className="text-xs text-zinc-500">Numbers show how many contributors are there right now.</p>
                </div>
              </Reveal>
              <Reveal title="Capture phone GPS with each submission" help="Proof of where it was recorded. Contributors must allow location." on={form.requireGeo} onChange={(v) => set({ requireGeo: v })} />
              <Reveal title="Need a set number of men and women?" help="Contributors pick their gender; slots fill separately." on={useQuota} onChange={setUseQuota}>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Men needed"><input type="number" min="0" className={inputCls} value={form.malesNeeded} onChange={(e) => set({ malesNeeded: e.target.value })} placeholder="e.g. 20" /></Field>
                  <Field label="Women needed"><input type="number" min="0" className={inputCls} value={form.femalesNeeded} onChange={(e) => set({ femalesNeeded: e.target.value })} placeholder="e.g. 20" /></Field>
                </div>
              </Reveal>
              <Reveal title="Specific languages" help="Contributors choose which one they used." on={useLanguages} onChange={setUseLanguages}>
                <Field label="Languages" hint="Comma-separated">
                  <input className={inputCls} value={form.languages} onChange={(e) => set({ languages: e.target.value })} placeholder="English, Twi, Ga, Hausa" />
                </Field>
              </Reveal>
            </div>
          </>
        );
      case "people":
        return (
          <>
            <StepTitle title="Team & client" help="Optional — who runs the project in the field, and whether a client checks the work." />
            <div className="space-y-3">
              <Reveal
                title="Assign to field teams"
                help="Only these Supervisors / Representatives and their teams can take the project."
                on={useTeams}
                onChange={(v) => {
                  setUseTeams(v);
                  if (v && form.payoutMode !== "via_leader") set({ payoutMode: "via_leader" });
                  if (!v) set({ assignedLeaderIds: [] });
                }}
              >
                {leaders.length === 0 ? (
                  <p className="text-sm text-zinc-500">No field teams yet. Appoint a Supervisor or Representative under <strong>Field Teams</strong> first.</p>
                ) : (
                  <div className="space-y-2">
                    {leaders.map((l) => {
                      const on = form.assignedLeaderIds.includes(l.id);
                      const Icon = l.leaderRole === "representative" ? Crown : UserCog;
                      return (
                        <button key={l.id} type="button"
                          onClick={() => set({
                            assignedLeaderIds: on ? form.assignedLeaderIds.filter((x) => x !== l.id) : [...form.assignedLeaderIds, l.id],
                            ...(!on && !currencyTouched && l.currency ? { currency: l.currency } : {}),
                          })}
                          className={cn("flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors",
                            on ? "border-violet-500 bg-violet-50/60 dark:bg-violet-500/10" : "border-zinc-200 hover:border-violet-300 dark:border-zinc-700")}>
                          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", l.leaderRole === "representative" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300" : "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300")}><Icon size={15} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{l.fullName}</span>
                            <span className="block text-xs text-zinc-500">{l.leaderRole === "representative" ? "Country Representative (incl. their supervisors)" : "Supervisor"}{l.leaderCountry ? ` · ${l.leaderCountry}` : ""}{l.currency ? ` · ${l.currency}` : ""} · {l.memberCount} member{l.memberCount === 1 ? "" : "s"}</span>
                          </span>
                          <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-violet-600 bg-violet-600 text-white" : "border-zinc-300 dark:border-zinc-600")}>{on && <Check size={13} />}</span>
                        </button>
                      );
                    })}
                    {form.payoutMode === "via_leader" && (
                      <p className="text-xs text-zinc-500">Payment is set to <strong>through team leaders</strong> — change it on the Pay &amp; limits step if needed.</p>
                    )}
                  </div>
                )}
              </Reveal>
              <Reveal
                title="Let the client review submissions"
                help="They log in to their client portal, check each recording and its details, and mark it Pass or Fail."
                on={!!form.reviewOrgId}
                onChange={(v) => set({ reviewOrgId: v ? orgs[0]?.id ?? "" : "" })}
              >
                {orgs.length ? (
                  <Field label="Client account" hint="Contributors are shown to the client by reference ID only.">
                    <select className={inputCls} value={form.reviewOrgId} onChange={(e) => set({ reviewOrgId: e.target.value })}>
                      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </Field>
                ) : (
                  <p className="text-sm text-zinc-500">No client accounts yet. Create one under <strong>Organizations</strong> first, then come back.</p>
                )}
              </Reveal>
            </div>
          </>
        );
      case "details":
        return (
          <>
            <StepTitle title="Extra details" help="Information contributors fill in with each submission, like an ID card photo or age range." />
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard icon={Check} label="No extra details" help="Contributors only submit the recording." selected={!useDetails} onClick={() => setUseDetails(false)} tint="from-zinc-500 to-zinc-700" />
              <ChoiceCard icon={ListChecks} label="Collect details" help="Add questions or photo uploads." selected={useDetails} onClick={() => setUseDetails(true)} tint="from-emerald-500 to-teal-600" />
            </div>
            {useDetails && (
              <div className="mt-5 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <MetadataFieldsEditor value={metaFields} onChange={setMetaFields} />
              </div>
            )}
          </>
        );
      case "pay":
        return (
          <>
            <StepTitle title="Pay & limits" help="How much contributors earn and how many submissions you need." />
            <div className="space-y-5">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-200">How contributors get paid</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoiceCard icon={Wallet} label="Pay each contributor" help="Approved rewards go straight to each person's balance; they withdraw to Mobile Money." selected={form.payoutMode !== "via_leader"} onClick={() => set({ payoutMode: "individual", currency: "GHS" })} tint="from-emerald-500 to-teal-600" />
                  <ChoiceCard icon={Users} label="Pay through team leaders" help="You send one bulk payment to their Supervisor or Country Representative, who pays their team." selected={form.payoutMode === "via_leader"} onClick={() => set({ payoutMode: "via_leader" })} tint="from-violet-500 to-indigo-600" />
                </div>
                {form.payoutMode === "via_leader" && (
                  <p className="mt-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:bg-violet-500/10 dark:text-violet-300">
                    Only people in a field team can submit. Each approval adds the reward (plus their leader&apos;s fee) to that leader&apos;s next bulk payment under <strong>Field Teams</strong>.
                  </p>
                )}
                {form.payoutMode === "via_leader" && (
                  <div className="mt-3">
                    <Reveal
                      title="Show contributors how much they earn"
                      help={form.showReward ? "They see the reward per approved item on the project." : "Hidden — they only see “Paid by your leader”. Leaders still see the full amount."}
                      on={form.showReward}
                      onChange={(v) => set({ showReward: v })}
                    />
                  </div>
                )}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Reward per approved submission" required>
                  <div className="flex gap-2">
                    <select
                      aria-label="Currency"
                      className={cn(inputCls, "w-28 shrink-0")}
                      value={form.currency}
                      onChange={(e) => { setCurrencyTouched(true); set({ currency: e.target.value, ...(e.target.value !== "GHS" ? { payoutMode: "via_leader" } : {}) }); }}
                    >
                      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">{currencySymbol(form.currency)}</span>
                      <input type="number" step="0.5" min="0.5" className={cn(inputCls, "pl-12")} value={form.reward} onChange={(e) => set({ reward: e.target.value })} placeholder="2.00" />
                    </div>
                  </div>
                  {form.currency !== "GHS" && (
                    <span className="mt-1.5 block text-xs text-violet-700 dark:text-violet-300">Paid in {form.currency} through team leaders — contributors&apos; own balances are in GH₵.</span>
                  )}
                </Field>
                <Field label="Submissions needed" required hint="The project closes when this many are approved.">
                  <input type="number" min="1" className={inputCls} value={form.maxSubmissions} onChange={(e) => set({ maxSubmissions: e.target.value })} placeholder="500" />
                </Field>
              </div>
              {Number(form.reward) > 0 && Number(form.maxSubmissions) > 0 && (
                <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-900">
                  <span className="text-zinc-500">Total contributor payout</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(Number(form.reward) * Number(form.maxSubmissions), form.currency)}</span>
                </div>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Times each person can submit">
                  <input type="number" min="1" max="100" className={inputCls} value={form.maxSubmissionsPerUser} onChange={(e) => set({ maxSubmissionsPerUser: e.target.value })} />
                </Field>
                {form.captureMode === "upload" && (
                  <Field label="Files per submission" hint="e.g. 4 for indoor + outdoor clips">
                    <input type="number" min="1" max="50" className={inputCls} value={form.maxFilesPerSubmission} onChange={(e) => set({ maxFilesPerSubmission: e.target.value })} />
                  </Field>
                )}
                <Field label={form.captureMode === "nose_dots" ? "Minimum length (seconds)" : "Minimum duration (seconds)"}>
                  <input type="number" min="1" className={inputCls} value={form.minDurationSecs} onChange={(e) => set({ minDurationSecs: e.target.value })} />
                </Field>
                <Field label={form.captureMode === "nose_dots" ? "Time limit for the task (seconds)" : "Maximum duration (seconds)"}>
                  <input type="number" min="5" className={inputCls} value={form.maxDurationSecs} onChange={(e) => set({ maxDurationSecs: e.target.value })} />
                </Field>
                {form.captureMode === "upload" && (
                  <Field label="Max file size (MB)" hint="Blank = no limit">
                    <input type="number" min="0" className={inputCls} value={form.maxFileSizeMB} onChange={(e) => set({ maxFileSizeMB: e.target.value })} />
                  </Field>
                )}
              </div>
              <Reveal title="Set a deadline" help="The project stops accepting submissions after this date." on={useDeadline} onChange={setUseDeadline}>
                <Field label="Closes on"><input type="date" className={inputCls} value={form.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} /></Field>
              </Reveal>
              {form.projectType === "voice" && (
                <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Audio format</p>
                  <p className="mb-4 mt-0.5 text-xs text-zinc-500">Live call recordings are captured as WAV at these specs.</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Field label="Type">
                      <select className={inputCls} value={form.recordingType} onChange={(e) => set({ recordingType: e.target.value })}>
                        <option value="conversation">Conversation</option><option value="single">Single person</option>
                      </select>
                    </Field>
                    <Field label="Sample rate">
                      <select className={inputCls} value={form.audioSampleRate} onChange={(e) => set({ audioSampleRate: e.target.value })}>
                        <option value="16000">16 kHz</option><option value="44100">44.1 kHz</option><option value="48000">48 kHz</option>
                      </select>
                    </Field>
                    <Field label="Channels">
                      <select className={inputCls} value={form.audioChannels} onChange={(e) => set({ audioChannels: e.target.value })}>
                        <option value="1">Mono</option><option value="2">Stereo</option>
                      </select>
                    </Field>
                    <Field label="Bit depth">
                      <select className={inputCls} value={form.audioBitDepth} onChange={(e) => set({ audioBitDepth: e.target.value })}>
                        <option value="16">16-bit</option><option value="32">32-bit float</option>
                      </select>
                    </Field>
                  </div>
                </div>
              )}
            </div>
          </>
        );
      case "review": {
        const Row = ({ step, label, value }: { step: StepId; label: string; value: React.ReactNode }) => (
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
              <div className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100 break-words">{value}</div>
            </div>
            {steps.includes(step) && (step !== "type" || !editing) && (
              <button type="button" onClick={() => goTo(step)} className="shrink-0 text-xs font-medium text-blue-600 hover:underline">Edit</button>
            )}
          </div>
        );
        return (
          <>
            <StepTitle title={editing ? "Review changes" : "Ready to publish?"} help="Check everything, then publish. It goes live for contributors straight away." />
            <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 px-5 dark:divide-zinc-800 dark:border-zinc-800">
              <Row step="type" label="Type" value={typeMeta?.label ?? "—"} />
              {isCameraType && <Row step="capture" label="Recording" value={
                <>{captureMeta?.label}{form.captureMode === "nose_dots" && ` · ${captureConfig.dots.length} dots`}</>
              } />}
              <Row step="basics" label="Title" value={<span className="font-medium">{form.title || "—"}</span>} />
              {(form.clientName || form.referenceCode) && <Row step="basics" label="Client / reference" value={[form.clientName, form.referenceCode].filter(Boolean).join(" · ")} />}
              <Row step="people" label="Field teams" value={useTeams && form.assignedLeaderIds.length ? form.assignedLeaderIds.map((id) => leaders.find((l) => l.id === id)?.fullName ?? "—").join(", ") : "Open to everyone"} />
              <Row step="people" label="Client review" value={form.reviewOrgId ? orgs.find((o) => o.id === form.reviewOrgId)?.name ?? "Selected client" : "None"} />
              <Row step="audience" label="Who can take it" value={
                <>
                  {useLocation && locationSummary ? locationSummary : "Anyone"}
                  {form.requireGeo && " · GPS required"}
                  {useQuota && ` · ${form.malesNeeded || 0} men / ${form.femalesNeeded || 0} women`}
                  {useLanguages && form.languages && ` · ${form.languages}`}
                </>
              } />
              <Row step="details" label="Extra details" value={useDetails && metaFields.length ? metaFields.map((f) => f.label).join(", ") : "None"} />
              <Row step="pay" label="Payment" value={form.payoutMode === "via_leader" ? `Through team leaders (bulk) · reward ${form.showReward ? "shown to" : "hidden from"} contributors` : "Directly to each contributor"} />
              <Row step="pay" label="Pay & limits" value={
                <>
                  {Number(form.reward) > 0 ? formatMoney(Number(form.reward), form.currency) : "—"} each · {form.maxSubmissions || "—"} needed · {form.maxSubmissionsPerUser}× per person
                  {useDeadline && form.expiresAt && ` · closes ${form.expiresAt}`}
                </>
              } />
            </div>
          </>
        );
      }
    }
  })();

  const isChoiceStep = stepId === "type" || stepId === "capture";

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-zinc-950/50 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-zinc-950 sm:h-[92vh] sm:rounded-3xl sm:border sm:border-zinc-200 sm:dark:border-zinc-800">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-400">{editing ? "Edit project" : "New data project"}{project?.orgName ? ` · ${project.orgName}` : ""}</p>
            <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">{form.title || STEP_META[stepId].label}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800" aria-label="Close"><X size={20} /></button>
        </div>

        {/* Mobile progress */}
        <div className="shrink-0 px-5 pt-3 md:hidden">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Step {idx + 1} of {steps.length}</span><span className="font-medium text-zinc-700 dark:text-zinc-300">{STEP_META[stepId].label}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Step rail */}
          <nav className="hidden w-60 shrink-0 border-r border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/30 md:block">
            <ol className="space-y-1">
              {steps.map((s, i) => {
                const M = STEP_META[s];
                const done = i < idx;
                const active = s === stepId;
                const reachable = i <= maxVisited && !(editing && s === "type");
                return (
                  <li key={s}>
                    <button type="button" disabled={!reachable} onClick={() => reachable && goTo(s)}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                        active ? "bg-white font-semibold text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                          : reachable ? "text-zinc-600 hover:bg-white/70 dark:text-zinc-300 dark:hover:bg-zinc-800/60" : "text-zinc-400")}>
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                        active ? "bg-blue-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300")}>
                        {editing && s === "type" ? <Lock size={11} /> : done ? <Check size={13} /> : i + 1}
                      </span>
                      <span className="truncate">{M.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {(typeMeta || captureMeta) && (
              <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                {typeMeta && <p><span className="font-medium text-zinc-700 dark:text-zinc-200">{typeMeta.label}</span></p>}
                {isCameraType && captureMeta && <p className="mt-0.5">{captureMeta.label}</p>}
              </div>
            )}
          </nav>

          {/* Content */}
          <div id="wizard-scroll" className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
              {body}
              {error && (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-100 bg-white px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-950">
          <button type="button" onClick={idx === 0 || (editing && stepId === "basics") ? onClose : back}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
            {idx === 0 || (editing && stepId === "basics") ? "Cancel" : <><ChevronLeft size={16} />Back</>}
          </button>
          {stepId === "review" ? (
            <button type="button" onClick={submit} disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-60">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {submitting ? (editing ? "Saving…" : "Publishing…") : editing ? "Save changes" : "Publish project"}
            </button>
          ) : isChoiceStep && !editing ? (
            <span className="text-xs text-zinc-400">Choose an option to continue</span>
          ) : (
            <button type="button" onClick={next}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
              Continue<ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
