// In-browser guided video capture. Browser-only — import from client code.
//
// Opens the camera, records the RAW camera stream (no overlay burnt in), and for
// the "nose_dots" task tracks the contributor's nose tip with MediaPipe's
// BlazeFace detector. Numbered dots are drawn on a canvas over the preview; the
// nose must rest on the current dot for `holdMs` to connect it (it turns green),
// and once every dot is connected the recording stops by itself.
//
// Coordinates: dots and the recorded nose path are 0..1 of the visible 3:4
// frame exactly as the contributor sees it (mirrored for the selfie camera).
// `trace.crop` says which part of the raw video that frame shows, so a client
// can map points back onto the delivered video.
//
// Runs as a plain class (not React state) because the per-frame loop must not
// re-render; the UI subscribes to coarse state changes via onState.

import type { CaptureConfig, CaptureMode, CaptureTrace } from "@/lib/project-config";
import { round3 } from "@/lib/project-config";

export type CapturePhase = "idle" | "starting" | "ready" | "countdown" | "recording" | "finishing" | "done" | "error";

export interface CaptureState {
  phase: CapturePhase;
  currentIndex: number; // next dot to connect
  faceVisible: boolean;
  countdown: number; // 3..1 during countdown
  elapsedSecs: number;
  error: string | null;
}

export interface CaptureResult {
  blob: Blob;
  mimeType: string;
  ext: "webm" | "mp4";
  trace: CaptureTrace & { crop: { x: number; y: number; w: number; h: number } };
  completed: boolean;
}

interface EngineOpts {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  mode: Exclude<CaptureMode, "upload">;
  config: CaptureConfig;
  maxDurationSecs: number;
  onState: (s: CaptureState) => void;
  onFinished: (r: CaptureResult) => void;
}

// Pinned to the installed package version so the JS and WASM always match.
const MEDIAPIPE_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
// Self-hosted (~230 KB) so it never depends on a third-party model host.
const FACE_MODEL = "/models/blaze_face_short_range.tflite";
const NOSE_TIP = 2; // BlazeFace keypoints: 0 R-eye, 1 L-eye, 2 nose tip, 3 mouth, 4 R-ear, 5 L-ear
const COUNTDOWN_MS = 3000;
const FINISH_TAIL_MS = 600; // keep recording a moment after the last dot
const PATH_SAMPLE_MS = 100;
const SMOOTHING = 0.45; // EMA on the nose point — steadier cursor on budget cameras
const VIDEO_BITRATE = 1_200_000; // ~9 MB/minute: stays far under the 50 MB storage file cap

type FaceDetectorLike = {
  detectForVideo: (v: HTMLVideoElement, ts: number) => { detections: { boundingBox?: { width: number; height: number }; keypoints: { x: number; y: number }[] }[] };
  close: () => void;
};

// One detector per page load — retakes reuse it instead of re-downloading.
let detectorPromise: Promise<FaceDetectorLike> | null = null;
function loadDetector(): Promise<FaceDetectorLike> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      const make = (delegate: "GPU" | "CPU") =>
        FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        });
      // GPU is much faster but unsupported on some budget Android GPUs.
      try { return (await make("GPU")) as unknown as FaceDetectorLike; }
      catch { return (await make("CPU")) as unknown as FaceDetectorLike; }
    })();
    detectorPromise.catch(() => { detectorPromise = null; }); // allow a retry after a network failure
  }
  return detectorPromise;
}

function pickMimeType(withAudio: boolean): string {
  const candidates = withAudio
    ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4;codecs=avc1,mp4a", "video/mp4"]
    : ["video/webm;codecs=vp8", "video/webm", "video/mp4;codecs=avc1", "video/mp4"];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow camera permission for this site in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No usable camera was found on this device.";
  if (name === "NotReadableError") return "Your camera is being used by another app. Close it and try again.";
  return "Couldn't open the camera. Try again, or use Chrome on your phone.";
}

export class GuidedCaptureEngine {
  private o: EngineOpts;
  private state: CaptureState = { phase: "idle", currentIndex: 0, faceVisible: false, countdown: 0, elapsedSecs: 0, error: null };
  private stream: MediaStream | null = null;
  private detector: FaceDetectorLike | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = "";
  private raf = 0;
  private disposed = false;
  private lastDetectTs = 0;
  private nose: { x: number; y: number } | null = null;
  private holdStart: number | null = null;
  private countdownEnd = 0;
  private t0 = 0;
  private finishAt = 0;
  private completed = false;
  private hits: { index: number; tMs: number }[] = [];
  private path: [number, number, number][] = [];
  private lastSample = -Infinity;
  private crop = { x: 0, y: 0, w: 1, h: 1 };

  constructor(opts: EngineOpts) {
    this.o = opts;
  }

  private get needsTracking() {
    return this.o.mode === "nose_dots";
  }

  private get mirrored() {
    return this.o.config.facing === "user";
  }

