// Official HustleClickGH social accounts (configured in SITE_CONFIG.social):
// brand icons, a compact icon row (footer) and full cards (landing page).

import { SITE_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

type SocialKey = "tiktok" | "youtube" | "whatsapp" | "instagram" | "facebook" | "x" | "linkedin";

// Simple brand marks (24×24, currentColor).
const ICON_PATHS: Record<SocialKey, string> = {
  tiktok: "M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.59-2.6 2.6 2.6 0 0 1 3.37-2.48V9.66A5.73 5.73 0 0 0 4.1 15.3a5.7 5.7 0 0 0 5.77 5.7 5.7 5.7 0 0 0 5.68-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.25-1.48z",
  youtube: "M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z",
  whatsapp: "M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-.9 1.2-.3.2-.6.1a8.2 8.2 0 0 1-2.4-1.5 9 9 0 0 1-1.7-2.1c-.2-.3 0-.5.1-.6l.4-.5.3-.5a.6.6 0 0 0 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c.7.3 1.3.5 1.7.6a4.2 4.2 0 0 0 1.9.1 3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.1-.3-.2-.6-.3zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm8.4-18.2A11.8 11.8 0 0 0 1.7 17.8L0 24l6.4-1.7a11.8 11.8 0 0 0 5.6 1.4A11.8 11.8 0 0 0 20.4 3.6z",
  instagram: "M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9z",
  facebook: "M24 12.1A12 12 0 1 0 10.1 24v-8.4H7.1v-3.5h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.3h3.4l-.5 3.5h-2.9V24A12 12 0 0 0 24 12.1z",
  x: "M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.8 2.3h7l4.8 6.4 5.6-6.4zm-1.2 17.9h1.9L7 4.2H5z",
  linkedin: "M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.4V9h3.4v1.6h.1a3.8 3.8 0 0 1 3.4-1.9c3.6 0 4.3 2.4 4.3 5.5v6.3zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zm1.8 13.1H3.6V9h3.5v11.5zM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0z",
};

// Brand colour chip per platform (static strings so Tailwind generates them).
const BRAND: Record<SocialKey, string> = {
  tiktok: "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900",
  youtube: "bg-red-600 text-white",
  whatsapp: "bg-emerald-500 text-white",
  instagram: "bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600 text-white",
  facebook: "bg-blue-600 text-white",
  x: "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900",
  linkedin: "bg-sky-700 text-white",
};

export function SocialIcon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const d = ICON_PATHS[name as SocialKey];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden className={className}>
      <path d={d} />
    </svg>
  );
}

/** Compact round icon links (footer). */
export function SocialIconRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {SITE_CONFIG.social.map((s) => (
        <a
          key={s.key}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`HustleClickGH on ${s.label}`}
          title={`${s.label} · ${s.handle}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-zinc-300 transition-colors hover:bg-white/20 hover:text-white"
        >
          <SocialIcon name={s.key} size={17} />
        </a>
      ))}
    </div>
  );
}

/** Full cards with handle + call to action (landing page). */
export function SocialCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {SITE_CONFIG.social.map((s) => (
        <a
          key={s.key}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", BRAND[s.key as SocialKey])}>
            <SocialIcon name={s.key} size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-slate-900 dark:text-white">{s.label}</span>
            <span className="block truncate text-sm text-slate-500">{s.handle}</span>
            <span className="mt-1 block text-xs text-slate-400">{s.blurb}</span>
            <span className="mt-2 inline-flex items-center gap-0.5 text-sm font-semibold text-blue-600 group-hover:underline dark:text-blue-400">
              {s.cta}<ArrowUpRight size={14} />
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}
