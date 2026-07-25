"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/verified-badge";
import { Loader2, MessageCircle, UserPlus, UserCheck, MapPin, Ban, MoreVertical } from "lucide-react";

interface Profile {
  id: string; userId: string; fullName: string; image?: string | null; verified: boolean;
  city?: string | null; country?: string | null; createdAt: string;
  followersCount: number; followingCount: number;
  isFollowing: boolean; isBlocked: boolean; hasBlockedMe: boolean; isSelf: boolean;
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/users/${id}`);
      if (res.ok) setP((await res.json()).user);
      else setP(null);
    } catch { setP(null); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggleFollow = async () => {
    if (!p || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${id}/follow`, { method: p.isFollowing ? "DELETE" : "POST" });
      if (res.ok) { const d = await res.json(); setP({ ...p, isFollowing: d.isFollowing, followersCount: d.followersCount }); }
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  const toggleBlock = async () => {
    if (!p || busy) return;
    setBusy(true); setMenu(false);
    try {
      const res = await fetch(`/api/users/${id}/block`, { method: p.isBlocked ? "DELETE" : "POST" });
      if (res.ok) { const d = await res.json(); setP({ ...p, isBlocked: d.isBlocked, isFollowing: d.isBlocked ? false : p.isFollowing }); }
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  const message = async () => {
    if (!p || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      if (res.ok) { const d = await res.json(); router.push(`/messages?c=${d.conversationId}`); }
      else { const e = await res.json().catch(() => ({})); alert(e.message || "Could not open chat"); }
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  if (loading) return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" /></div></DashboardLayout>;
  if (!p) return <DashboardLayout><Card className="p-12 text-center text-zinc-500">User not found.</Card></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="p-6">
          <div className="flex items-start gap-4">
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt={p.fullName} className="w-20 h-20 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center text-2xl font-bold shrink-0">
                {p.fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground truncate">{p.fullName}</h1>
                {p.verified && <VerifiedBadge size={18} />}
              </div>
              <p className="text-sm text-zinc-500">{p.userId}</p>
              {(p.city || p.country) && (
                <p className="text-sm text-zinc-500 flex items-center gap-1 mt-1">
                  <MapPin size={13} /> {[p.city, p.country].filter(Boolean).join(", ")}
                </p>
              )}
              <div className="flex gap-4 mt-3 text-sm">
                <Link href={`/u/${p.id}/followers`} className="hover:underline">
                  <strong className="text-foreground">{p.followersCount}</strong> <span className="text-zinc-500">followers</span>
                </Link>
                <Link href={`/u/${p.id}/following`} className="hover:underline">
                  <strong className="text-foreground">{p.followingCount}</strong> <span className="text-zinc-500">following</span>
                </Link>
              </div>
            </div>
          </div>

          {!p.isSelf && (
            <div className="flex items-center gap-2 mt-5">
              {p.hasBlockedMe ? (
                <p className="text-sm text-zinc-500">You can&apos;t interact with this user.</p>
              ) : p.isBlocked ? (
                <Button variant="outline" onClick={toggleBlock} disabled={busy} className="flex-1">
                  <Ban size={16} className="mr-1" /> Unblock
                </Button>
              ) : (
                <>
                  <Button onClick={toggleFollow} disabled={busy} variant={p.isFollowing ? "outline" : "primary"} className="flex-1">
                    {p.isFollowing ? <><UserCheck size={16} className="mr-1" />Following</> : <><UserPlus size={16} className="mr-1" />Follow</>}
                  </Button>
                  <Button onClick={message} disabled={busy} className="flex-1 bg-blue-600 hover:bg-blue-700">
                    <MessageCircle size={16} className="mr-1" /> Message
                  </Button>
                  <div className="relative">
                    <Button variant="outline" onClick={() => setMenu((m) => !m)} className="px-2"><MoreVertical size={16} /></Button>
                    {menu && (
                      <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-10 py-1">
                        <button onClick={toggleBlock} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                          <Ban size={14} /> Block user
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
