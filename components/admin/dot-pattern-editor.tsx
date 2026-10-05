"use client";

// Admin editor for the guided nose-dot task: click the frame to add a dot, drag
// dots to move them, remove/reorder from the list. The frame has the same 3:4
// shape contributors see, and dots are drawn at their real hit size.

import { useRef, useState } from "react";
import { Trash2, ArrowUp, ArrowDown, RotateCcw, Shuffle, X } from "lucide-react";
import {
  CAPTURE_ASPECT, DEFAULT_CAPTURE_CONFIG, MAX_DOTS, round3, type CaptureConfig, type CaptureDot,
} from "@/lib/project-config";

interface Props {
  value: CaptureConfig;
  onChange: (c: CaptureConfig) => void;
  /** "camera" mode has no dots — only camera settings are shown. */
  showDots: boolean;
}

const clamp01 = (n: number) => Math.min(0.97, Math.max(0.03, n));

export function DotPatternEditor({ value, onChange, showDots }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const dots = value.dots;

  const setDots = (next: CaptureDot[]) => onChange({ ...value, dots: next });
  const pointFrom = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: round3(clamp01((e.clientX - r.left) / r.width)), y: round3(clamp01((e.clientY - r.top) / r.height)) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    const p = pointFrom(e);
    const radiusPx = Math.max(14, value.hitRadius * r.width);
    // Grab the top-most dot under the pointer, else add a new one there.
    let hit = -1;
    for (let i = dots.length - 1; i >= 0; i--) {
      if (Math.hypot((dots[i].x - p.x) * r.width, (dots[i].y - p.y) * r.height) <= radiusPx) { hit = i; break; }
    }
    if (hit === -1) {
      if (dots.length >= MAX_DOTS) return;
      hit = dots.length;
      setDots([...dots, p]);
    }
    setSelected(hit);
    dragRef.current = hit;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const i = dragRef.current;
    if (i === null) return;
    const p = pointFrom(e);
    setDots(dots.map((d, k) => (k === i ? p : d)));
  };

  const endDrag = () => { dragRef.current = null; };

  const remove = (i: number) => {
    setDots(dots.filter((_, k) => k !== i));
    setSelected(null);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= dots.length) return;
    const next = [...dots];
    [next[i], next[j]] = [next[j], next[i]];
    setDots(next);
    setSelected(j);
  };

  const randomize = () => {
    // Spread-out random points (min gap so dots never overlap).
    const n = Math.max(1, dots.length || 5);
    const out: CaptureDot[] = [];
    for (let tries = 0; out.length < n && tries < 500; tries++) {
      const d = { x: round3(0.12 + Math.random() * 0.76), y: round3(0.12 + Math.random() * 0.76) };
      if (out.every((o) => Math.hypot(o.x - d.x, (o.y - d.y) * (1 / CAPTURE_ASPECT)) > value.hitRadius * 3)) out.push(d);
    }
    setDots(out);
    setSelected(null);
  };

  const chip = "inline-flex items-center gap-1 text-xs font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800";
  const selectCls = "w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-4">
      {showDots && (
        <div className="flex flex-col md:flex-row gap-4">
          {/* Frame */}
          <div className="w-full max-w-[280px] mx-auto md:mx-0 shrink-0">
            <div
              ref={boxRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="relative w-full select-none touch-none cursor-crosshair overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-700 to-zinc-900"
              style={{ aspectRatio: String(CAPTURE_ASPECT) }}
            >
              {/* Face guide so dots can be placed relative to where a head sits */}
              <svg viewBox="0 0 300 400" className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
                <ellipse cx="150" cy="185" rx="78" ry="102" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" strokeDasharray="8 8" />
                <path d="M40 400 C60 320 110 300 150 300 C190 300 240 320 260 400" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
              </svg>
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
                <polyline
                  points={dots.map((d) => `${d.x},${d.y}`).join(" ")}
                  fill="none" stroke="rgba(250,204,21,0.7)" strokeWidth={2} strokeDasharray="6 5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {dots.map((d, i) => (
                <div
                  key={i}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center font-bold text-white pointer-events-none ${
                    selected === i ? "bg-blue-500/60 ring-4 ring-blue-300" : "bg-white/20 ring-2 ring-white"
                  }`}
                  style={{
                    left: `${d.x * 100}%`,
                    top: `${d.y * 100}%`,
                    width: `max(28px, ${value.hitRadius * 200}%)`,
                    aspectRatio: "1",
                    fontSize: 14,
                    textShadow: "0 1px 3px rgba(0,0,0,.7)",
                  }}
                >
                  {i + 1}
                </div>
              ))}
              {selected !== null && dots[selected] && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => remove(selected)}
                  className="absolute z-10 bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white shadow"
                >
                  <X size={13} />Remove dot {selected + 1}
                </button>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1.5 text-center">Tap empty space to add · drag to move · select a dot to remove it</p>
          </div>

          {/* Dot list + tools */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={chip} onClick={() => { onChange({ ...value, dots: DEFAULT_CAPTURE_CONFIG.dots }); setSelected(null); }}>
                <RotateCcw size={13} />5-dot pattern
              </button>
              <button type="button" className={chip} onClick={randomize}><Shuffle size={13} />Randomize</button>
              <button type="button" className={`${chip} text-red-600`} onClick={() => { setDots([]); setSelected(null); }}>
                <Trash2 size={13} />Clear all
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              {dots.length} dot{dots.length === 1 ? "" : "s"} (max {MAX_DOTS}). Contributors connect them in this order.
            </p>
            {dots.length > 0 && (
              <ol className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {dots.map((d, i) => (
                  <li
                    key={i}
                    onClick={() => setSelected(i)}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-xs cursor-pointer ${selected === i ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20" : "border-zinc-200 dark:border-zinc-800"}`}
                  >
                    <span className="w-6 h-6 rounded-full bg-zinc-800 text-white flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                    <span className="text-zinc-500 flex-1 truncate">{Math.round(d.x * 100)}% across · {Math.round(d.y * 100)}% down</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); move(i, -1); }} disabled={i === 0} className="p-1 text-zinc-400 hover:text-foreground disabled:opacity-30" title="Move earlier"><ArrowUp size={13} /></button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); move(i, 1); }} disabled={i === dots.length - 1} className="p-1 text-zinc-400 hover:text-foreground disabled:opacity-30" title="Move later"><ArrowDown size={13} /></button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); remove(i); }} className="p-1 text-red-500 hover:text-red-700" title="Remove"><Trash2 size={13} /></button>
                  </li>
                ))}
              </ol>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-600">Dot size (how close the nose must get)</label>
                <select className={selectCls} value={value.hitRadius} onChange={(e) => onChange({ ...value, hitRadius: Number(e.target.value) })}>
                  <option value={0.05}>Small — precise</option>
                  <option value={0.08}>Medium</option>
                  <option value={0.11}>Large — easiest</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-600">Hold on each dot</label>
                <select className={selectCls} value={value.holdMs} onChange={(e) => onChange({ ...value, holdMs: Number(e.target.value) })}>
                  <option value={0}>Instant</option>
                  <option value={400}>0.4 s</option>
                  <option value={800}>0.8 s</option>
                  <option value={1500}>1.5 s</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
              <input type="checkbox" checked={value.showNoseCursor} onChange={(e) => onChange({ ...value, showNoseCursor: e.target.checked })} className="w-4 h-4 rounded" />
              Show a marker where the contributor&apos;s nose is (recommended — much easier)
            </label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-zinc-600">Camera</label>
          <select className={selectCls} value={value.facing} onChange={(e) => onChange({ ...value, facing: e.target.value as CaptureConfig["facing"] })}>
            <option value="user">Front (selfie)</option>
            <option value="environment">Back</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer sm:mt-6">
          <input type="checkbox" checked={value.recordAudio} onChange={(e) => onChange({ ...value, recordAudio: e.target.checked })} className="w-4 h-4 rounded" />
          Record sound too
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        The saved video is the clean camera feed — dots are only shown on screen, never recorded. Dot positions and the time each was connected are saved with every submission.
      </p>
    </div>
  );
}
