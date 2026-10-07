import { normalizeCurrency, BASE_CURRENCY } from "@/lib/currency";
// Shared (server + client) shapes for a DataProject's collection setup:
//   - captureMode / captureConfig — how contributors record (upload a file, record
//     in-site, or the guided "connect the dots with your nose" task)
//   - metadataFields — extra details collected with every submission
//   - location targeting — who is allowed to take the project
// All of these are stored as JSON strings on DataProject; always read them
// through the parse* helpers here, which tolerate missing/old/malformed values.

// ── Capture ─────────────────────────────────────────────────────────────────

export type CaptureMode = "upload" | "camera" | "nose_dots";

export const CAPTURE_MODES: { value: CaptureMode; label: string; help: string }[] = [
  { value: "upload", label: "Upload a file", help: "Contributors record with their own phone app and upload the file." },
  { value: "camera", label: "Record in the app", help: "Contributors open the camera on the site and record; the video saves automatically." },
  { value: "nose_dots", label: "Guided task: connect dots with nose", help: "Numbered dots appear on the camera. Contributors move their nose to each dot in order; each turns green, and recording stops and saves when all are connected." },
];

/** A dot position, 0..1 of the capture frame as the contributor SEES it (selfie view is mirrored). */
export interface CaptureDot { x: number; y: number }

export interface CaptureConfig {
  dots: CaptureDot[];
  /** Hit radius as a fraction of the frame width. */
  hitRadius: number;
  /** How long the nose must stay on a dot before it counts (ms) — stops accidental passes. */
  holdMs: number;
  facing: "user" | "environment";
  recordAudio: boolean;
  /** Show a small marker where the app thinks the nose is — makes the task much easier. */
  showNoseCursor: boolean;
}

/** Width / height of the capture frame. Admin editor and contributor view must match. */
export const CAPTURE_ASPECT = 3 / 4;

export const MAX_DOTS = 20;

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  dots: [
    { x: 0.2, y: 0.25 },
    { x: 0.8, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 0.2, y: 0.75 },
    { x: 0.8, y: 0.75 },
  ],
  hitRadius: 0.08,
  holdMs: 400,
  facing: "user",
  recordAudio: false,
  showNoseCursor: true,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Normalize anything (JSON string, object, null) into a valid CaptureConfig. */
export function parseCaptureConfig(raw: unknown): CaptureConfig {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw) ?? {}; } catch { obj = {}; }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  const dots = Array.isArray(obj.dots)
    ? (obj.dots as unknown[])
        .filter((d): d is CaptureDot => !!d && typeof d === "object" && typeof (d as CaptureDot).x === "number" && typeof (d as CaptureDot).y === "number")
        .slice(0, MAX_DOTS)
        .map((d) => ({ x: round3(clamp(d.x, 0, 1)), y: round3(clamp(d.y, 0, 1)) }))
    : DEFAULT_CAPTURE_CONFIG.dots;
  return {
    dots,
    hitRadius: clamp(num(obj.hitRadius, DEFAULT_CAPTURE_CONFIG.hitRadius), 0.03, 0.2),
    holdMs: Math.round(clamp(num(obj.holdMs, DEFAULT_CAPTURE_CONFIG.holdMs), 0, 3000)),
    facing: obj.facing === "environment" ? "environment" : "user",
    recordAudio: typeof obj.recordAudio === "boolean" ? obj.recordAudio : DEFAULT_CAPTURE_CONFIG.recordAudio,
    showNoseCursor: typeof obj.showNoseCursor === "boolean" ? obj.showNoseCursor : DEFAULT_CAPTURE_CONFIG.showNoseCursor,
  };
}

export function parseCaptureMode(raw: unknown): CaptureMode {
  return raw === "camera" || raw === "nose_dots" ? raw : "upload";
}

