"use client";

// Type a User ID, name, email or phone → pick the person from suggestions.

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickedUser {
  id: string; userId: string; fullName: string; email: string; phone: string | null;
  country: string | null; region: string | null; city: string | null; status: string;
  leaderRole: string | null; leaderAlsoSupervisor?: boolean; teamLeaderId: string | null;
}

export function UserPicker({ value, onChange, placeholder = "Type a User ID, name, email or phone", autoFocus }: {
  value: PickedUser | null;
  onChange: (u: PickedUser | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedUser[]>([]);
  const [searched, setSearched] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      fetch(`/api/admin/users/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((d) => { if (alive) { setResults(d.users ?? []); setSearched(term); } })
        .catch(() => {});
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2.5 dark:border-blue-500/30 dark:bg-blue-500/10">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">{value.fullName.charAt(0).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{value.fullName}</span>
          <span className="block truncate text-xs text-zinc-500">{value.userId} · {[value.city, value.country].filter(Boolean).join(", ") || value.email}</span>
        </span>
        <button type="button" onClick={() => { onChange(null); setQ(""); setResults([]); }} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white dark:hover:bg-zinc-800" aria-label="Choose someone else"><X size={15} /></button>
      </div>
    );
  }

  const term = q.trim();
  const shown = term.length >= 2 ? results : [];
  const loading = term.length >= 2 && searched !== term;
  return (
    <div ref={ref} className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {open && term.length >= 2 && (
        <ul className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          {loading && shown.length === 0 ? (
            [0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="h-8 w-8 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <span className="flex-1 space-y-1.5"><span className="block h-3 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" /><span className="block h-2.5 w-1/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" /></span>
              </li>
            ))
          ) : shown.length === 0 ? (
            <li className="px-3 py-3 text-sm text-zinc-500">No one matches “{term}”.</li>
          ) : shown.map((u) => (
            <li key={u.id}>
              <button type="button" onClick={() => { onChange(u); setOpen(false); }} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800", loading && "opacity-60")}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{u.fullName.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{u.fullName} <span className="font-normal text-zinc-400">· {u.userId}</span></span>
                  <span className="block truncate text-xs text-zinc-500">{[u.email, [u.city, u.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
                </span>
                {u.leaderRole && <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{u.leaderRole === "representative" ? (u.leaderAlsoSupervisor ? "Rep + Sup" : "Rep") : "Supervisor"}</span>}
                {u.status !== "active" && <span className="shrink-0 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-600 dark:bg-red-500/10">{u.status}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
