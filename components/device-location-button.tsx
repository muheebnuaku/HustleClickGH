"use client";

// Sets the user's location from their DEVICE's current position (GPS). There is
// deliberately no way to type a location — the server works out country /
// region / city from the coordinates (see /api/account/location).

import { useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SavedLocation {
  country: string;
  region: string;
  city: string;
}

function readPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This device or browser can't share its location."));
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      reject(new Error(
        err.code === err.PERMISSION_DENIED
          ? "Location access is blocked. Allow location for this site in your browser settings, then try again."
          : err.code === err.TIMEOUT
          ? "Getting your location took too long. Move to an open area and try again."
          : "Couldn't get your location. Turn on location services and try again.",
      ));
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

export function DeviceLocationButton({ onSaved, label = "Use my current location", className }: {
  onSaved: (loc: SavedLocation) => void;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState<"" | "locating" | "saving">("");
  const [error, setError] = useState("");

  const run = async () => {
    setError("");
    setBusy("locating");
    try {
      const pos = await readPosition();
      setBusy("saving");
      const res = await fetch("/api/account/location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't save your location. Please try again.");
      onSaved(data.location as SavedLocation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your location.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={!!busy}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 sm:w-auto",
          className,
        )}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
        {busy === "locating" ? "Finding you…" : busy === "saving" ? "Saving…" : label}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
