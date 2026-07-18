"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Send } from "lucide-react";

type Target = "all" | "verified" | "unverified" | "no_location" | "country" | "custom";

interface Counts {
  all: number;
  verified: number;
  unverified: number;
  noLocation: number;
  countries: { country: string; count: number }[];
}

const CHUNK = 20;

export function EmailBroadcast() {
  const [counts, setCounts] = useState<Counts>({ all: 0, verified: 0, unverified: 0, noLocation: 0, countries: [] });
  const [target, setTarget] = useState<Target>("all");
  const [country, setCountry] = useState("");
  const [customEmails, setCustomEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/emails")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCounts(d))
      .catch(() => {});
  }, []);

  const recipientCount = () => {
    switch (target) {
      case "all": return counts.all;
      case "verified": return counts.verified;
      case "unverified": return counts.unverified;
      case "no_location": return counts.noLocation;
      case "country": return counts.countries.find((c) => c.country === country)?.count ?? 0;
      case "custom":
        return customEmails.split(/[\n,]/).map((e) => e.trim()).filter(Boolean).length;
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult("");

    if (!subject.trim() || !message.trim()) {
      setError("Please enter a subject and a message.");
      return;
    }
    const count = recipientCount();
    if (!count) {
      setError("No recipients match that selection.");
      return;
    }
    if (!confirm(`Send this email to ${count} recipient${count === 1 ? "" : "s"}?`)) return;

    setSending(true);
    setProgress({ sent: 0, total: count });

    try {
      const emails = target === "custom"
        ? customEmails.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
        : undefined;

      let offset = 0;
      let totalSent = 0;
      let totalFailed = 0;

      // Send in chunks so long lists never hit the serverless timeout
      while (true) {
        const res = await fetch("/api/admin/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, message, target, country, emails, offset, limit: CHUNK }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to send.");

        totalSent += data.sent || 0;
        totalFailed += data.failed || 0;
        setProgress({ sent: totalSent, total: data.total || count });

        if (data.nextOffset === null || data.nextOffset === undefined) break;
        offset = data.nextOffset;
      }

      setResult(
        `Sent ${totalSent} email${totalSent === 1 ? "" : "s"}.` +
          (totalFailed ? ` ${totalFailed} failed — check the logs.` : "")
      );
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  };

  const count = recipientCount();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail size={20} /> Email broadcast
        </CardTitle>
        <CardDescription>
          Send an email from info@hustleclickgh.com to all users or a specific group.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={send} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm">{error}</div>
          )}
          {result && (
            <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-xl text-sm">{result}</div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Recipients</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as Target)}
              disabled={sending}
              className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm"
            >
              <option value="all">All active users ({counts.all})</option>
              <option value="verified">Verified only ({counts.verified})</option>
              <option value="unverified">Not verified ({counts.unverified})</option>
              <option value="no_location">Missing location ({counts.noLocation})</option>
              <option value="country">By country…</option>
              <option value="custom">Specific email addresses…</option>
            </select>
          </div>

          {target === "country" && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={sending}
                className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm"
              >
                <option value="">Select a country…</option>
                {counts.countries.map((c) => (
                  <option key={c.country} value={c.country}>{c.country} ({c.count})</option>
                ))}
              </select>
            </div>
          )}

          {target === "custom" && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Email addresses</label>
              <textarea
                value={customEmails}
                onChange={(e) => setCustomEmails(e.target.value)}
                placeholder="one@example.com, two@example.com&#10;three@example.com"
                rows={3}
                disabled={sending}
                className="flex w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-zinc-500">Separate with commas or new lines.</p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="New paid voice project is live"
              disabled={sending}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={"Hi,\n\nWe've just posted a new project paying GH₵5 per recording.\n\nLog in to get started."}
              rows={7}
              disabled={sending}
              className="flex w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-zinc-500">
              Sent in the HustleClickGH template. Blank lines become paragraphs, and each email is
              addressed to the recipient by first name.
            </p>
          </div>

          {sending && progress.total > 0 && (
            <div>
              <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${Math.round((progress.sent / progress.total) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Sending… {progress.sent} of {progress.total}. Keep this page open.
              </p>
            </div>
          )}

          <Button type="submit" disabled={sending || !count} className="bg-blue-600 hover:bg-blue-700">
            <Send size={18} />
            {sending ? "Sending…" : `Send to ${count} recipient${count === 1 ? "" : "s"}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
