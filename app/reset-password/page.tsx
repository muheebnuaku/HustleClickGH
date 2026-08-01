"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Eye, EyeOff, CheckCircle2, XCircle, Loader2, ArrowLeft, Home } from "lucide-react";

function ResetInner() {
  const token = useSearchParams().get("token") || "";
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setChecking(false); setValid(false); return; }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setValid(Boolean(d.valid)))
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  const strong = (p: string) => p.length >= 8 && /[A-Z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!strong(password)) { setError("Password needs 8+ characters, an uppercase letter, a number and a symbol."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Could not reset your password.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Sparkles size={22} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-foreground">HustleClickGH</h1>
        </div>

        {checking ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="animate-spin text-blue-600" />
            <p className="text-sm text-zinc-500">Checking your link…</p>
          </div>
        ) : done ? (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={34} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Password updated</h2>
            <p className="text-sm text-zinc-500">You can now sign in with your User ID and new password.</p>
            <Link href="/login">
              <Button className="w-full h-11 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700">Go to sign in</Button>
            </Link>
          </div>
        ) : !valid ? (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
              <XCircle size={34} className="text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Link invalid or expired</h2>
            <p className="text-sm text-zinc-500">
              Reset links expire after 1 hour and can only be used once. Please request a new one.
            </p>
            <Link href="/forgot-password">
              <Button className="w-full h-11 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700">Request a new link</Button>
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-1">Set a new password</h2>
              <p className="text-sm text-zinc-500">Choose a strong password you don&rsquo;t use elsewhere.</p>
            </div>
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm">{error}</div>}

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">New password</label>
                <div className="relative">
                  <Input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="h-11 rounded-xl pr-10"
                    disabled={loading}
                  />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Confirm password</label>
                <Input
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                  className="h-11 rounded-xl"
                  disabled={loading}
                />
              </div>

              <p className="text-[10px] text-zinc-500">8+ chars, 1 uppercase, 1 number, 1 symbol</p>

              <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700">
                {loading ? "Updating…" : "Update password"}
              </Button>
            </form>
            <Link href="/login" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-blue-600">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-4 overflow-x-hidden">
      <Suspense fallback={<Loader2 className="animate-spin text-blue-600" />}>
        <ResetInner />
      </Suspense>
      <Link
        href="/"
        className="fixed top-6 left-6 z-50 w-12 h-12 bg-white dark:bg-zinc-900 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center hover:scale-110 transition-all"
      >
        <Home size={20} className="text-zinc-600 dark:text-zinc-400" />
      </Link>
    </div>
  );
}
