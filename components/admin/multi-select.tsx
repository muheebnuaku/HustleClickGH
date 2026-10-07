"use client";

// Searchable multi-select dropdown (chips + checklist with counts).

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Option { value: string; label?: string; hint?: string; count?: number }

export function MultiSelect({ options, value, onChange, placeholder = "Select…", emptyText = "Nothing to choose from yet", single }: {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  /** Pick one only (closes on choose). */
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => (o.label ?? o.value).toLowerCase().includes(s) || o.hint?.toLowerCase().includes(s)) : options;
  }, [options, q]);
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const toggle = (v: string) => {
    if (single) { onChange(value[0] === v ? [] : [v]); setOpen(false); return; }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[46px] w-full flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-left text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {value.length === 0 && <span className="px-1 text-zinc-400">{placeholder}</span>}
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
            {label(v)}
            <span role="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== v)); }} className="rounded p-0.5 hover:bg-blue-100 dark:hover:bg-blue-500/20" aria-label={`Remove ${label(v)}`}><X size={11} /></span>
          </span>
        ))}
        <ChevronDown size={16} className="ml-auto shrink-0 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          {options.length > 6 && (
            <div className="relative border-b border-zinc-100 dark:border-zinc-800">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-transparent py-2.5 pl-8 pr-3 text-sm focus:outline-none" />
            </div>
          )}
          <ul className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <li className="px-3 py-3 text-sm text-zinc-500">{options.length ? "No matches" : emptyText}</li>
            ) : shown.map((o) => {
              const on = value.includes(o.value);
              return (
                <li key={o.value}>
                  <button type="button" onClick={() => toggle(o.value)} className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800", on && "bg-blue-50/60 dark:bg-blue-500/10")}>
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 dark:border-zinc-600")}>{on && <Check size={11} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-zinc-900 dark:text-zinc-100">{o.label ?? o.value}</span>
                      {o.hint && <span className="block truncate text-[11px] text-zinc-500">{o.hint}</span>}
                    </span>
                    {o.count !== undefined && <span className="shrink-0 text-xs tabular-nums text-zinc-400">{o.count.toLocaleString()}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
