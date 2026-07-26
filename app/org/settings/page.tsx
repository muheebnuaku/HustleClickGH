"use client";

import { useEffect, useState } from "react";
import { OrgLayout } from "@/components/org-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Building2, Mail, Phone, MapPin, KeyRound, ShieldCheck } from "lucide-react";

interface Me { name: string; workEmail: string; phone?: string | null; country?: string | null; mustSetPassword: boolean; }

export default function OrgSettings() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => fetch("/api/org/me").then((r) => r.ok ? r.json() : null).then((d) => setMe(d?.org ?? null)).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setNotice(null);
    if (pw.length < 8) { setNotice({ ok: false, text: "Password must be at least 8 characters." }); return; }
    if (pw !== pw2) { setNotice({ ok: false, text: "Passwords don't match." }); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/org/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword: pw }) });
      const d = await res.json();
      if (res.ok) { setNotice({ ok: true, text: "Password updated." }); setPw(""); setPw2(""); load(); }
      else setNotice({ ok: false, text: d.message || "Could not update password." });
    } catch { setNotice({ ok: false, text: "Could not update password." }); } finally { setBusy(false); }
  };

  if (loading) return <OrgLayout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div></OrgLayout>;

  return (
    <OrgLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Settings</h1>

        {me?.mustSetPassword && (
          <Card className="border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldCheck className="text-amber-600 mt-0.5 shrink-0" size={20} />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">Set your own password</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">You&rsquo;re still using the temporary password from your invite. Choose a new one below to secure your account.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Organization details */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 size={18} /> Organization</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm"><Building2 size={15} className="text-zinc-400 shrink-0" /><span className="text-zinc-500 w-20">Name</span><span className="text-foreground font-medium break-words">{me?.name}</span></div>
            <div className="flex items-center gap-3 text-sm"><Mail size={15} className="text-zinc-400 shrink-0" /><span className="text-zinc-500 w-20">Email</span><span className="text-foreground break-all">{me?.workEmail}</span></div>
            {me?.phone && <div className="flex items-center gap-3 text-sm"><Phone size={15} className="text-zinc-400 shrink-0" /><span className="text-zinc-500 w-20">Phone</span><span className="text-foreground">{me.phone}</span></div>}
            {me?.country && <div className="flex items-center gap-3 text-sm"><MapPin size={15} className="text-zinc-400 shrink-0" /><span className="text-zinc-500 w-20">Country</span><span className="text-foreground">{me.country}</span></div>}
            <p className="text-xs text-zinc-400 pt-1">To change these details, contact HustleClickGH.</p>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound size={18} /> {me?.mustSetPassword ? "Set your password" : "Change password"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {notice && <div className={`p-3 rounded-lg text-sm ${notice.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{notice.text}</div>}
            <div><label className="text-sm font-medium">New password</label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" /></div>
            <div><label className="text-sm font-medium">Confirm password</label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Re-enter password" /></div>
            <Button onClick={save} disabled={busy || !pw || !pw2} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? <><Loader2 size={16} className="mr-1 animate-spin" />Saving…</> : "Save password"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </OrgLayout>
  );
}
