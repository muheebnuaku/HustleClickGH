"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ShieldCheck, Trash2, AlertTriangle } from "lucide-react";

export default function AccountDataPage() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("Export failed. Please try again.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hustleclickgh-data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
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
      // Account gone — sign out and return home.
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed.");
      setDeleting(false);
    }
  };

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

        {/* Export */}
        <Card>
          <CardHeader>
            <CardTitle>Export your data</CardTitle>
            <CardDescription>
              Download a copy of the personal data we hold about you as a JSON file.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExport} disabled={exporting}>
              <Download size={18} />
              {exporting ? "Preparing…" : "Download my data"}
            </Button>
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
