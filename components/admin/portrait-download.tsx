"use client";

// "Portrait MP4" next to a video's Save link: converts in the browser and downloads.

import { useState } from "react";
import { Smartphone } from "lucide-react";
import { mp4Type, saveBlob, toPortraitMp4 } from "@/lib/portrait-mp4";

export function PortraitMp4Button({ url, name }: { url: string; name: string }) {
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState("");
  if (typeof window !== "undefined" && !mp4Type()) return null;

  const run = async () => {
    setErr(""); setPct(0);
    try {
      const blob = await toPortraitMp4(url, setPct);
      saveBlob(blob, name.replace(/\.[a-z0-9]+$/i, "") + ".mp4");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setPct(null);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={pct !== null}
      title={err || "Download as an upright MP4 that opens on any phone or computer (converts in your browser, takes as long as the video)"}
      className="inline-flex shrink-0 items-center gap-1 text-xs text-violet-600 hover:underline disabled:no-underline disabled:opacity-70"
    >
      <Smartphone size={12} />
      {pct !== null ? `Converting ${pct}%` : err ? "Retry MP4" : "Portrait MP4"}
    </button>
  );
}
