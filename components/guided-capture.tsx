"use client";

// Contributor UI for in-app recording: plain camera recording ("camera") or the
// guided connect-the-dots-with-your-nose task ("nose_dots"). The saved video is
// the CLEAN camera feed — the dots are only drawn on a canvas over the preview.
// See lib/guided-capture-engine.ts for the tracking/recording logic.

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RotateCcw, Square, CheckCircle2, AlertCircle, ScanFace, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuidedCaptureEngine, type CaptureState, type CaptureResult } from "@/lib/guided-capture-engine";
import { captureAspect, type CaptureConfig, type CaptureMode } from "@/lib/project-config";

interface Props {
  mode: Exclude<CaptureMode, "upload">;
  config: CaptureConfig;
  minDurationSecs: number;
  maxDurationSecs: number;
  disabled?: boolean;
  /** A finished, usable recording. */
  onCaptured: (r: CaptureResult) => void;
  /** Contributor chose to record again — discard the previous one. */
  onRetake: () => void;
}

const INITIAL: CaptureState = { phase: "idle", currentIndex: 0, faceVisible: false, countdown: 0, elapsedSecs: 0, error: null, framing: "off", framingHint: "" };

export function GuidedCapture({ mode, config, minDurationSecs, maxDurationSecs, disabled, onCaptured, onRetake }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GuidedCaptureEngine | null>(null);
  const [st, setSt] = useState<CaptureState>(INITIAL);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const isDots = mode === "nose_dots";
  const total = config.dots.length;
  // Phone vs laptop/desktop decides the frame shape (and whether a laptop-only project can be recorded here).
  const [onPhone] = useState(() => typeof window !== "undefined" && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820)));
  const aspect = captureAspect(config.device, onPhone);
  const landscape = aspect > 1;
  const [copied, setCopied] = useState(false);

  // Release the camera when leaving the page.
  useEffect(() => () => engineRef.current?.dispose(), []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const handleFinished = (r: CaptureResult) => {
    setPreviewUrl(URL.createObjectURL(r.blob));
    const secs = r.trace.durationMs / 1000;
    if (isDots && !r.completed) {
      setProblem(`Time ran out after ${Math.round(secs)}s — you connected ${r.trace.hits.length} of ${total} dots. Tap “Record again” to retry.`);
      return;
    }
    if (secs < minDurationSecs) {
      setProblem(`That recording is only ${Math.round(secs)}s — it needs to be at least ${minDurationSecs}s. Tap “Record again”.`);
      return;
    }
    if (!r.blob.size) {
      setProblem("Nothing was recorded. Tap “Record again”.");
      return;
    }
    setProblem(null);
    onCaptured(r);
  };

  const open = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    engineRef.current?.dispose();
    setProblem(null);
    const engine = new GuidedCaptureEngine({
      video: videoRef.current,
      canvas: canvasRef.current,
      mode,
      config,
      aspect,
      maxDurationSecs,
      onState: setSt,
      onFinished: handleFinished,
    });
    engineRef.current = engine;
    await engine.start();
  };

  const retake = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setPreviewUrl(null);
    setProblem(null);
    setSt(INITIAL);
    onRetake();
  };

  const live = st.phase === "ready" || st.phase === "countdown" || st.phase === "recording" || st.phase === "finishing";
  const done = st.phase === "done";

  let hint = "";
  // Framing guide: the border is green when you're well inside the frame, red near the edge.
  const framingOn = st.framing !== "off";
  const framingBad = st.framing === "edge" || st.framing === "far";
  if (st.phase === "ready") {
    hint = isDots
      ? (st.faceVisible ? "Face found. Tap Start when you're ready." : "Fit your whole face inside the frame.")
      : framingOn ? (framingBad ? st.framingHint : "You're in the frame — tap Start when ready.") : "Tap Start to begin recording.";
  } else if (st.phase === "countdown") hint = framingBad ? st.framingHint : "Get ready…";
  else if (st.phase === "recording") {
    if (isDots) hint = !st.faceVisible ? "We can't see your face — move back into the frame." : st.currentIndex < total ? `Move your nose to dot ${st.currentIndex + 1}` : "All dots connected!";
    else hint = framingBad ? st.framingHint : "Recording… stay inside the green frame.";
  } else if (st.phase === "finishing") hint = "Saving your video…";

  // Laptop-only project opened on a phone: ask them to switch devices.
  if (config.device === "laptop" && onPhone) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center dark:border-amber-900 dark:bg-amber-500/10">
        <Laptop size={30} className="mx-auto mb-2 text-amber-600" />
        <p className="font-semibold text-foreground">Please record this on a laptop or computer</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">This project records in landscape with a webcam. Open this page on a laptop or desktop, log in, and record there.</p>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700">
          {copied ? "Link copied" : "Copy this page's link"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={`relative mx-auto w-full overflow-hidden rounded-2xl bg-zinc-900 ${landscape ? "max-w-3xl" : "max-w-sm"}`}
        style={{ aspectRatio: String(aspect) }}
      >
        {/* Live preview (mirrored like a mirror for the selfie camera). Hidden once done. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${config.facing === "user" ? "-scale-x-100" : ""} ${done ? "hidden" : ""}`}
        />
        {/* Dots overlay — drawn here only, never recorded. */}
        <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 h-full w-full ${done ? "hidden" : ""}`} />

        {done && previewUrl && (
          <video src={previewUrl} controls playsInline className="absolute inset-0 h-full w-full bg-black object-contain" />
        )}

        {/* Idle / loading / error cover */}
        {(st.phase === "idle" || st.phase === "starting" || st.phase === "error") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            {st.phase === "starting" ? (
              <>
                <Loader2 size={32} className="animate-spin" />
                <p className="text-sm">{isDots ? "Opening camera and face tracking…" : "Opening camera…"}</p>
                {isDots && <p className="text-xs text-zinc-400">First time can take a little while on slow data.</p>}
              </>
            ) : st.phase === "error" ? (
              <>
                <AlertCircle size={32} className="text-red-400" />
                <p className="text-sm">{st.error}</p>
                <Button type="button" onClick={open} className="bg-white text-zinc-900 hover:bg-zinc-100">Try again</Button>
              </>
            ) : (
              <>
                {isDots ? <ScanFace size={40} className="opacity-80" /> : <Camera size={40} className="opacity-80" />}
                <p className="text-sm font-medium">
                  {isDots ? `Connect ${total} numbered dot${total === 1 ? "" : "s"} with your nose` : "Record your video right here"}
                </p>
                {isDots && (
                  <p className="text-xs text-zinc-300">
                    Each dot turns green when your nose touches it. Recording stops and saves by itself after the last dot.
                    {config.showNoseCursor ? " The blue dot shows where your nose is." : ""}
                  </p>
                )}
                <Button type="button" disabled={disabled} onClick={open} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Camera size={16} className="mr-2" />Open camera
                </Button>
              </>
            )}
          </div>
        )}

        {/* Countdown */}
        {st.phase === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-7xl font-bold text-white drop-shadow-lg">{st.countdown}</span>
          </div>
        )}

        {/* Top bar: REC + progress */}
        {(st.phase === "recording" || st.phase === "finishing") && (
          <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 py-2 text-xs font-medium text-white">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />REC {st.elapsedSecs}s / {maxDurationSecs}s
            </span>
            {isDots && <span>{Math.min(st.currentIndex, total)} / {total} dots</span>}
          </div>
        )}

        {/* Bottom hint */}
        {live && hint && (
          <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t px-3 pb-3 pt-6 text-center text-sm font-medium text-white ${!isDots && framingBad ? (st.framing === "far" ? "from-amber-600/85" : "from-red-600/85") : "from-black/70"} to-transparent`}>
            {hint}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mx-auto flex max-w-sm flex-wrap items-center justify-center gap-2">
        {st.phase === "ready" && (
          <Button type="button" onClick={() => engineRef.current?.begin()} disabled={isDots && !st.faceVisible} className="bg-red-600 hover:bg-red-700 text-white">
            <span className="mr-2 h-2.5 w-2.5 rounded-full bg-white" />Start recording
          </Button>
        )}
        {st.phase === "recording" && !isDots && (
          <Button
            type="button"
            onClick={() => engineRef.current?.stop()}
            disabled={st.elapsedSecs < minDurationSecs}
            className="bg-zinc-800 hover:bg-zinc-900 text-white"
          >
            <Square size={14} className="mr-2" />
            {st.elapsedSecs < minDurationSecs ? `Stop (after ${minDurationSecs}s)` : "Stop & save"}
          </Button>
        )}
        {(st.phase === "recording" || st.phase === "countdown") && isDots && (
          <Button type="button" variant="outline" onClick={retake}>
            <RotateCcw size={14} className="mr-2" />Restart
          </Button>
        )}
        {done && (
          <Button type="button" variant="outline" onClick={retake} disabled={disabled}>
            <RotateCcw size={14} className="mr-2" />Record again
          </Button>
        )}
      </div>

      {done && !problem && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-green-600">
          <CheckCircle2 size={16} />{isDots ? "All dots connected — video saved." : "Video saved."}
        </p>
      )}
      {problem && <p className="text-center text-sm text-red-600">{problem}</p>}
    </div>
  );
}
