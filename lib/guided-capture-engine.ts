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
/** Framing guide: ok = well inside (green), far = in frame but small, edge = near/over the edge or missing (red), off = no guide. */
export type Framing = "ok" | "far" | "edge" | "off";

export interface CaptureState {
  phase: CapturePhase;
  currentIndex: number; // next dot to connect
  faceVisible: boolean;
  countdown: number; // 3..1 during countdown
  elapsedSecs: number;
  error: string | null;
  framing: Framing;
  framingHint: string;
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
  /** Width ÷ height of the frame (3/4 portrait on phones, 16/9 landscape on laptops). */
  aspect: number;
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
// Output: a steady 30 fps, portrait 3:4. Capable phones record 1080×1440, others
// 720×960 so budget devices don't drop frames while drawing.
const OUTPUT_FPS = 30;
const FILE_BUDGET_BYTES = 45 * 1024 * 1024; // keep under the 50 MB storage file cap (audio + headroom)
function capable(): boolean {
  const n = navigator as Navigator & { deviceMemory?: number };
  return (n.hardwareConcurrency ?? 4) >= 6 && (n.deviceMemory ?? 4) >= 4;
}
/** Widest output frame: portrait 1080 (720 on budget devices), landscape 1920 (1280). */
function outputMaxWidth(aspect: number): number {
  return aspect > 1 ? (capable() ? 1920 : 1280) : capable() ? 1080 : 720;
}
/** Highest bitrate that still fits the longest allowed recording in the file budget. */
function videoBitrate(maxDurationSecs: number, width: number): number {
  const cap = width >= 1080 ? 8_000_000 : 5_000_000;
  const fits = (FILE_BUDGET_BYTES * 8) / Math.max(5, maxDurationSecs) - 160_000; // minus audio
  return Math.round(Math.min(cap, Math.max(1_000_000, fits)));
}
// Framing guide: the detected face box is grown to cover hair, ears and neck, and
// that "head" must sit inside the frame with this margin to count as in frame.
const FRAME_MARGIN = 0.04;
const HEAD_GROW = { side: 0.3, top: 0.6, bottom: 0.35 }; // × face box size
const TOO_CLOSE = 0.62; // face wider than this share of the frame
const TOO_FAR = 0.16; // face narrower than this

type FaceDetectorLike = {
  detectForVideo: (v: HTMLVideoElement | HTMLCanvasElement, ts: number) => { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number }; keypoints: { x: number; y: number }[] }[] };
  close: () => void;
};

// Rounded rectangle path; square corners where canvas roundRect isn't supported.
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const c = ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
  if (c.roundRect) c.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

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

