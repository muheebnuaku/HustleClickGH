// Shared building blocks for admin pages, so every page has the same header,
// stat tiles, notices and empty states.

import type { LucideIcon } from "lucide-react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  eyebrow,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-600/20 sm:flex">
            <Icon size={21} />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{eyebrow}</div>}
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 break-words">{title}</h1>
          {description && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}

const TONES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  purple: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
  orange: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  slate: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
} as const;
export type Tone = keyof typeof TONES;

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "blue",
  className,
}: {
  icon?: LucideIcon;
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate">{label}</p>
        {Icon && (
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <p className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 truncate tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-400 truncate">{hint}</p>}
    </div>
  );
}

/** Rounded surface for page sections (filters, tables, forms). */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60", className)}
      {...props}
    />
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "success" | "error" | "info"; children: React.ReactNode; className?: string }) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
    info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
  }[tone];
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : Info;
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border px-4 py-3 text-sm", styles, className)}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 whitespace-pre-line">{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/50 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
          <Icon size={22} />
        </span>
      )}
      <p className="font-medium text-zinc-700 dark:text-zinc-200">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Pill-style segmented tabs used for status filters. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 text-xs tabular-nums opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
