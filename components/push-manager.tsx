"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

const DISMISS_KEY = "hcg_push_prompt_dismissed";

/**
 * VAPID keys are base64url; the Push API needs ArrayBuffer-backed bytes
 * (hence constructing the ArrayBuffer explicitly rather than `new Uint8Array(n)`).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

/**
 * Returns a subscription made with the CURRENT server key. A subscription
 * created under an older key (keys were rotated 2026-11-22) is rejected by the
 * push service forever, so it is replaced rather than reused.
 */
async function currentSubscription(reg: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const key = urlBase64ToUint8Array(publicKey);
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing.options.applicationServerKey, key)) return existing;
  if (existing) await existing.unsubscribe().catch(() => {});
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/**
 * Registers the service worker and offers to turn on browser notifications.
 * Hidden when: push isn't configured, the browser doesn't support it, permission
 * was already granted/denied, or the user dismissed the prompt.
 */
export function PushManager() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");

        if (Notification.permission === "granted") {
          // Already allowed — make sure the server has this device on file,
          // under the current key
          const existing = await reg.pushManager.getSubscription();
          const sub = await currentSubscription(reg, publicKey);
          if (sub !== existing) {
            await fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(sub),
            });
          }
          return;
        }

        // "denied" can't be re-prompted from JS — don't nag; nor after a dismiss
        if (Notification.permission === "default" && localStorage.getItem(DISMISS_KEY) !== "1" && !cancelled) setShow(true);
      } catch (err) {
        console.error("[push] setup failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setShow(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await currentSubscription(reg, publicKey);

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("Could not save your subscription.");

      setShow(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
      <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 shrink-0">
        <Bell size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Get notified about new projects</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {error || "Turn on notifications so you never miss a paid task."}
        </p>
      </div>
      <button
        onClick={enable}
        disabled={busy}
        className="shrink-0 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {busy ? "…" : "Enable"}
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:bg-amber-100 dark:hover:bg-amber-900/40"
      >
        <X size={16} />
      </button>
    </div>
  );
}