  private set(patch: Partial<CaptureState>) {
    const next = { ...this.state, ...patch };
    const changed = (Object.keys(patch) as (keyof CaptureState)[]).some((k) => next[k] !== this.state[k]);
    this.state = next;
    if (changed && !this.disposed) this.o.onState(next);
  }

  /** Open the camera (and face tracker for the dot task). Call from a user tap — iOS requires it. */
  async start() {
    if (this.state.phase !== "idle" && this.state.phase !== "error") return;
    this.set({ phase: "starting", error: null });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("unsupported", "NotFoundError");
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.o.config.facing, width: { ideal: 720 }, height: { ideal: 960 }, frameRate: { ideal: 30, max: 30 } },
        audio: this.o.config.recordAudio,
      });
    } catch (err) {
      this.set({ phase: "error", error: cameraErrorMessage(err) });
      return;
    }
    if (this.disposed) return this.releaseCamera();
    const v = this.o.video;
    v.srcObject = this.stream;
    v.muted = true;
    v.playsInline = true;
    try { await v.play(); } catch { /* autoplay quirks — frames still arrive */ }

    if (this.needsTracking) {
      try {
        this.detector = await loadDetector();
      } catch {
        this.releaseCamera();
        this.set({ phase: "error", error: "Couldn't load face tracking. Check your internet connection and try again." });
        return;
      }
    }
    if (this.disposed) return this.releaseCamera();
    this.mimeType = pickMimeType(this.o.config.recordAudio);
    if (!this.mimeType) {
      this.releaseCamera();
      this.set({ phase: "error", error: "This browser can't record video. Please use Chrome (Android) or Safari (iPhone)." });
      return;
    }
    this.set({ phase: "ready" });
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Begin the 3-2-1 countdown, then record. */
  begin() {
    if (this.state.phase !== "ready") return;
    if (this.needsTracking && !this.state.faceVisible) return;
    this.countdownEnd = performance.now() + COUNTDOWN_MS;
    this.set({ phase: "countdown", countdown: 3 });
  }

  /** Free-record mode: contributor taps Stop. */
  stop() {
    if (this.state.phase === "recording") this.finish(true);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    try { if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop(); } catch {}
    this.releaseCamera();
  }

  private releaseCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try { this.o.video.srcObject = null; } catch {}
  }

  private startRecording() {
    if (!this.stream) return;
    const recStream = this.o.config.recordAudio ? this.stream : new MediaStream(this.stream.getVideoTracks());
    try {
      this.recorder = new MediaRecorder(recStream, { mimeType: this.mimeType, videoBitsPerSecond: VIDEO_BITRATE });
    } catch {
      this.recorder = new MediaRecorder(recStream);
      this.mimeType = this.recorder.mimeType || this.mimeType;
    }
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.recorder.onstop = () => this.emitResult();
    this.recorder.start(1000); // 1s chunks — nothing lost if the tab is closed late
    this.t0 = performance.now();
    this.hits = [];
    this.path = [];
    this.lastSample = -Infinity;
    this.holdStart = null;
    this.completed = false;
    this.finishAt = 0;
    this.set({ phase: "recording", currentIndex: 0, elapsedSecs: 0 });
    navigator.vibrate?.(60);
  }

  private finish(completed: boolean) {
    if (this.state.phase !== "recording") return;
    this.completed = completed;
    this.set({ phase: "finishing" });
    try { this.recorder?.stop(); } catch { this.emitResult(); }
  }

  private emitResult() {
    cancelAnimationFrame(this.raf);
    if (this.disposed) return; // abandoned (restart / left the page) — discard
    const durationMs = Math.round(performance.now() - this.t0);
    const mime = (this.mimeType || "video/webm").split(";")[0];
    const blob = new Blob(this.chunks, { type: mime });
    const v = this.o.video;
    const trace = {
      mode: this.o.mode,
      dots: this.o.config.dots,
      hits: this.hits,
      completed: this.completed,
      durationMs,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      mirrored: this.mirrored,
      path: this.path,
      mimeType: mime,
      userAgent: navigator.userAgent,
      crop: this.crop,
    };
    this.releaseCamera();
    this.set({ phase: "done" });
    this.o.onFinished({ blob, mimeType: mime, ext: mime.includes("mp4") ? "mp4" : "webm", trace, completed: this.completed });
  }

  // Map a raw-video normalized point to the visible (object-cover, maybe mirrored) frame.
  private toFrame(nx: number, ny: number, W: number, H: number): { x: number; y: number } {
    const v = this.o.video;
    const vw = v.videoWidth || W;
    const vh = v.videoHeight || H;
    const scale = Math.max(W / vw, H / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const ox = (W - dw) / 2;
    const oy = (H - dh) / 2;
    this.crop = { x: round3(-ox / dw), y: round3(-oy / dh), w: round3(W / dw), h: round3(H / dh) };
    let px = ox + nx * dw;
    const py = oy + ny * dh;
    if (this.mirrored) px = W - px;
    return { x: px / W, y: py / H };
  }

  private tick = () => {
    if (this.disposed) return;
    const now = performance.now();
    const canvas = this.o.canvas;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }

    // 1. Track the nose.
    if (this.detector && this.o.video.readyState >= 2 && W > 0) {
      const ts = Math.max(now, this.lastDetectTs + 1); // MediaPipe needs strictly increasing timestamps
      this.lastDetectTs = ts;
      let found: { x: number; y: number } | null = null;
      try {
        const res = this.detector.detectForVideo(this.o.video, ts);
        // Largest face = the contributor (ignore people in the background).
        const face = [...res.detections].sort(
          (a, b) => (b.boundingBox?.width ?? 0) * (b.boundingBox?.height ?? 0) - (a.boundingBox?.width ?? 0) * (a.boundingBox?.height ?? 0),
        )[0];
        const kp = face?.keypoints?.[NOSE_TIP];
        if (kp) found = this.toFrame(kp.x, kp.y, W, H);
      } catch { /* a dropped frame is fine */ }
      if (found) {
        this.nose = this.nose
          ? { x: this.nose.x + (found.x - this.nose.x) * (1 - SMOOTHING), y: this.nose.y + (found.y - this.nose.y) * (1 - SMOOTHING) }
          : found;
      } else {
        this.nose = null;
      }
      if (!!found !== this.state.faceVisible) this.set({ faceVisible: !!found });
    }

    // 2. Advance the task.
    const phase = this.state.phase;
    if (phase === "countdown") {
      const left = this.countdownEnd - now;
      if (left <= 0) this.startRecording();
      else this.set({ countdown: Math.ceil(left / 1000) });
    } else if (phase === "recording") {
      const t = now - this.t0;
      this.set({ elapsedSecs: Math.floor(t / 1000) });
      if (this.nose && t - this.lastSample >= PATH_SAMPLE_MS) {
        this.path.push([Math.round(t), round3(this.nose.x), round3(this.nose.y)]);
        this.lastSample = t;
      }
      const dots = this.o.config.dots;
      if (this.needsTracking && this.state.currentIndex < dots.length) {
        const dot = dots[this.state.currentIndex];
        const onDot = this.nose && Math.hypot((this.nose.x - dot.x) * W, (this.nose.y - dot.y) * H) <= this.o.config.hitRadius * W;
        if (onDot) {
          this.holdStart ??= now;
          if (now - this.holdStart >= this.o.config.holdMs) {
            this.hits.push({ index: this.state.currentIndex, tMs: Math.round(t) });
            this.holdStart = null;
            navigator.vibrate?.(40);
            this.set({ currentIndex: this.state.currentIndex + 1 });
            if (this.state.currentIndex >= dots.length) this.finishAt = now + FINISH_TAIL_MS;
          }
        } else {
          this.holdStart = null;
        }
      }
      if (this.finishAt && now >= this.finishAt) return this.finish(true);
      if (t >= this.o.maxDurationSecs * 1000) {
        // Free recording simply ends at the cap; the dot task is incomplete.
        return this.finish(!this.needsTracking);
      }
    }

    this.draw(W, H, dpr, now);
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(W: number, H: number, dpr: number, now: number) {
    const ctx = this.o.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.needsTracking) return;

    const dots = this.o.config.dots;
    const r = Math.max(14, this.o.config.hitRadius * W);
    const idx = this.state.currentIndex;
    const P = (d: { x: number; y: number }) => ({ x: d.x * W, y: d.y * H });

    // Connected path so far (green) + a faint guide to the next dot.
    ctx.lineCap = "round";
    if (idx > 1) {
      ctx.strokeStyle = "rgba(34,197,94,0.95)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      dots.slice(0, idx).forEach((d, i) => { const p = P(d); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.stroke();
    }
    if (idx > 0 && idx < dots.length) {
      const a = P(dots[idx - 1]); const b = P(dots[idx]);
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    dots.forEach((d, i) => {
      const p = P(d);
      const done = i < idx;
      const current = i === idx && (this.state.phase === "recording" || this.state.phase === "finishing");
      const pulse = current ? 1 + 0.12 * Math.sin(now / 160) : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = done ? "rgba(34,197,94,0.92)" : current ? "rgba(250,204,21,0.35)" : "rgba(255,255,255,0.22)";
      ctx.fill();
      ctx.lineWidth = current ? 4 : 2;
      ctx.strokeStyle = done ? "#16a34a" : current ? "#facc15" : "rgba(255,255,255,0.85)";
      ctx.stroke();
      // Hold progress ring on the current dot.
      if (current && this.holdStart !== null && this.o.config.holdMs > 0) {
        const frac = Math.min(1, (now - this.holdStart) / this.o.config.holdMs);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * pulse + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${Math.round(r * 0.95)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      ctx.fillText(String(i + 1), p.x, p.y + 1);
      ctx.shadowBlur = 0;
    });

    if (this.o.config.showNoseCursor && this.nose) {
      const p = P(this.nose);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#3b82f6";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }
  }
}
