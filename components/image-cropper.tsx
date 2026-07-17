"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, RotateCcw, Check, X } from "lucide-react";

const VIEWPORT = 280; // on-screen crop area (px)
const OUTPUT = 400; // exported image size (px)

interface ImageCropperProps {
  src: string; // raw image data URL to crop
  onCancel: () => void;
  onCropComplete: (dataUrl: string) => void;
}

/**
 * Circular avatar cropper. Drag to reposition, slider (or wheel) to zoom.
 * Outputs a square JPEG data URL. No external dependencies.
 */
export function ImageCropper({ src, onCancel, onCropComplete }: ImageCropperProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // base "cover" scale so the image always fills the viewport at zoom = 1
  const baseScale = natural ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h) : 1;
  const scale = baseScale * zoom;
  const dw = natural ? natural.w * scale : VIEWPORT;
  const dh = natural ? natural.h * scale : VIEWPORT;

  const clamp = useCallback(
    (x: number, y: number) => {
      const minX = VIEWPORT - dw;
      const minY = VIEWPORT - dh;
      return {
        x: Math.min(0, Math.max(minX, x)),
        y: Math.min(0, Math.max(minY, y)),
      };
    },
    [dw, dh]
  );

  // center the image whenever the image loads or zoom changes
  useEffect(() => {
    if (!natural) return;
    setOffset((prev) => clamp(prev.x, prev.y));
  }, [natural, zoom, clamp]);

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    const bScale = Math.max(VIEWPORT / w, VIEWPORT / h);
    setNatural({ w, h });
    // center
    setOffset({ x: (VIEWPORT - w * bScale) / 2, y: (VIEWPORT - h * bScale) / 2 });
    setZoom(1);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const nx = drag.current.ox + (e.clientX - drag.current.x);
    const ny = drag.current.oy + (e.clientY - drag.current.y);
    setOffset(clamp(nx, ny));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const reset = () => {
    if (!natural) return;
    setZoom(1);
    setOffset({ x: (VIEWPORT - natural.w * baseScale) / 2, y: (VIEWPORT - natural.h * baseScale) / 2 });
  };

  const confirm = () => {
    if (!natural || !imgRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const f = OUTPUT / VIEWPORT;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgRef.current, offset.x * f, offset.y * f, dw * f, dh * f);
    onCropComplete(canvas.toDataURL("image/jpeg", 0.9));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground">Adjust your photo</h3>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Crop viewport */}
        <div
          className="relative mx-auto overflow-hidden bg-zinc-100 dark:bg-zinc-800 touch-none select-none cursor-grab active:cursor-grabbing"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt="Crop preview"
            onLoad={handleImgLoad}
            draggable={false}
            style={{
              position: "absolute",
              left: offset.x,
              top: offset.y,
              width: dw,
              height: dh,
              maxWidth: "none",
            }}
          />
          {/* Circular mask overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
              borderRadius: "9999px",
            }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80" />
        </div>

        {/* Zoom control */}
        <div className="flex items-center gap-3 mt-5">
          <ZoomIn size={18} className="text-zinc-500 shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full accent-green-600"
          />
          <button onClick={reset} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 shrink-0" aria-label="Reset" title="Reset">
            <RotateCcw size={16} />
          </button>
        </div>

        <p className="text-xs text-zinc-500 text-center mt-2">Drag to reposition · slide to zoom</p>

        <div className="flex gap-3 mt-5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={confirm}>
            <Check size={16} /> Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
