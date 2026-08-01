"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Send, History, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Target = "all" | "verified" | "unverified" | "no_location" | "country" | "custom";

interface Counts {
  all: number;
  verified: number;
  unverified: number;
  noLocation: number;
  countries: { country: string; count: number }[];
}

interface Broadcast {
  id: string;
  subject: string;
  target: string;
  country: string | null;
  total: number;
  sentCount: number;
  failedCount: number;
  status: string; // sending | completed | partial | stopped
  createdAt: string;
  createdByName: string | null;
}

interface Detail {
  failed: { email: string; fullName: string | null; error: string | null }[];
  sent: { email: string; fullName: string | null }[];
}

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  stopped: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  sending: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};
const STATUS_LABEL: Record<string, string> = {
  completed: "Delivered",
  partial: "Partly delivered",
  stopped: "Stopped (limit)",
  sending: "Sending",
};

export function EmailBroadcast() {
  const [counts, setCounts] = useState<Counts>({ all: 0, verified: 0, unverified: 0, noLocation: 0, countries: [] });
  const [target, setTarget] = useState<Target>("all");
  const [country, setCountry] = useState("");
  const [customEmails, setCustomEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, failed: 0, total: 0, remaining: 0 });
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const [history, setHistory] = useState<Broadcast[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    fetch("/api/admin/emails?list=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHistory(d.broadcasts || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/admin/emails").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCounts(d)).catch(() => {});
    loadHistory();
  }, [loadHistory]);

  const recipientCount = () => {
    switch (target) {
      case "all": return counts.all;
      case "verified": return counts.verified;
      case "unverified": return counts.unverified;
      case "no_location": return counts.noLocation;
      case "country": return counts.countries.find((c) => c.country === country)?.count ?? 0;
      case "custom": return customEmails.split(/[\n,]/).map((e) => e.trim()).filter(Boolean).length;
    }
  };

  // Drive one campaign to completion, updating the progress bar as batches land.
  const runProcessLoop = async (broadcastId: string, total: number): Promise<string | null> => {
    let aborted: string | null = null;
    while (true) {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process", broadcastId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Send failed");
      setProgress({ sent: d.sentTotal ?? 0, failed: d.failedTotal ?? 0, total, remaining: d.remaining ?? 0 });
      if (d.aborted) { aborted = d.aborted; break; }
      if (d.done) break;
    }
    return aborted;
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setResult("");
    if (!subject.trim() || !message.trim()) { setError("Please enter a subject and a message."); return; }
    const count = recipientCount();
    if (!count) { setError("No recipients match that selection."); return; }
    if (!confirm(`Send this email to ${count} recipient${count === 1 ? "" : "s"}?`)) return;

    setSending(true);
    setProgress({ sent: 0, failed: 0, total: count, remaining: count });
    try {
      const emails = target === "custom"
        ? customEmails.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
        : undefined;

      const startRes = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", subject, message, target, country, emails }),
      });
      const start = await startRes.json();
      if (!startRes.ok) throw new Error(start.message || "Could not start the broadcast.");

      const aborted = await runProcessLoop(start.broadcastId, start.total);
      finishMessage(aborted);
      if (!aborted) { setSubject(""); setMessage(""); }
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  };

  const finishMessage = (aborted: string | null) => {
    setProgress((p) => {
      if (aborted) {
        setError(
          `Stopped after ${p.sent} sent — your email provider blocked further sending:\n${aborted}\n\n` +
          `${p.remaining} left unsent. Wait for the limit to reset (or switch to a bulk provider), then use “Resend to failed / remaining” below.`
        );
      } else if (p.failed) {
        setError(`Sent ${p.sent}, ${p.failed} failed. See the history below to view who failed and resend to them.`);
      }
      if (p.sent) setResult(`Sent ${p.sent} email${p.sent === 1 ? "" : "s"}.`);
      return p;
    });
  };

  const resend = async (b: Broadcast) => {
    setError(""); setResult("");
    if (!confirm(`Resend to the ${b.failedCount} recipient${b.failedCount === 1 ? "" : "s"} who didn't get "${b.subject}"?`)) return;
    setResendingId(b.id);
    try {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend", broadcastId: b.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Could not start resend.");
      if (!d.pending) { setResult("Nothing to resend."); setResendingId(null); return; }

      setSending(true);
      setProgress({ sent: 0, failed: 0, total: d.pending, remaining: d.pending });
      const aborted = await runProcessLoop(b.id, d.pending);
      finishMessage(aborted);
      if (expandedId === b.id) openDetail(b.id, true);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resend failed.");
    } finally {
      setSending(false);
      setResendingId(null);
    }
  };

  const openDetail = (id: string, force = false) => {
    if (expandedId === id && !force) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/admin/emails?id=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDetail({ failed: d.failed || [], sent: d.sent || [] }))
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  };

  const count = recipientCount();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail size={20} /> Email broadcast</CardTitle>
          <CardDescription>Send an email from info@hustleclickgh.com to all users or a specific group.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={send} className="space-y-4">
            {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm whitespace-pre-line break-words">{error}</div>}
            {result && <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-xl text-sm">{result}</div>}

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Recipients</label>
              <select value={target} onChange={(e) => setTarget(e.target.value as Target)} disabled={sending}
                className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm">
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
                <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={sending}
                  className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm">
                  <option value="">Select a country…</option>
                  {counts.countries.map((c) => <option key={c.country} value={c.country}>{c.country} ({c.count})</option>)}
                </select>
              </div>
            )}

            {target === "custom" && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Email addresses</label>
                <textarea value={customEmails} onChange={(e) => setCustomEmails(e.target.value)}
                  placeholder="one@example.com, two@example.com&#10;three@example.com" rows={3} disabled={sending}
                  className="flex w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-zinc-500">Separate with commas or new lines.</p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Subject</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="New paid voice project is live" disabled={sending} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder={"Hi,\n\nWe've just posted a new project paying GH₵5 per recording.\n\nLog in to get started."}
                rows={7} disabled={sending}
                className="flex w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-zinc-500">Sent in the HustleClickGH template. Blank lines become paragraphs, and each email is addressed by first name.</p>
            </div>

            {sending && progress.total > 0 && (
              <div>
                <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round(((progress.sent + progress.failed) / progress.total) * 100)}%` }} />
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {progress.sent} sent{progress.failed ? ` · ${progress.failed} failed` : ""} · {progress.remaining} left. Keep this page open.
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

      {/* History — who got each broadcast, who didn't, and resend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History size={18} /> Sent broadcasts</CardTitle>
          <CardDescription>Delivery record per campaign. Expand to see who failed; resend to just them.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No broadcasts yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map((b) => (
                <div key={b.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <div className="p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{b.subject}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(b.createdAt).toLocaleString()} · {b.target}{b.country ? ` (${b.country})` : ""}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[b.status] || STATUS_STYLE.sending}`}>
                      {STATUS_LABEL[b.status] || b.status}
                    </span>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 size={13} />{b.sentCount}</span>
                      <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={13} />{b.failedCount}</span>
                      <span className="text-zinc-400">/ {b.total}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {b.failedCount > 0 && (
                        <Button size="sm" variant="outline" disabled={sending || resendingId === b.id} onClick={() => resend(b)}>
                          {resendingId === b.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          <span className="ml-1">Resend {b.failedCount}</span>
                        </Button>
                      )}
                      <button onClick={() => openDetail(b.id)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Toggle details">
                        {expandedId === b.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {expandedId === b.id && (
                    <div className="border-t border-zinc-100 dark:border-zinc-800 p-3 text-sm">
                      {detailLoading ? (
                        <div className="flex justify-center py-3"><Loader2 className="animate-spin text-zinc-400" size={18} /></div>
                      ) : (
                        <div className="space-y-3">
                          {detail && detail.failed.length > 0 && (
                            <div>
                              <p className="font-medium text-red-600 mb-1">Didn&rsquo;t receive ({detail.failed.length})</p>
                              <div className="max-h-48 overflow-y-auto rounded-lg bg-zinc-50 dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
                                {detail.failed.map((f) => (
                                  <div key={f.email} className="px-3 py-1.5">
                                    <p className="text-foreground break-all">{f.email}</p>
                                    {f.error && <p className="text-xs text-zinc-500 break-words">{f.error}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {detail && (
                            <p className="text-xs text-zinc-500">
                              {detail.sent.length} received · {detail.failed.length} failed.
                              {detail.failed.length > 0 && " Use “Resend” above to retry the failures."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
