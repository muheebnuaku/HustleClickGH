"use client";

// Upload a payment receipt / screenshot (image or PDF). Payments to team leaders
// and contributors happen outside the platform (MoMo, crypto, bank) — the
// uploaded proof is what gets recorded.

import { useRef, useState } from "react";
import { Loader2, Paperclip, FileText, X } from "lucide-react";
import { uploadFile } from "@/lib/upload-file";
import { cn } from "@/lib/utils";

export function ReceiptUpload({ value, onChange, label = "Upload receipt or screenshot", required, className }: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const isPdf = /\.pdf($|\?)/i.test(value) || name.toLowerCase().endsWith(".pdf");

  const pick = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/") && f.type !== "application/pdf") { setErr("Use an image (screenshot) or a PDF."); return; }
    if (f.size > 15 * 1024 * 1024) { setErr("That file is over 15 MB."); return; }
    setBusy(true); setErr("");
    try {
      const u = await uploadFile(f, "payment-receipts", f.name);
      setName(f.name);
      onChange(u.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900 dark:bg-emerald-500/5">
          {isPdf ? (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-red-600 dark:bg-zinc-900"><FileText size={20} /></span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Receipt" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
          )}
          <a href={value} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300">{name || "Receipt attached"}</a>
          <button type="button" onClick={() => { onChange(""); setName(""); }} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white hover:text-red-600 dark:hover:bg-zinc-900" aria-label="Remove receipt"><X size={15} /></button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className={cn("flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-3 text-sm font-medium transition-colors disabled:opacity-60",
            required ? "border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-500/5" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800")}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
          {busy ? "Uploading…" : `${label}${required ? " *" : " (optional)"}`}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
