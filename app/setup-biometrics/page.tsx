"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loader";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Fingerprint, ScanFace, ShieldCheck, Check } from "lucide-react";

export default function SetupBiometricsPage() {
  const router = useRouter();
  const { status } = useSession();
  const [checking, setChecking] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState("");

  const goToApp = useCallback(() => {
    router.replace("/dashboard");
    router.refresh();
  }, [router]);

  // Decide whether to show the prompt: skip if unsupported or already enrolled.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;

    (async () => {
      if (!browserSupportsWebAuthn()) {
        goToApp();
        return;
      }
      try {
        const res = await fetch("/api/webauthn/credentials");
        const data = await res.json();
        if ((data.credentials?.length ?? 0) > 0) {
          goToApp();
          return;
        }
      } catch {
        goToApp();
        return;
      }
      setChecking(false);
    })();
  }, [status, router, goToApp]);

  const enroll = async () => {
    setEnrolling(true);
    setError("");
    try {
      const optRes = await fetch("/api/webauthn/register/options", { method: "POST" });
      if (!optRes.ok) throw new Error("Could not start setup.");
      const options = await optRes.json();

      const attestation = await startRegistration({ optionsJSON: options });

      const vRes = await fetch("/api/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attestation),
      });
      const data = await vRes.json();
      if (!vRes.ok || !data.verified) throw new Error(data.message || "Setup failed.");

      goToApp();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Setup failed.";
      if (!/NotAllowed|abort|cancel|timed out/i.test(msg)) setError(msg);
      setEnrolling(false);
    }
  };

  if (status === "loading" || checking) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 sm:p-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
            <ScanFace size={28} />
          </div>
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
            <Fingerprint size={28} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">Set up biometric login</h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-6">
          Sign in faster next time with your device&apos;s Face ID, Touch ID, Windows Hello or
          fingerprint — no password to type. It uses your device&apos;s own biometric; we never see it.
        </p>

        <div className="space-y-2 text-left mb-6">
          {["Faster, password-free sign-in", "Your biometric stays on your device", "You can remove it anytime from your profile"].map((t) => (
            <div key={t} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <Check size={16} className="text-green-600 shrink-0" /> {t}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <Button onClick={enroll} disabled={enrolling} className="w-full bg-blue-600 hover:bg-blue-700">
          {enrolling ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <ShieldCheck size={18} />
          )}
          {enrolling ? "Setting up…" : "Enable biometric login"}
        </Button>

        <button
          onClick={goToApp}
          disabled={enrolling}
          className="w-full mt-3 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-50"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
