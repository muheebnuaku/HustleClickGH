"use client";

// Country → region → city, picked from lists wherever we have them.
// Countries: all of them (Africa first). Regions: a dropdown for the countries we
// know, free text elsewhere. City: free text.

import { COUNTRIES, regionsFor } from "@/lib/countries";
import { cn } from "@/lib/utils";

export interface LocationValue { country: string; region: string; city: string }

export function LocationFields({ value, onChange, disabled, fieldClassName, labelClassName }: {
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
  disabled?: boolean;
  fieldClassName?: string;
  labelClassName?: string;
}) {
  const regions = regionsFor(value.country);
  const field = cn("flex h-10 w-full rounded-xl border border-zinc-200 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-950", fieldClassName);
  const label = cn("text-xs font-medium text-foreground", labelClassName);
  const known = COUNTRIES.some((c) => c.name === value.country);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="space-y-1">
        <label className={label}>Country</label>
        <select
          className={field}
          value={value.country}
          disabled={disabled}
          // A new country invalidates the region (lists differ per country).
          onChange={(e) => onChange({ country: e.target.value, region: "" })}
        >
          <option value="">Select…</option>
          {!known && value.country && <option value={value.country}>{value.country}</option>}
          <optgroup label="Africa">
            {COUNTRIES.filter((c) => c.africa).map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
          </optgroup>
          <optgroup label="Rest of the world">
            {COUNTRIES.filter((c) => !c.africa).map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
          </optgroup>
        </select>
      </div>
      <div className="space-y-1">
        <label className={label}>Region / state</label>
        {regions ? (
          <select className={field} value={value.region} disabled={disabled || !value.country} onChange={(e) => onChange({ region: e.target.value })}>
            <option value="">Select…</option>
            {value.region && !regions.includes(value.region) && <option value={value.region}>{value.region}</option>}
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        ) : (
          <input className={field} value={value.region} disabled={disabled || !value.country} placeholder={value.country ? "Your region or state" : "Pick a country first"} onChange={(e) => onChange({ region: e.target.value })} />
        )}
      </div>
      <div className="space-y-1">
        <label className={label}>City / town</label>
        <input className={field} value={value.city} disabled={disabled} placeholder="City / town" onChange={(e) => onChange({ city: e.target.value })} />
      </div>
    </div>
  );
}

/** "+233 " for Ghana — used to pre-fill an empty phone field when the country changes. */
export function dialPrefix(country: string): string {
  const c = COUNTRIES.find((x) => x.name === country);
  return c ? `+${c.dial} ` : "";
}

/** True when the phone holds nothing but a dial prefix (so it's safe to replace). */
export const isBarePrefix = (phone: string) => /^\s*(\+\d{1,4})?\s*$/.test(phone);
