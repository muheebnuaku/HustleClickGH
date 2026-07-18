"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GHANA_REGIONS } from "@/lib/constants";
import { MapPin } from "lucide-react";

/**
 * Modal asking a user to provide their location. Shown only when an admin has
 * requested it (User.locationRequested) and the user still has no country set.
 */
export function LocationPrompt() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ country: "Ghana", region: "", city: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/location");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.shouldPrompt) setOpen(true);
      } catch {
        /* stay hidden on error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.country.trim() || !form.region.trim() || !form.city.trim()) {
      setError("Please fill in your country, region and city.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Could not save. Please try again.");
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-7">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 shrink-0">
            <MapPin size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Where are you based?</h2>
            <p className="text-xs text-zinc-500">We need this to match you with nearby projects.</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Country</label>
            <Input
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Region</label>
              <select
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                disabled={saving}
                className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm"
              >
                <option value="">Select…</option>
                {GHANA_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">City / Town</label>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                disabled={saving}
              />
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            Not in Ghana? Enter your country and type your region/state and city.
          </p>

          <Button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700">
            {saving ? "Saving…" : "Save location"}
          </Button>
        </form>
      </div>
    </div>
  );
}
