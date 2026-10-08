// Mini replay of a guided capture: the dot pattern plus the nose path the
// contributor actually traced, in the same 3:4 frame they saw. Used on the admin
// review page and the client (org) review page.

import { CAPTURE_ASPECT, dotZone, type CaptureTrace } from "@/lib/project-config";

export function CaptureTraceView({ trace }: { trace: CaptureTrace }) {
  const landscape = trace.videoWidth > 0 && trace.videoHeight > 0 && trace.videoWidth > trace.videoHeight;
  const W = landscape ? 180 : 120;
  const H = trace.videoWidth > 0 && trace.videoHeight > 0 ? (W * trace.videoHeight) / trace.videoWidth : W / CAPTURE_ASPECT;
  const pts = trace.path.map(([, x, y]) => `${(x * W).toFixed(1)},${(y * H).toFixed(1)}`).join(" ");
  const z = dotZone(W, H);
  const hitAt = new Map(trace.hits.map((h) => [h.index, h.tMs]));
  return (
    <div className="flex gap-3 items-start">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="rounded-lg bg-zinc-900 shrink-0">
        {pts && <polyline points={pts} fill="none" stroke="#60a5fa" strokeWidth={1.2} strokeOpacity={0.8} />}
        {trace.dots.map((d, i) => (
          <g key={i}>
            <circle cx={z.x0 + d.x * z.w} cy={d.y * H} r={7} fill={hitAt.has(i) ? "#22c55e" : "rgba(255,255,255,0.25)"} stroke="#fff" strokeWidth={1} />
            <text x={z.x0 + d.x * z.w} y={d.y * H + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff">{i + 1}</text>
          </g>
        ))}
      </svg>
      <div className="text-xs text-zinc-500 space-y-0.5 min-w-0">
        <p className={trace.completed ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
          {trace.mode === "nose_dots"
            ? `${trace.hits.length}/${trace.dots.length} dots connected${trace.completed ? "" : " (incomplete)"}`
            : "In-app recording"}
        </p>
        <p>Length {(trace.durationMs / 1000).toFixed(1)}s · {trace.videoWidth}×{trace.videoHeight}{trace.fps ? ` · ${trace.fps} fps` : ""}{trace.mirrored ? " · selfie (mirrored view)" : ""}</p>
        {trace.framing && (
          <p className={trace.framing.inFramePct >= 90 ? "text-green-600" : trace.framing.inFramePct >= 70 ? "text-amber-600" : "text-red-600"}>
            In frame {trace.framing.inFramePct}% of the time
          </p>
        )}
        {trace.hits.length > 0 && (
          <p className="break-words">Dot times: {trace.hits.map((h) => `${h.index + 1}@${(h.tMs / 1000).toFixed(1)}s`).join(" · ")}</p>
        )}
      </div>
    </div>
  );
}
