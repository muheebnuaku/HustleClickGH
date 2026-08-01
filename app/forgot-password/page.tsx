"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, ArrowLeft, Sparkles, CheckCircle2, Home } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Response is intentionally generic; treat any 2xx as "done".
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-4 overflow-x-hidden">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Sparkles size={22} className="text-white" />
            </div>
            <h1 className="text-lg font-bold text-foreground">HustleClickGH</h1>
          </div>

          {sent ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={34} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Check your email</h2>
              <p className="text-sm text-zinc-500">
                If an account exists for <strong className="text-foreground break-all">{email.trim()}</strong>,
                we&rsquo;ve sent a link to reset your password. It expires in 1 hour.
              </p>
              <p className="text-xs text-zinc-400">
                Didn&rsquo;t get it? Check your spam folder, or{" "}
                <button onClick={() => setSent(false)} className="text-blue-600 hover:underline">try again</button>.
              </p>
              <Link href="/login" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                <ArrowLeft size={14} /> Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-1">Forgot password?</h2>
                <p className="text-sm text-zinc-500">
                  Enter the email on your account and we&rsquo;ll send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm">
                    {error}
                  </div>
                )}
                <div className="space-y-1">
                  <label htmlFor="email" className="text-xs font-medium text-foreground">Email address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-11 rounded-xl pl-9"
                      disabled={loading}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700">
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
              </form>

              <Link href="/login" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-blue-600">
                <ArrowLeft size={14} /> Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>

      <Link
        href="/"
        className="fixed top-6 left-6 z-50 w-12 h-12 bg-white dark:bg-zinc-900 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center hover:scale-110 transition-all"
      >
        <Home size={20} className="text-zinc-600 dark:text-zinc-400" />
      </Link>
    </div>
  );
}