export function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** What an in-site capture records alongside the video — ground truth for the client. */
export interface CaptureTrace {
  mode: CaptureMode;
  dots: CaptureDot[];
  /** When each dot was connected, ms from the start of the recording. */
  hits: { index: number; tMs: number }[];
  completed: boolean;
  durationMs: number;
  videoWidth: number;
  videoHeight: number;
  mirrored: boolean;
  /** Sampled nose positions [tMs, x, y] in the same 0..1 frame space as the dots. */
  path: [number, number, number][];
  mimeType: string;
  userAgent?: string;
  /** The part of the raw video (0..1) the contributor saw as the 3:4 frame. */
  crop?: { x: number; y: number; w: number; h: number };
}

const MAX_TRACE_PATH = 3000;

function sanitizeCrop(raw: unknown): CaptureTrace["crop"] {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  const vals = [c.x, c.y, c.w, c.h];
  if (!vals.every((v) => typeof v === "number" && Number.isFinite(v))) return undefined;
  const [x, y, w, h] = vals as number[];
  return { x: round3(x), y: round3(y), w: round3(w), h: round3(h) };
}

/** Server-side: keep only well-formed trace fields and bound its size. */
export function sanitizeCaptureTrace(raw: unknown): CaptureTrace | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const hits = Array.isArray(t.hits)
    ? (t.hits as unknown[])
        .filter((h): h is { index: number; tMs: number } => !!h && typeof (h as { index: unknown }).index === "number" && typeof (h as { tMs: unknown }).tMs === "number")
        .slice(0, MAX_DOTS)
        .map((h) => ({ index: Math.round(h.index), tMs: Math.round(h.tMs) }))
    : [];
  const path = Array.isArray(t.path)
    ? (t.path as unknown[])
        .filter((p): p is [number, number, number] => Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === "number" && Number.isFinite(v)))
        .slice(0, MAX_TRACE_PATH)
        .map(([ms, x, y]) => [Math.round(ms), round3(x), round3(y)] as [number, number, number])
    : [];
  return {
    mode: parseCaptureMode(t.mode),
    dots: parseCaptureConfig({ dots: t.dots }).dots,
    hits,
    completed: t.completed === true,
    durationMs: Math.round(num(t.durationMs, 0)),
    videoWidth: Math.round(num(t.videoWidth, 0)),
    videoHeight: Math.round(num(t.videoHeight, 0)),
    mirrored: t.mirrored === true,
    path,
    mimeType: typeof t.mimeType === "string" ? t.mimeType.slice(0, 80) : "",
    userAgent: typeof t.userAgent === "string" ? t.userAgent.slice(0, 300) : undefined,
    crop: sanitizeCrop(t.crop),
  };
}

// ── Metadata fields ─────────────────────────────────────────────────────────

export type MetadataFieldType = "text" | "number" | "select" | "yesno" | "date" | "photo";

export interface MetadataField {
  key: string;
  label: string;
  type: MetadataFieldType;
  required: boolean;
  options?: string[]; // select only
  help?: string;
}

export const METADATA_FIELD_TYPES: { value: MetadataFieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Pick from a list" },
  { value: "yesno", label: "Yes / No" },
  { value: "date", label: "Date" },
  { value: "photo", label: "Photo (e.g. ID card)" },
];

/** One-click fields data clients commonly ask for. */
export const METADATA_PRESETS: Omit<MetadataField, "key">[] = [
  { label: "Age range", type: "select", required: true, options: ["18-24", "25-34", "35-44", "45-54", "55+"] },
  { label: "ID card photo", type: "photo", required: true, help: "Clear photo of your Ghana Card (front)." },
  { label: "ID card number", type: "text", required: false },
  { label: "Phone model", type: "text", required: false, help: "e.g. Tecno Spark 10, iPhone 12" },
  { label: "Recording environment", type: "select", required: true, options: ["Indoor", "Outdoor"] },
  { label: "Lighting", type: "select", required: false, options: ["Bright", "Normal", "Dim"] },
  { label: "Wearing glasses", type: "yesno", required: false },
  { label: "Skin tone", type: "select", required: false, options: ["Light", "Medium", "Dark"] },
];

