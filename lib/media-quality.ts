// Client-side capture-time quality checks for contributor uploads. Runs entirely
// in the browser (no server compute) — reads a file's real properties and a
// sampled frame so we can BLOCK clearly-bad files before upload and attach the
// measured specs to the submission for the reviewer.
//
// Browser-only: uses <video>/<img>/Canvas/AudioContext. Import from client code.

export interface MediaMeta {
  kind: "audio" | "video" | "image";
  width?: number;
  height?: number;
  durationSecs?: number;
  brightness?: number; // 0..100 (% of full-scale luma), video/image
  sharpness?: number; // Laplacian variance (higher = sharper), video/image
  loudnessDb?: number; // RMS dBFS (negative), audio/video
  peakDb?: number; // peak dBFS, audio
  warnings: string[]; // advisory notes shown to contributor + reviewer
}

export interface AnalyzeResult {
  meta: MediaMeta;
  hardError?: string; // set when the file clearly fails an objective gate
}

export interface AnalyzeOpts {
  minDurationSecs?: number;
  maxDurationSecs?: number;
}

// Draw a frame to a downscaled canvas and return average brightness (0..100)
// and a sharpness score (variance of a Laplacian over grayscale).
function analyzeFrame(source: CanvasImageSource, w: number, h: number): { brightness: number; sharpness: number } | null {
  try {
    const targetW = Math.min(320, w || 320);
    const scale = targetW / (w || targetW);
    const targetH = Math.max(1, Math.round((h || targetW) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, targetW, targetH);
    const { data } = ctx.getImageData(0, 0, targetW, targetH);

    const n = targetW * targetH;
    const gray = new Float32Array(n);
    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[p] = g;
      sum += g;
    }
    const brightness = (sum / n / 255) * 100;

    // Laplacian variance (edge energy) as a focus/sharpness proxy.
    let lapSum = 0;
    let lapSumSq = 0;
    let count = 0;
    for (let y = 1; y < targetH - 1; y++) {
      for (let x = 1; x < targetW - 1; x++) {
        const idx = y * targetW + x;
        const lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - targetW] - gray[idx + targetW];
        lapSum += lap;
        lapSumSq += lap * lap;
        count++;
      }
    }
    const mean = lapSum / count;
    const sharpness = lapSumSq / count - mean * mean;
    return { brightness: Math.round(brightness), sharpness: Math.round(sharpness) };
  } catch {
    return null;
  }
}

function checkDuration(dur: number | undefined, opts: AnalyzeOpts): string | undefined {
  if (dur === undefined || !isFinite(dur) || dur <= 0) return undefined;
  if (opts.minDurationSecs && dur < opts.minDurationSecs - 0.5)
    return `Too short — ${dur.toFixed(1)}s, needs at least ${opts.minDurationSecs}s.`;
  if (opts.maxDurationSecs && dur > opts.maxDurationSecs + 0.5)
    return `Too long — ${dur.toFixed(1)}s, the limit is ${opts.maxDurationSecs}s.`;
  return undefined;
}

