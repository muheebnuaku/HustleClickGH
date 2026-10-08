"use client";

// Client "New project" — four short steps instead of one long form:
// what you need → instructions → volume & price → licence & submit.

import { useEffect, useState } from "react";
import { Mic, Video, X, Check, ChevronLeft, ChevronRight, Loader2, ShieldCheck, Info } from "lucide-react";
import { cn, formatUsd } from "@/lib/utils";
import { LICENSES, DEFAULT_LICENSE } from "@/lib/licenses";

const STEPS = ["What you need", "Instructions", "Volume & price", "Licence & submit"] as const;

export function NewProjectWizard({ wallet, onClose, onCreated }: { wallet: number; onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ title: "", description: "", instructions: "", projectType: "voice", reward: "", maxSubmissions: "", languages: "", samplePrompts: "", license: DEFAULT_LICENSE });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const cost = (Number(f.reward) || 0) * (Number(f.maxSubmissions) || 0);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [busy, onClose]);

  const problem = (s: number): string | null => {
    if (s === 0) {
      if (!f.title.trim()) return "Give the project a title.";
      if (!f.description.trim()) return "Describe the data you need.";
    }
    if (s === 1 && !f.instructions.trim()) return "Add instructions for contributors.";
    if (s === 2) {
      if (!(Number(f.reward) > 0)) return "Set your price per approved item.";
      if (!(Number(f.maxSubmissions) > 0)) return "Set how many items you need.";
    }
    return null;
  };
  const next = () => { const p = problem(step); if (p) { setErr(p); return; } setErr(""); setStep((s) => Math.min(STEPS.length - 1, s + 1)); };

  const submit = async () => {
    for (let s = 0; s < STEPS.length; s++) { const p = problem(s); if (p) { setStep(s); setErr(p); return; } }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/org/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await res.json();
      if (!res.ok) { setErr(d.message || "Couldn't create the project."); return; }
      onCreated(d.projectId);
    } catch { setErr("Couldn't create the project."); } finally { setBusy(false); }
  };

  const input = "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-700 dark:bg-zinc-900";
  const label = "mb-1.5 block text-sm font-medium text-zinc-800 dark:text-zinc-200";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl dark:bg-zinc-950" role="dialog" aria-label="New project">
        {/* Header + steps */}
        <div className="shrink-0 border-b border-zinc-100 px-5 pb-4 pt-5 sm:px-6 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-emerald-600">New project · step {step + 1} of {STEPS.length}</p>
              <h2 className="mt-0.5 text-lg font-semibold text-foreground">{STEPS[step]}</h2>
            </div>
            <button onClick={onClose} disabled={busy} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800" aria-label="Close"><X size={18} /></button>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {STEPS.map((s, i) => (
              <button key={s} type="button" onClick={() => i < step && setStep(i)} className={cn("h-1.5 rounded-full transition-colors", i <= step ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-800", i < step && "cursor-pointer")} aria-label={s} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {step === 0 && (
            <>
              <div>
                <span className={label}>Type of data</span>
                <div className="grid grid-cols-2 gap-3">
                  {[{ v: "voice", t: "Voice / audio", d: "Read speech, conversations, commands", icon: Mic, tint: "from-sky-500 to-blue-600" }, { v: "video", t: "Video", d: "Faces, gestures, scenes", icon: Video, tint: "from-violet-500 to-purple-600" }].map((o) => {
                    const on = f.projectType === o.v;
                    return (
                      <button key={o.v} type="button" onClick={() => set({ projectType: o.v })}
                        className={cn("relative rounded-2xl border-2 p-4 text-left transition-all", on ? "border-emerald-500 bg-emerald-50/50 shadow-sm dark:bg-emerald-500/5" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800")}>
                        <span className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white", o.tint)}><o.icon size={19} /></span>
                        <span className="block text-sm font-semibold text-foreground">{o.t}</span>
                        <span className="mt-0.5 block text-xs text-zinc-500">{o.d}</span>
                        {on && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={12} /></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block"><span className={label}>Project title</span>
                <input className={input} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Twi conversational speech" autoFocus />
              </label>
              <label className="block"><span className={label}>What do you need, and what&apos;s it for?</span>
                <textarea className={input} rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="The data you need and how it will be used — contributors see this." />
              </label>
            </>
          )}

          {step === 1 && (
            <>
              <label className="block"><span className={label}>Recording instructions</span>
                <textarea className={input} rows={5} value={f.instructions} onChange={(e) => set({ instructions: e.target.value })} placeholder={"Step by step, e.g.\n1. Find a quiet room\n2. Hold the phone at arm's length\n3. Read the sentence clearly"} />
              </label>
              <label className="block"><span className={label}>Languages <span className="font-normal text-zinc-400">(optional)</span></span>
                <input className={input} value={f.languages} onChange={(e) => set({ languages: e.target.value })} placeholder="e.g. English, Twi, Chichewa" />
                <span className="mt-1 block text-xs text-zinc-500">Separate with commas. Contributors say which one they used.</span>
              </label>
              <label className="block"><span className={label}>Sample prompts <span className="font-normal text-zinc-400">(optional)</span></span>
                <textarea className={input} rows={3} value={f.samplePrompts} onChange={(e) => set({ samplePrompts: e.target.value })} placeholder="One per line — sentences or questions contributors can use." />
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className={label}>Your price per approved item</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
                    <input type="number" min="0.1" step="0.5" className={cn(input, "pl-7")} value={f.reward} onChange={(e) => set({ reward: e.target.value })} placeholder="2.00" />
                  </div>
                </label>
                <label className="block"><span className={label}>Items needed</span>
                  <input type="number" min="1" className={input} value={f.maxSubmissions} onChange={(e) => set({ maxSubmissions: e.target.value })} placeholder="500" />
                </label>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-zinc-500">Estimated total</span>
                  <span className="text-2xl font-semibold tabular-nums text-foreground">{formatUsd(cost)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>Your wallet</span><span className="tabular-nums">{formatUsd(wallet)}</span>
                </div>
                {cost > wallet && cost > 0 && (
                  <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    <Info size={13} className="mt-0.5 shrink-0" />You can submit now — add {formatUsd(cost - wallet)} to your wallet before we approve and launch it.
                  </p>
                )}
              </div>
              <p className="text-xs text-zinc-500">Nothing is charged now. We review your request (and may suggest a price), then fund it from your wallet when it goes live. You only pay for approved items.</p>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <span className={label}>How may the data be used?</span>
                <div className="space-y-2">
                  {Object.values(LICENSES).map((l) => {
                    const on = f.license === l.key;
                    return (
                      <button key={l.key} type="button" onClick={() => set({ license: l.key })}
                        className={cn("flex w-full items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition-colors", on ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/5" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800")}>
                        <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2", on ? "border-emerald-500" : "border-zinc-300")}>{on && <span className="h-2 w-2 rounded-full bg-emerald-500" />}</span>
                        <span>
                          <span className="block text-sm font-semibold text-foreground">{l.label}</span>
                          <span className="block text-xs text-zinc-500">{l.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500"><ShieldCheck size={13} className="text-emerald-600" />Contributors agree to this before they record. It&apos;s recorded in every export.</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
                {[
                  ["Project", f.title || "—"],
                  ["Type", f.projectType === "video" ? "Video" : "Voice / audio"],
                  ["Volume", `${Number(f.maxSubmissions) || 0} items at ${formatUsd(Number(f.reward) || 0)}`],
                  ["Estimated total", formatUsd(cost)],
                  ["Languages", f.languages || "Any"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 border-b border-zinc-100 px-4 py-2.5 text-sm last:border-0 dark:border-zinc-800">
                    <span className="text-zinc-500">{k}</span><span className="text-right font-medium text-foreground break-words">{v}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-zinc-100 px-5 py-4 sm:px-6 dark:border-zinc-800">
          {err && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>}
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))} disabled={busy}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
              {step === 0 ? "Cancel" : <><ChevronLeft size={16} />Back</>}
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">
                Continue<ChevronRight size={16} />
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}Submit for review
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
