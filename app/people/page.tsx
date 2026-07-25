"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VerifiedBadge } from "@/components/verified-badge";
import { Loader2, Search, UserPlus, UserCheck } from "lucide-react";

interface UserRow {
  id: string; userId: string; fullName: string; image?: string | null; verified?: boolean;
  city?: string | null; country?: string | null; isFollowing?: boolean;
}

export default function PeoplePage() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 1) { setUsers([]); setSearched(false); return; }
      setLoading(true); setSearched(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) setUsers((await res.json()).users ?? []);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const toggleFollow = async (u: UserRow) => {
    if (busyId) return;
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}/follow`, { method: u.isFollowing ? "DELETE" : "POST" });
      if (res.ok) setUsers((list) => list.map((x) => x.id === u.id ? { ...x, isFollowing: !u.isFollowing } : x));
    } catch { /* ignore */ } finally { setBusyId(null); }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Find People</h1>
          <p className="text-sm text-zinc-500 mt-1">Search by name or user ID, follow them, and start a conversation.</p>
        </div>

        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="pl-10" />
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-600" /></div>
        ) : searched && users.length === 0 ? (
          <Card className="p-10 text-center text-zinc-500">No people found for &ldquo;{q}&rdquo;.</Card>
        ) : users.length > 0 ? (
          <Card className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-4">
                <Link href={`/u/${u.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                  {u.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.image} alt={u.fullName} className="w-11 h-11 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center font-semibold shrink-0">
                      {u.fullName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground truncate">{u.fullName}</span>
                      {u.verified && <VerifiedBadge size={13} />}
                    </div>
                    <p className="text-xs text-zinc-500 truncate">
                      {u.userId}{(u.city || u.country) ? ` · ${[u.city, u.country].filter(Boolean).join(", ")}` : ""}
                    </p>
                  </div>
                </Link>
                <Button size="sm" variant={u.isFollowing ? "outline" : "primary"} disabled={busyId === u.id} onClick={() => toggleFollow(u)} className="shrink-0">
                  {u.isFollowing ? <><UserCheck size={14} className="mr-1" />Following</> : <><UserPlus size={14} className="mr-1" />Follow</>}
                </Button>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="p-10 text-center text-zinc-400">
            <Search size={32} className="mx-auto mb-2 opacity-40" />
            Start typing to find people.
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
