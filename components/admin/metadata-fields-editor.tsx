"use client";

// Admin builder for the extra details a contributor fills in with each
// submission (age range, ID card photo, phone model…). Keys are derived from
// labels on save (lib/project-config.ts parseMetadataFields).

import { useRef } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, X } from "lucide-react";
import { METADATA_FIELD_TYPES, METADATA_PRESETS, MAX_METADATA_FIELDS, type MetadataField, type MetadataFieldType } from "@/lib/project-config";

// While editing, a pick-one question's options are a list of rows (blank rows allowed).
export type EditableField = Omit<MetadataField, "options"> & { optionList: string[] };
export const MAX_OPTIONS = 50;

export function toEditable(fields: MetadataField[]): EditableField[] {
  return fields.map(({ options, ...f }) => ({ ...f, optionList: options?.length ? [...options] : [] }));
}

export function fromEditable(fields: EditableField[]): MetadataField[] {
  return fields.map(({ optionList, ...f }) => ({
    ...f,
    ...(f.type === "select" ? { options: Array.from(new Set(optionList.map((o) => o.trim()).filter(Boolean))) } : {}),
  }));
}

/** First problem with the questions, if any (used by the wizard before moving on). */
export function metadataProblem(fields: EditableField[]): string | null {
  for (const f of fields) {
    if (!f.label.trim()) return "Every question needs a label.";
    if (f.type === "select" && new Set(f.optionList.map((o) => o.trim()).filter(Boolean)).size < 2) {
      return `Add at least two options for "${f.label.trim()}".`;
    }
  }
  return null;
}

interface Props {
  value: EditableField[];
  onChange: (v: EditableField[]) => void;
}

export function MetadataFieldsEditor({ value, onChange }: Props) {
  const update = (i: number, patch: Partial<EditableField>) => onChange(value.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const add = (f: Omit<MetadataField, "key">) => {
    if (value.length >= MAX_METADATA_FIELDS) return;
    onChange([...value, { key: "", label: f.label, type: f.type, required: f.required, help: f.help, optionList: f.options ? [...f.options] : [] }]);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const used = new Set(value.map((f) => f.label.toLowerCase()));
  const inputCls = "w-full border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {METADATA_PRESETS.filter((p) => !used.has(p.label.toLowerCase())).map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => add(p)}
            className="inline-flex items-center gap-1 text-xs border border-dashed border-zinc-300 dark:border-zinc-700 rounded-full px-2.5 py-1 text-zinc-600 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600"
          >
            <Plus size={12} />{p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => add({ label: "New field", type: "text", required: false })}
          className="inline-flex items-center gap-1 text-xs font-medium border border-blue-300 text-blue-600 rounded-full px-2.5 py-1 hover:bg-blue-50"
        >
          <Plus size={12} />Custom field
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-zinc-400">No extra details — contributors only submit the recording.</p>
      ) : (
        <div className="space-y-2">
          {value.map((f, i) => (
            <div key={i} className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 space-y-2 bg-white dark:bg-zinc-900">
              <div className="flex flex-col sm:flex-row gap-2">
                <input className={`${inputCls} sm:flex-1`} value={f.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Question / label" />
                <select className={`${inputCls} sm:w-48`} value={f.type} onChange={(e) => {
                  const type = e.target.value as MetadataFieldType;
                  // A new pick-one question starts with two empty options to fill in.
                  update(i, { type, ...(type === "select" && f.optionList.length === 0 ? { optionList: ["", ""] } : {}) });
                }}>
                  {METADATA_FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {f.type === "select" && (
                <OptionsEditor options={f.optionList} onChange={(optionList) => update(i, { optionList })} inputCls={inputCls} />
              )}
              <input className={inputCls} value={f.help ?? ""} onChange={(e) => update(i, { help: e.target.value })} placeholder="Help text (optional)" />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} className="w-4 h-4 rounded" />
                  Required
                </label>
                {f.type === "photo" && <span className="text-[11px] text-amber-600">Photos are stored with the submission — only ask for ID if the client needs it.</span>}
                <div className="ml-auto flex items-center">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 text-zinc-400 hover:text-foreground disabled:opacity-30" title="Move up"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="p-1.5 text-zinc-400 hover:text-foreground disabled:opacity-30" title="Move down"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} className="p-1.5 text-red-500 hover:text-red-700" title="Remove"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One row per option; Enter adds the next one, pasting a list splits it into rows. */
function OptionsEditor({ options, onChange, inputCls }: { options: string[]; onChange: (o: string[]) => void; inputCls: string }) {
  const list = options.length ? options : [""];
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (k: number) => setTimeout(() => refs.current[k]?.focus(), 0);
  const set = (k: number, v: string) => onChange(list.map((o, j) => (j === k ? v : o)));
  const insertAfter = (k: number, items: string[]) => {
    const next = [...list.slice(0, k + 1), ...items, ...list.slice(k + 1)].slice(0, MAX_OPTIONS);
    onChange(next);
    focus(Math.min(k + items.length, next.length - 1));
  };
  const remove = (k: number) => {
    onChange(list.filter((_, j) => j !== k));
    focus(Math.max(0, k - 1));
  };

  return (
    <div className="space-y-1.5 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-950/60">
      <p className="text-[11px] font-medium text-zinc-500">Options — contributors pick one</p>
      {list.map((o, k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-zinc-300 dark:border-zinc-600" />
          <input
            ref={(el) => { refs.current[k] = el; }}
            className={inputCls}
            value={o}
            placeholder={`Option ${k + 1}`}
            onChange={(e) => set(k, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); insertAfter(k, [""]); }
              if (e.key === "Backspace" && !o && list.length > 1) { e.preventDefault(); remove(k); }
            }}
            onPaste={(e) => {
              // Pasting "Indoor, Outdoor, Studio" (or one per line) fills several rows.
              const parts = e.clipboardData.getData("text").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
              if (parts.length < 2) return;
              e.preventDefault();
              const next = [...list];
              next[k] = (o + parts[0]).trim();
              onChange([...next.slice(0, k + 1), ...parts.slice(1), ...next.slice(k + 1)].slice(0, MAX_OPTIONS));
              focus(Math.min(k + parts.length - 1, MAX_OPTIONS - 1));
            }}
          />
          <button type="button" onClick={() => remove(k)} disabled={list.length <= 1} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-red-600 disabled:opacity-30 dark:hover:bg-zinc-800" aria-label={`Remove option ${k + 1}`}>
            <X size={14} />
          </button>
        </div>
      ))}
      {list.length < MAX_OPTIONS && (
        <button type="button" onClick={() => insertAfter(list.length - 1, [""])} className="ml-5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10">
          <Plus size={13} />Add option
        </button>
      )}
    </div>
  );
}