// MP4 (H.264, AAC audio) first: it opens upright in every phone gallery and desktop
// player once downloaded; WebM doesn't play on iPhones or many Windows apps.
function pickMimeType(withAudio: boolean): string {
  const candidates = withAudio
    ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
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
  private state: CaptureState = { phase: "idle", currentIndex: 0, faceVisible: false, countdown: 0, elapsedSecs: 0, error: null, framing: "off", framingHint: "" };
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
  // Recording canvas: the exact 3:4 portrait frame the contributor sees (no dots).
  private recCanvas: HTMLCanvasElement | null = null;
  private recLoop = 0;
  private recVfc = 0;
  private recordingFromCanvas = false;
  // Framing guide
  private head: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private faceW = 0; // face width as a share of the visible frame
  private detCanvas: HTMLCanvasElement | null = null; // centre-square crop for wide frames
  private inFrameMs = 0;
  private lastTick = 0;

  constructor(opts: EngineOpts) {
    this.o = opts;
  }

  private get needsTracking() {
    return this.o.mode === "nose_dots";
  }

  /** The face tracker also powers the framing guide in plain recording. */
  private get wantsFraming() {
    return this.o.config.framingGuide !== false;
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
        video: this.o.aspect > 1
          ? { facingMode: this.o.config.facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: OUTPUT_FPS, max: OUTPUT_FPS } }
          : { facingMode: this.o.config.facing, width: { ideal: 1080 }, height: { ideal: 1440 }, frameRate: { ideal: OUTPUT_FPS, max: OUTPUT_FPS } },
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

    if (this.needsTracking || this.wantsFraming) {
      try {
        this.detector = await loadDetector();
      } catch {
        if (this.needsTracking) {
          this.releaseCamera();
          this.set({ phase: "error", error: "Couldn't load face tracking. Check your internet connection and try again." });
          return;
        }
        this.detector = null; // plain recording still works, just without the guide
      }
    }
    if (!this.detector || !this.wantsFraming) this.set({ framing: "off", framingHint: "" });
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
    this.stopRecLoop();
    try { if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop(); } catch {}
    this.releaseCamera();
  }

  private releaseCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try { this.o.video.srcObject = null; } catch {}
  }

  /**
   * Phones often deliver landscape camera frames (or frames whose rotation only
   * lives in metadata MediaRecorder drops), so recording the raw track can save a
   * sideways/landscape video even though the preview looks portrait. Instead we
   * draw the centre 3:4 crop — exactly what the preview shows — onto a hidden
   * canvas every frame and record that. Dots are never drawn on it.
   */
  private canvasStream(): MediaStream | null {
    const v = this.o.video;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const proto = HTMLCanvasElement.prototype as HTMLCanvasElement & { captureStream?: unknown };
    if (!vw || !vh || typeof proto.captureStream !== "function") return null;
    // Centre crop to the frame's aspect (3:4 portrait or 16:9 landscape), same as the object-cover preview.
    const ar = this.o.aspect;
    let sw = vw, sh = vh;
    if (vw / vh > ar) sw = vh * ar; else sh = vw / ar;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    const outW = Math.round(Math.min(outputMaxWidth(ar), sw) / 2) * 2; // even dims for encoders
    const outH = Math.round(outW / ar / 2) * 2;
    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const draw = () => { try { ctx.drawImage(v, sx, sy, sw, sh, 0, 0, outW, outH); } catch { /* frame not ready */ } };
    draw();
    // Frames are pushed on a fixed 30 fps clock (not per camera frame), so the file
    // is a steady 30 fps even when the camera dips to 15–24 fps in low light.
    const out = (c as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(0);
    const track = out.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    if (!track?.requestFrame) {
      // No manual frame control (rare): let the browser sample the canvas at 30 fps.
      out.getTracks().forEach((t) => t.stop());
      return this.fallbackCanvasStream(c, draw);
    }
    const step = 1000 / OUTPUT_FPS;
    let next = performance.now();
    const onRaf = (now: number) => {
      if (now >= next - 2) {
        draw();
        track.requestFrame!();
        next += step;
        if (now - next > 250) next = now + step; // tab was hidden — don't burst-catch-up
      }
      this.recLoop = requestAnimationFrame(onRaf);
    };
    this.recLoop = requestAnimationFrame(onRaf);
    this.recCanvas = c;
    if (this.o.config.recordAudio && this.stream) this.stream.getAudioTracks().forEach((t) => out.addTrack(t));
    return out;
  }

  /** Older browsers: canvas sampled by the browser at 30 fps, redrawn every animation frame. */
  private fallbackCanvasStream(c: HTMLCanvasElement, draw: () => void): MediaStream {
    const onRaf = () => { draw(); this.recLoop = requestAnimationFrame(onRaf); };
    this.recLoop = requestAnimationFrame(onRaf);
    this.recCanvas = c;
    const out = (c as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(OUTPUT_FPS);
    if (this.o.config.recordAudio && this.stream) this.stream.getAudioTracks().forEach((t) => out.addTrack(t));
    return out;
  }

  private cameraFps(): number {
    const t = this.stream?.getVideoTracks()[0];
    return (t?.getSettings().frameRate as number | undefined) ?? 0;
  }

  private stopRecLoop() {
    cancelAnimationFrame(this.recLoop);
    const v = this.o.video as HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void };
    if (this.recVfc) v.cancelVideoFrameCallback?.(this.recVfc);
    this.recLoop = 0;
    this.recVfc = 0;
  }

  private startRecording() {
    if (!this.stream) return;
    const fromCanvas = this.canvasStream();
    this.recordingFromCanvas = !!fromCanvas;
    // Fallback (very old browsers without canvas capture): the raw camera track.
    const recStream = fromCanvas ?? (this.o.config.recordAudio ? this.stream : new MediaStream(this.stream.getVideoTracks()));
    try {
      this.recorder = new MediaRecorder(recStream, { mimeType: this.mimeType, videoBitsPerSecond: videoBitrate(this.o.maxDurationSecs, this.recCanvas?.width ?? 720) });
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
    this.inFrameMs = 0;
    this.lastTick = 0;
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
    this.stopRecLoop();
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
      videoWidth: this.recordingFromCanvas && this.recCanvas ? this.recCanvas.width : v.videoWidth,
      videoHeight: this.recordingFromCanvas && this.recCanvas ? this.recCanvas.height : v.videoHeight,
      mirrored: this.mirrored,
      path: this.path,
      mimeType: mime,
      userAgent: navigator.userAgent,
      // Canvas recording IS the visible frame, so dot coordinates map 1:1 onto the video.
      crop: this.recordingFromCanvas ? { x: 0, y: 0, w: 1, h: 1 } : this.crop,
      // Output is a fixed 30 fps from the canvas; cameraFps is what the camera actually gave.
      fps: this.recordingFromCanvas ? OUTPUT_FPS : Math.round(this.cameraFps()),
      cameraFps: Math.round(this.cameraFps()),
      orientation: (this.o.aspect > 1 ? "landscape" : "portrait") as "landscape" | "portrait",
      ...(this.state.framing !== "off" && durationMs > 0 ? { framing: { inFramePct: Math.round(Math.min(100, (this.inFrameMs / durationMs) * 100)) } } : {}),
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
        // Wide (laptop) frames: the face model is tuned for selfies and squeezes the whole
        // frame to a small square, so a webcam face gets too small to find. Feed it the
        // centre square instead (where the person sits) and map results back.
        const v = this.o.video;
        const vw0 = v.videoWidth, vh0 = v.videoHeight;
        const square = vw0 > vh0 * 1.2;
        let source: HTMLVideoElement | HTMLCanvasElement = v;
        const side = square ? vh0 : 0, sx = square ? (vw0 - vh0) / 2 : 0;
        if (square) {
          const DET = 480;
          this.detCanvas ??= Object.assign(document.createElement("canvas"), { width: DET, height: DET });
          this.detCanvas.getContext("2d")?.drawImage(v, sx, 0, side, side, 0, 0, DET, DET);
          source = this.detCanvas;
        }
        const raw = this.detector.detectForVideo(source, ts);
        // Express everything in the full video's coordinates again.
        const k = square ? side / 480 : 1;
        const res = !square ? raw : {
          detections: raw.detections.map((d) => ({
            boundingBox: d.boundingBox && { originX: sx + d.boundingBox.originX * k, originY: d.boundingBox.originY * k, width: d.boundingBox.width * k, height: d.boundingBox.height * k },
            keypoints: d.keypoints.map((p) => ({ x: (sx + p.x * side) / vw0, y: p.y })),
          })),
        };
        // Largest face = the contributor (ignore people in the background).
        const face = [...res.detections].sort(
          (a, b) => (b.boundingBox?.width ?? 0) * (b.boundingBox?.height ?? 0) - (a.boundingBox?.width ?? 0) * (a.boundingBox?.height ?? 0),
        )[0];
        const kp = face?.keypoints?.[NOSE_TIP];
        if (kp) found = this.toFrame(kp.x, kp.y, W, H);
        const bb = face?.boundingBox;
        const vw = this.o.video.videoWidth, vh = this.o.video.videoHeight;
        if (bb && vw && vh) {
          const g = HEAD_GROW;
          const a = this.toFrame((bb.originX - bb.width * g.side) / vw, (bb.originY - bb.height * g.top) / vh, W, H);
          const b = this.toFrame((bb.originX + bb.width * (1 + g.side)) / vw, (bb.originY + bb.height * (1 + g.bottom)) / vh, W, H);
          this.head = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
          this.faceW = (bb.width / vw) / (this.crop.w || 1);
        } else {
          this.head = null;
        }
      } catch { /* a dropped frame is fine */ }
      if (found) {
        this.nose = this.nose
          ? { x: this.nose.x + (found.x - this.nose.x) * (1 - SMOOTHING), y: this.nose.y + (found.y - this.nose.y) * (1 - SMOOTHING) }
          : found;
      } else {
        this.nose = null;
      }
      if (!!found !== this.state.faceVisible) this.set({ faceVisible: !!found });
      if (this.wantsFraming) this.updateFraming();
    }

    // 2. Advance the task.
    const phase = this.state.phase;
    if (phase === "countdown") {
      const left = this.countdownEnd - now;
      if (left <= 0) this.startRecording();
      else this.set({ countdown: Math.ceil(left / 1000) });
    } else if (phase === "recording") {
      const t = now - this.t0;
      if (this.lastTick && (this.state.framing === "ok" || this.state.framing === "far")) this.inFrameMs += now - this.lastTick;
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

    this.lastTick = now;
    this.draw(W, H, dpr, now);
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Where is the person relative to the frame edges? Sets the colour + hint. */
  private updateFraming() {
    const h = this.head;
    // The dot task moves the head around on purpose — only warn there when actually cut off.
    const m = this.needsTracking ? 0 : FRAME_MARGIN;
    let framing: Framing = "ok";
    let hint = "You're in the frame";
    // Face size relative to the frame's short side (width in portrait, height in landscape).
    const faceShort = this.faceW * Math.max(1, this.o.aspect);
    if (!h) { framing = "edge"; hint = "Move into the frame so we can see your face"; }
    else if (faceShort > TOO_CLOSE || (h.y1 - h.y0) > 1 - 2 * m + 0.15) { framing = "edge"; hint = "Move back a little"; }
    else if (h.x0 < m) { framing = "edge"; hint = "Move a little to the right"; }
    else if (h.x1 > 1 - m) { framing = "edge"; hint = "Move a little to the left"; }
    else if (h.y0 < m) { framing = "edge"; hint = "Move down a little — your head is cut off"; }
    else if (h.y1 > 1 - m) { framing = "edge"; hint = "Move up a little"; }
    else if (!this.needsTracking && faceShort < TOO_FAR) { framing = "far"; hint = "Come a bit closer"; }
    this.set({ framing, framingHint: hint });
  }

  /** Coloured frame border, on screen only (never in the video). The hint text is shown by the UI. */
  private drawFraming(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const f = this.state.framing;
    const phase = this.state.phase;
    if (f === "off" || !(phase === "ready" || phase === "countdown" || phase === "recording")) return;
    const color = f === "ok" ? "#22c55e" : f === "far" ? "#f59e0b" : "#ef4444";
    const inset = 5, r = 18;
    ctx.save();
    ctx.lineWidth = f === "ok" ? 5 : 7;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = f === "ok" ? 6 : 14;
    ctx.beginPath();
    rrect(ctx, inset, inset, W - inset * 2, H - inset * 2, r);
    ctx.stroke();
    ctx.restore();
  }

  private draw(W: number, H: number, dpr: number, now: number) {
    const ctx = this.o.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.drawFraming(ctx, W, H);
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
