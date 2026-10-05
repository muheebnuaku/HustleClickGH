"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { DeviceLocationButton } from "@/components/device-location-button";

/**
 * Modal asking a user to provide their location. Shown only when an admin has
 * requested it (User.locationRequested) and the user still has no country set.
 * Location comes from the device's current position only — no typing.
 */
export function LocationPrompt() {
  const [open, setOpen] = useState(false);

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
        <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-4">
          Tap the button and allow location access. We use your phone&apos;s current location to set your
          country, region and city — it can&apos;t be typed in.
        </p>
        <DeviceLocationButton onSaved={() => setOpen(false)} className="sm:w-full" />
      </div>
    </div>
  );
}
