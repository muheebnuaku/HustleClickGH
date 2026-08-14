// Client-only: sample still frames from a local File (video/image) as small
// JPEG data URLs. Extracting from the LOCAL file (blob URL) avoids any storage
// CORS issue, and multiple frames across a video's timeline let the AI see the
// action progression (e.g. smile → neutral → head turn), not just one moment.

function toJpeg(src: CanvasImageSource, w: number, h: number): string | null {
  try {
    const max = 768;
    const scale = Math.min(1, max / Math.max(w || max, h || max));
    const cw = Math.max(1, Math.round((w || max) * scale));
    const ch = Math.max(1, Math.round((h || max) * scale));
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, cw, ch);
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

function imageFrame(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(toJpeg(img, img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function videoFrames(url: string, count: number): Promise<string[]> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.src = url;
    const frames: string[] = [];
    let times: number[] = [];
    let i = 0;
    const done = () => resolve(frames);
    const overall = setTimeout(done, 15000);

    v.onloadedmetadata = () => {
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
      // Evenly spaced across the clip (skip the very edges).
      times = Array.from({ length: count }, (_, k) => ((k + 1) / (count + 1)) * dur);
      seekNext();
    };
    const seekNext = () => {
      if (i >= times.length) { clearTimeout(overall); return done(); }
      try { v.currentTime = Math.max(0.05, Math.min(times[i], (v.duration || 1) - 0.05)); }
      catch { clearTimeout(overall); done(); }
    };
    v.onseeked = () => {
      const f = toJpeg(v, v.videoWidth, v.videoHeight);
      if (f) frames.push(f);
      i++;
      seekNext();
    };
    v.onerror = () => { clearTimeout(overall); done(); };
  });
}

/** Extract up to `maxFrames` JPEG frames from a local file (video/image). */
export async function extractFramesFromFile(file: File | Blob, maxFrames = 2): Promise<string[]> {
  if (typeof window === "undefined") return [];
  const type = (file instanceof File ? file.type : file.type) || "";
  const url = URL.createObjectURL(file);
  try {
    if (type.startsWith("image")) {
      const f = await imageFrame(url);
      return f ? [f] : [];
    }
    if (type.startsWith("video")) {
      return await videoFrames(url, maxFrames);
    }
    return [];
  } finally {
    URL.revokeObjectURL(url);
  }
}
