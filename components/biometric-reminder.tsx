"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Fingerprint, X } from "lucide-react";

const DISMISS_KEY = "hcg_biometric_reminder_dismissed";

/**
 * Subtle dashboard prompt for users who skipped biometric setup.
 * Hidden when: the device doesn't support WebAuthn, a passkey is already
 * enrolled, or the user dismissed it (persisted in localStorage).
 */
export function BiometricReminder() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!browserSupportsWebAuthn()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/webauthn/credentials");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && (data.credentials?.length ?? 0) === 0) setShow(true);
      } catch {
        /* stay hidden on error */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
      <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 shrink-0">
        <Fingerprint size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Sign in faster with Face ID or fingerprint</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Use your device&apos;s own biometric instead of typing your password.
        </p>
      </div>
      <Link
        href="/setup-biometrics"
        className="shrink-0 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
      >
        Set up
      </Link>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:bg-blue-100 dark:hover:bg-blue-900/40"
      >
        <X size={16} />
      </button>
    </div>
  );
}