async function analyzeVideo(file: File, opts: AnalyzeOpts): Promise<AnalyzeResult> {
  const meta: MediaMeta = { kind: "video", warnings: [] };
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("metadata timeout")), 8000);
      video.onloadedmetadata = () => { clearTimeout(to); resolve(); };
      video.onerror = () => { clearTimeout(to); reject(new Error("cannot read video")); };
    });

    meta.width = video.videoWidth || undefined;
    meta.height = video.videoHeight || undefined;
    meta.durationSecs = isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : undefined;

    // Sample a frame near the middle for brightness / sharpness.
    try {
      await new Promise<void>((resolve) => {
        const to = setTimeout(resolve, 6000);
        video.onseeked = () => { clearTimeout(to); resolve(); };
        video.currentTime = Math.min(0.5 * (video.duration || 1), (video.duration || 1) - 0.1);
      });
      const frame = analyzeFrame(video, meta.width || 320, meta.height || 240);
      if (frame) { meta.brightness = frame.brightness; meta.sharpness = frame.sharpness; }
    } catch { /* frame sampling is best-effort */ }

    // Hard gates (objective).
    const durErr = checkDuration(meta.durationSecs, opts);
    if (durErr) return { meta, hardError: durErr };
    const longSide = Math.max(meta.width || 0, meta.height || 0);
    if (longSide && longSide < 480) {
      return { meta, hardError: `Resolution too low (${meta.width}×${meta.height}). Please record in at least 720p.` };
    }

    // Advisory warnings.
    if (longSide && longSide < 720) meta.warnings.push("Below 720p — higher resolution preferred");
    if (meta.brightness !== undefined && meta.brightness < 22) meta.warnings.push("Video looks very dark");
    if (meta.sharpness !== undefined && meta.sharpness < 40) meta.warnings.push("Video may be blurry / out of focus");
    return { meta };
  } catch {
    return { meta }; // analysis failed — don't block, just no specs
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function analyzeImage(file: File): Promise<AnalyzeResult> {
  const meta: MediaMeta = { kind: "image", warnings: [] };
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("image timeout")), 8000);
      img.onload = () => { clearTimeout(to); resolve(); };
      img.onerror = () => { clearTimeout(to); reject(new Error("cannot read image")); };
    });
    meta.width = img.naturalWidth || undefined;
    meta.height = img.naturalHeight || undefined;
    const frame = analyzeFrame(img, meta.width || 320, meta.height || 240);
    if (frame) { meta.brightness = frame.brightness; meta.sharpness = frame.sharpness; }

    const longSide = Math.max(meta.width || 0, meta.height || 0);
    if (longSide && longSide < 480) {
      return { meta, hardError: `Image resolution too low (${meta.width}×${meta.height}). Use at least 720p.` };
    }
    if (longSide && longSide < 720) meta.warnings.push("Below 720p — higher resolution preferred");
    if (meta.brightness !== undefined && meta.brightness < 22) meta.warnings.push("Image looks very dark");
    if (meta.sharpness !== undefined && meta.sharpness < 40) meta.warnings.push("Image may be blurry / out of focus");
    return { meta };
  } catch {
    return { meta };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function analyzeAudio(file: File, opts: AnalyzeOpts): Promise<AnalyzeResult> {
  const meta: MediaMeta = { kind: "audio", warnings: [] };
  try {
    const buf = await file.arrayBuffer();
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    let audioBuf: AudioBuffer;
    try {
      audioBuf = await ctx.decodeAudioData(buf.slice(0));
    } finally {
      ctx.close();
    }
    meta.durationSecs = Math.round(audioBuf.duration * 10) / 10;

    const ch = audioBuf.getChannelData(0);
    const stride = Math.max(1, Math.floor(ch.length / 200000)); // cap work
    let sumSq = 0;
    let peak = 0;
    let count = 0;
    for (let i = 0; i < ch.length; i += stride) {
      const v = ch[i];
      sumSq += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      count++;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, count));
    meta.loudnessDb = rms > 0 ? Math.round(20 * Math.log10(rms) * 10) / 10 : -99;
    meta.peakDb = peak > 0 ? Math.round(20 * Math.log10(peak) * 10) / 10 : -99;

    const durErr = checkDuration(meta.durationSecs, opts);
    if (durErr) return { meta, hardError: durErr };
    if (meta.loudnessDb < -55) return { meta, hardError: "No audio detected — the recording is silent or extremely quiet." };

    if (meta.loudnessDb < -35) meta.warnings.push("Audio is quite quiet — record closer / louder");
    if (meta.peakDb > -1) meta.warnings.push("Audio may be clipping (too loud)");
    return { meta };
  } catch {
    return { meta: { kind: "audio", warnings: [] } };
  }
}

/** Analyze a picked file. Returns measured specs and a hardError if it clearly fails. */
export async function analyzeMedia(file: File, opts: AnalyzeOpts = {}): Promise<AnalyzeResult> {
  if (typeof window === "undefined") return { meta: { kind: "video", warnings: [] } };
  const type = file.type.toLowerCase();
  if (type.startsWith("audio")) return analyzeAudio(file, opts);
  if (type.startsWith("image")) return analyzeImage(file);
  if (type.startsWith("video")) return analyzeVideo(file, opts);
  // Unknown mime (e.g. some webm recordings report no type) — try by nothing.
  return { meta: { kind: "video", warnings: [] } };
}

/** Short human-readable spec line for a MediaMeta, e.g. "1280×720 · 8.2s · -18dB". */
export function specLine(m?: Partial<MediaMeta> | null): string {
  if (!m) return "";
  const parts: string[] = [];
  if (m.width && m.height) parts.push(`${m.width}×${m.height}`);
  if (m.durationSecs) parts.push(`${m.durationSecs}s`);
  if (m.loudnessDb !== undefined && m.loudnessDb > -99) parts.push(`${m.loudnessDb}dB`);
  return parts.join(" · ");
}