export const MAX_METADATA_FIELDS = 30;

export function slugKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
}

/** Normalize admin input / stored JSON into a valid, uniquely-keyed field list. */
export function parseMetadataFields(raw: unknown): MetadataField[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const types = new Set(METADATA_FIELD_TYPES.map((t) => t.value));
  const out: MetadataField[] = [];
  for (const f of arr.slice(0, MAX_METADATA_FIELDS)) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 80) : "";
    if (!label) continue;
    const type = types.has(o.type as MetadataFieldType) ? (o.type as MetadataFieldType) : "text";
    let key = typeof o.key === "string" && o.key ? slugKey(o.key) : slugKey(label);
    const base = key;
    for (let i = 2; seen.has(key); i++) key = `${base}_${i}`;
    seen.add(key);
    const options = type === "select" && Array.isArray(o.options)
      ? Array.from(new Set((o.options as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))).slice(0, 50)
      : undefined;
    if (type === "select" && !options?.length) continue; // a list with nothing to pick is unusable
    out.push({
      key,
      label,
      type,
      required: o.required === true,
      ...(options ? { options } : {}),
      ...(typeof o.help === "string" && o.help.trim() ? { help: o.help.trim().slice(0, 200) } : {}),
    });
  }
  return out;
}

export type MetadataAnswers = Record<string, string>;

/** Check a contributor's answers against the field definitions. Returns cleaned answers or the first error. */
export function validateMetadataAnswers(
  fields: MetadataField[],
  raw: unknown,
): { ok: true; answers: MetadataAnswers } | { ok: false; error: string } {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const answers: MetadataAnswers = {};
  for (const f of fields) {
    const v = input[f.key];
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    if (!s) {
      if (f.required) return { ok: false, error: `Please fill in "${f.label}".` };
      continue;
    }
    if (s.length > 1000) return { ok: false, error: `"${f.label}" is too long.` };
    switch (f.type) {
      case "number":
        if (!Number.isFinite(Number(s))) return { ok: false, error: `"${f.label}" must be a number.` };
        break;
      case "select":
        if (!f.options?.includes(s)) return { ok: false, error: `Pick one of the options for "${f.label}".` };
        break;
      case "yesno":
        if (s !== "yes" && s !== "no") return { ok: false, error: `Answer yes or no for "${f.label}".` };
        break;
      case "date":
        if (Number.isNaN(Date.parse(s))) return { ok: false, error: `"${f.label}" must be a date.` };
        break;
      case "photo":
        if (!/^https:\/\//.test(s)) return { ok: false, error: `Upload a photo for "${f.label}".` };
        break;
    }
    answers[f.key] = s;
  }
  return { ok: true, answers };
}

// ── Admin form → DB columns (shared by create + edit) ───────────────────────

export function buildProjectSetupData(body: Record<string, unknown>) {
  const captureMode = parseCaptureMode(body.captureMode);
  const fields = parseMetadataFields(body.metadataFields);
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return {
    captureMode,
    captureConfig: captureMode === "upload" ? null : JSON.stringify(parseCaptureConfig(body.captureConfig)),
    metadataFields: fields.length ? JSON.stringify(fields) : null,
    targetCountries: stringListToDb(body.targetCountries),
    targetRegions: stringListToDb(body.targetRegions),
    targetCities: stringListToDb(body.targetCities),
    requireGeo: body.requireGeo === true,
    clientName: str(body.clientName, 120),
    referenceCode: str(body.referenceCode, 60),
    reviewOrgId: str(body.reviewOrgId, 60),
    payoutMode: body.payoutMode === "via_leader" ? "via_leader" : "individual",
    assignedLeaderIds: stringListToDb(body.assignedLeaderIds),
    currency: normalizeCurrency(body.currency),
  };
}

/** Errors in the admin's setup that would make the project impossible to complete. */
export function validateProjectSetup(data: ReturnType<typeof buildProjectSetupData>, projectType: string): string | null {
  if (data.captureMode !== "upload" && projectType === "voice") {
    return "In-app camera capture is for video or face projects. Use a Video or Face project type.";
  }
  if (data.currency !== BASE_CURRENCY && data.payoutMode !== "via_leader") {
    return "Projects in a currency other than GH₵ must be paid through team leaders (contributors' own balances are in GH₵).";
  }
  if (data.captureMode === "nose_dots") {
    const dots = parseCaptureConfig(data.captureConfig).dots;
    if (dots.length < 1) return "Add at least one dot for the guided nose task.";
  }
  return null;
}

/** File extensions an in-site recording can produce (Chrome/Android → webm, Safari/iOS → mp4). */
export const IN_APP_CAPTURE_FORMATS = ["webm", "mp4"];

// ── Location targeting ──────────────────────────────────────────────────────

export function parseStringList(raw: unknown): string[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { arr = raw.split(","); }
  }
  if (!Array.isArray(arr)) return [];
  return Array.from(new Set(arr.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))).slice(0, 100);
}

