"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loader";
import { ShieldCheck, Trash2, AlertTriangle, Check } from "lucide-react";
import { CONSENT_SUMMARY, CONSENT_VERSION } from "@/lib/legal";

export default function AccountDataPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Consent gate state
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAgree = async () => {
    if (!agreed) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/account/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreed: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Could not save. Please try again.");
      }
      await update(); // refresh session so the middleware gate reopens
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Deletion failed.");
      }
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed.");
      setDeleting(false);
    }
  };

  if (status === "loading") {
    return <PageLoader />;
  }

  // ---- Consent gate: shown until the user accepts the current agreement ----
  if (session?.user && session.user.consentAccepted === false) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-600">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Data &amp; Privacy</h1>
              <p className="text-xs text-zinc-500">Agreement v{CONSENT_VERSION}</p>
            </div>
          </div>

          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Before you continue, please review and agree to how we handle your personal data.
          </p>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-4 text-sm text-zinc-600 dark:text-zinc-400 max-h-52 overflow-y-auto">
            {CONSENT_SUMMARY}
          </div>

          <p className="text-xs text-zinc-500 mt-3">
            Read the full{" "}
            <Link href="/data-processing-agreement" target="_blank" className="text-blue-600 underline">
              Data Processing Agreement
            </Link>
            ,{" "}
            <Link href="/privacy" target="_blank" className="text-blue-600 underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" target="_blank" className="text-blue-600 underline">
              Terms
            </Link>
            .
          </p>

          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          <label className="flex items-start gap-2 cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              I have read and agree to the Data Processing Agreement and Privacy Policy, and I
              consent to my personal data being processed as described.
            </span>
          </label>

          <Button
            onClick={handleAgree}
            disabled={!agreed || submitting}
            className="w-full mt-5 bg-green-600 hover:bg-green-700"
          >
            <Check size={18} /> {submitting ? "Saving…" : "Agree & Continue"}
          </Button>

          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full mt-3 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // ---- Normal management view (already consented) ----
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck size={28} className="text-green-600" /> Data &amp; Privacy
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            Exercise your data protection rights under the Ghana Data Protection Act.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        {/* Consent status */}
        <Card>
          <CardHeader>
            <CardTitle>Your consent</CardTitle>
            <CardDescription>
              You have agreed to the current Data Processing Agreement (v{CONSENT_VERSION}).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-green-600">
            <Check size={18} /> Consent on file
          </CardContent>
        </Card>

        {/* Privacy documents */}
        <Card>
          <CardHeader>
            <CardTitle>Your agreements</CardTitle>
            <CardDescription>Review the documents that govern how we handle your data.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            <Link href="/privacy" className="text-blue-600 underline">Privacy Policy</Link>
            <Link href="/data-processing-agreement" className="text-blue-600 underline">Data Processing Agreement</Link>
            <Link href="/terms" className="text-blue-600 underline">Terms of Service</Link>
          </CardContent>
        </Card>

        {/* Delete */}
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle size={20} /> Delete your account
            </CardTitle>
            <CardDescription>
              Permanently delete your account and all associated data. This cannot be undone, and
              any remaining balance will be forfeited.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!confirmOpen ? (
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(true)}
                className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 size={18} /> Delete my account
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Type <strong>DELETE</strong> to confirm.
                </p>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="h-10 w-full max-w-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm"
                />
                <div className="flex gap-3">
                  <Button
                    onClick={handleDelete}
                    disabled={confirmText !== "DELETE" || deleting}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deleting ? "Deleting…" : "Permanently delete"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setConfirmOpen(false); setConfirmText(""); }} disabled={deleting}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
