"use client";

// Admin builder for the extra details a contributor fills in with each
// submission (age range, ID card photo, phone model…). Keys are derived from
// labels on save (lib/project-config.ts parseMetadataFields).

import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { METADATA_FIELD_TYPES, METADATA_PRESETS, MAX_METADATA_FIELDS, type MetadataField, type MetadataFieldType } from "@/lib/project-config";

// While editing, options are kept as the raw comma text so typing isn't fought.
export type EditableField = Omit<MetadataField, "options"> & { optionsText: string };

export function toEditable(fields: MetadataField[]): EditableField[] {
  return fields.map(({ options, ...f }) => ({ ...f, optionsText: options?.join(", ") ?? "" }));
}

export function fromEditable(fields: EditableField[]): MetadataField[] {
  return fields.map(({ optionsText, ...f }) => ({
    ...f,
    ...(f.type === "select" ? { options: optionsText.split(",").map((o) => o.trim()).filter(Boolean) } : {}),
  }));
}

interface Props {
  value: EditableField[];
  onChange: (v: EditableField[]) => void;
}

export function MetadataFieldsEditor({ value, onChange }: Props) {
  const update = (i: number, patch: Partial<EditableField>) => onChange(value.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const add = (f: Omit<MetadataField, "key">) => {
    if (value.length >= MAX_METADATA_FIELDS) return;
    onChange([...value, { key: "", label: f.label, type: f.type, required: f.required, help: f.help, optionsText: f.options?.join(", ") ?? "" }]);
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
                <select className={`${inputCls} sm:w-48`} value={f.type} onChange={(e) => update(i, { type: e.target.value as MetadataFieldType })}>
                  {METADATA_FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {f.type === "select" && (
                <input className={inputCls} value={f.optionsText} onChange={(e) => update(i, { optionsText: e.target.value })} placeholder="Options, comma-separated (e.g. Indoor, Outdoor)" />
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
