// Browser-only: turn any submitted video into a plain, upright MP4.
//
// Why: in-app captures used to be WebM (won't open on iPhones / many Windows
// apps), and phone uploads are often stored sideways with a "rotate 90°" flag
// that some players ignore. The browser already plays both the right way up, so
// we play the file into a canvas at its displayed size and record that as H.264
// MP4 — the rotation is baked into the pixels. Runs in real time (a 30s clip
// takes ~30s) and never leaves the admin's browser.

const MP4_TYPES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a", "video/mp4;codecs=avc1", "video/mp4"];
const MAX_LONG_SIDE = 1280;

export function mp4Type(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  const proto = HTMLCanvasElement.prototype as HTMLCanvasElement & { captureStream?: unknown };
  if (typeof proto.captureStream !== "function") return null;
  return MP4_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export async function toPortraitMp4(url: string, onProgress?: (pct: number) => void): Promise<Blob> {
  const type = mp4Type();
  if (!type) throw new Error("This browser can't make MP4 files. Use Chrome or Safari.");

  // Local copy so the canvas isn't blocked by cross-origin rules.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't fetch the video (HTTP ${res.status}).`);
  const src = URL.createObjectURL(await res.blob());

  const video = document.createElement("video");
  video.src = src;
  video.playsInline = true;
  video.preload = "auto";
  await new Promise<void>((ok, fail) => {
    video.onloadedmetadata = () => ok();
    video.onerror = () => fail(new Error("This video can't be played in the browser."));
  });

  // videoWidth/Height are the *displayed* size, i.e. with any rotation flag applied.
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
  const w = Math.round((video.videoWidth * scale) / 2) * 2;
  const h = Math.round((video.videoHeight * scale) / 2) * 2;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);

  // Sound: route the video's audio into the recording only (nothing plays out loud).
  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    audioCtx.createMediaElementSource(video).connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  } catch { /* silent video or no audio support — record picture only */ }

  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((ok) => { recorder.onstop = () => ok(new Blob(chunks, { type: "video/mp4" })); });

  const draw = () => ctx.drawImage(video, 0, 0, w, h);
  const vfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback?.bind(video);
  let raf = 0;
  const loop = () => {
    draw();
    if (video.duration) onProgress?.(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
    if (!video.ended) { if (vfc) vfc(loop); else raf = requestAnimationFrame(loop); }
  };

  draw();
  recorder.start(1000);
  await video.play();
  loop();
  await new Promise<void>((ok) => { video.onended = () => ok(); });
  draw();
  cancelAnimationFrame(raf);
  recorder.stop();
  const blob = await done;
  audioCtx?.close().catch(() => {});
  URL.revokeObjectURL(src);
  onProgress?.(100);
  return blob;
}

/** Save a blob under a name, as a normal browser download. */
export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