/** For storing: JSON array, or null when empty (= no restriction). */
export function stringListToDb(raw: unknown): string | null {
  const list = parseStringList(raw);
  return list.length ? JSON.stringify(list) : null;
}

export interface ProjectTargeting {
  targetCountries?: string | null;
  targetRegions?: string | null;
  targetCities?: string | null;
}

export interface UserLocation {
  country?: string | null;
  region?: string | null;
  city?: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+region$/, "").replace(/[^a-z0-9]+/g, " ").trim();

export function targetingSummary(p: ProjectTargeting): string | null {
  const parts = [parseStringList(p.targetCities), parseStringList(p.targetRegions), parseStringList(p.targetCountries)]
    .find((l) => l.length);
  return parts ? parts.join(", ") : null;
}

/**
 * Can a contributor at `loc` take a project with this targeting? Each level that
 * is set must match (cities, regions, countries are ANDed; values within a
 * level are ORed). Matching is case/spacing-insensitive.
 */
export function checkLocationEligibility(
  p: ProjectTargeting,
  loc: UserLocation | null | undefined,
): { eligible: true } | { eligible: false; reason: string; needsLocation: boolean } {
  const countries = parseStringList(p.targetCountries);
  const regions = parseStringList(p.targetRegions);
  const cities = parseStringList(p.targetCities);
  if (!countries.length && !regions.length && !cities.length) return { eligible: true };

  const where = targetingSummary(p) ?? "selected locations";
  if (!loc?.country && !loc?.region && !loc?.city) {
    return { eligible: false, needsLocation: true, reason: `Only open to contributors in ${where}. Add your location in your profile to take part.` };
  }
  const match = (list: string[], v?: string | null) => !list.length || (!!v && list.some((x) => norm(x) === norm(v)));
  if (match(countries, loc.country) && match(regions, loc.region) && match(cities, loc.city)) return { eligible: true };
  return { eligible: false, needsLocation: false, reason: `Only open to contributors in ${where}.` };
}

// ── Contributor-side availability ───────────────────────────────────────────

/**
 * Is a project (as returned by GET /api/data-projects) one this contributor can
 * take right now? Open, slots left, open to their location, and not already
 * submitted to (a rejected submission can be redone). Used for the sidebar
 * badge and the dashboard so both always show the same number.
 */
export function isProjectAvailableToMe(p: {
  status: string;
  slotsRemaining: number;
  eligible?: boolean;
  userSubmissionStatus?: string | null;
}): boolean {
  return p.status === "active" && p.slotsRemaining > 0 && p.eligible !== false &&
    (!p.userSubmissionStatus || p.userSubmissionStatus === "rejected");
}
