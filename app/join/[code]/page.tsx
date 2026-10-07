"use client";

// Team invite link: /join/MW-7KQ2X. Logged-in people join in one tap; others
// are asked to sign up / log in first (the code is shown so they can enter it
// on their Profile afterwards).

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Network, Loader2, CheckCircle2 } from "lucide-react";

export default function JoinTeamPage() {
  const { code } = useParams<{ code: string }>();
  const teamCode = decodeURIComponent(code || "").toUpperCase();
  const { status } = useSession();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const join = async () => {
    setBusy(true);
    const r = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", code: teamCode }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setResult({ ok: r.ok, text: d.message || (r.ok ? "Joined" : "Couldn't join") });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 font-sans dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white"><Network size={26} /></span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Join a HustleClickGH team</h1>
        <p className="mt-2 text-sm text-zinc-500">You&apos;ve been invited to join a field team. Team code:</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-wider text-zinc-900 dark:text-white">{teamCode}</p>

        {result ? (
          <div className="mt-6">
            <p className={result.ok ? "text-emerald-600" : "text-red-600"}>
              {result.ok && <CheckCircle2 size={18} className="mr-1 inline" />}{result.text}
            </p>
            <Link href={result.ok ? "/data-projects" : "/profile"} className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
              {result.ok ? "Find projects" : "Go to my profile"}
            </Link>
          </div>
        ) : status === "authenticated" ? (
          <button onClick={join} disabled={busy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" />}Join this team
          </button>
        ) : status === "loading" ? (
          <Loader2 className="mx-auto mt-6 animate-spin text-zinc-400" />
        ) : (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Create an account (or log in), then open this link again — or enter the code under <strong>Profile → Your team</strong>.</p>
            <div className="flex gap-2">
              <Link href="/register" className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Sign up</Link>
              <Link href="/login" className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Log in</Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
