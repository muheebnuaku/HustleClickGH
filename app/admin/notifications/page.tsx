"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, Send, Smartphone, Users } from "lucide-react";

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/dashboard");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ devices: 0, users: 0, configured: true });

  const loadStats = async () => {
    try {
      const res = await fetch("/api/admin/notifications");
      if (res.ok) setStats(await res.json());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult("");
    if (!title.trim() || !body.trim()) {
      setError("Please enter a title and a message.");
      return;
    }
    if (!confirm(`Send this notification to all ${stats.devices} subscribed device(s)?`)) return;

    setSending(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send.");
      setResult(data.message);
      setTitle("");
      setBody("");
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
            <Bell size={26} /> Notifications
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            Push a message to every user who has enabled browser notifications.
          </p>
        </div>

        {!stats.configured && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 p-4 rounded-xl text-sm">
            Push isn&apos;t configured yet. Add <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> and{" "}
            <code>VAPID_PRIVATE_KEY</code> to your environment variables and redeploy.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
                <Smartphone size={20} />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Subscribed devices</p>
                <p className="text-2xl font-bold text-foreground">{stats.devices}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center">
                <Users size={20} />
              </div>
              <div>
                <p className="text-xs text-zinc-500">Reachable users</p>
                <p className="text-2xl font-bold text-foreground">{stats.users}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Send a notification</CardTitle>
            <CardDescription>
              Appears as a native notification on the user&apos;s device, even when the site is closed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={send} className="space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm">
                  {error}
                </div>
              )}
              {result && (
                <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-xl text-sm">
                  {result}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="New voice project available"
                  maxLength={100}
                  disabled={sending}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Earn GH₵5 per recording — limited slots available."
                  rows={3}
                  maxLength={300}
                  disabled={sending}
                  className="flex w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Opens this page when tapped</label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="/data-projects"
                  disabled={sending}
                />
              </div>

              <Button type="submit" disabled={sending || stats.devices === 0} className="bg-blue-600 hover:bg-blue-700">
                <Send size={18} />
                {sending ? "Sending…" : `Send to ${stats.devices} device${stats.devices === 1 ? "" : "s"}`}
              </Button>
              {stats.devices === 0 && (
                <p className="text-xs text-zinc-500">
                  No devices subscribed yet — users opt in from the banner on their dashboard.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
