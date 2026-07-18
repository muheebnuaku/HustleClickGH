"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Fingerprint, Trash2, Plus, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Credential {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function BiometricSettings() {
  const [supported, setSupported] = useState(true);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/webauthn/credentials");
      const data = await res.json();
      setCredentials(data.credentials || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    load();
  }, []);

  const enroll = async () => {
    setEnrolling(true);
    setError("");
    setMessage("");
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

      setMessage("✓ Biometric login enabled on this device.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Setup failed.";
      if (!/NotAllowed|abort|cancel|timed out/i.test(msg)) setError(msg);
    } finally {
      setEnrolling(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    setMessage("");
    try {
      await fetch(`/api/webauthn/credentials?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setCredentials((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Could not remove that device.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint size={20} className="text-blue-600" /> Biometric login
        </CardTitle>
        <CardDescription>
          Sign in with Face ID, Touch ID, Windows Hello or your fingerprint instead of your
          password. Set it up on each device you use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supported ? (
          <p className="text-sm text-zinc-500">
            This browser or device doesn&apos;t support biometric login.
          </p>
        ) : (
          <>
            {message && (
              <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-lg text-sm">
                {message}
              </div>
            )}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {!loading && credentials.length > 0 && (
              <div className="space-y-2">
                {credentials.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 shrink-0">
                        <ShieldCheck size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.deviceName || "Passkey"}</p>
                        <p className="text-xs text-zinc-500">
                          Added {formatDate(c.createdAt)}
                          {c.lastUsedAt ? ` · last used ${formatDate(c.lastUsedAt)}` : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => remove(c.id)}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                      title="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={enroll} disabled={enrolling} variant="outline">
              {enrolling ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus size={18} />
              )}
              {credentials.length > 0 ? "Add this device" : "Set up biometric login"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
