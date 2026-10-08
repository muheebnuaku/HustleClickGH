"use client";

import { useEffect, useState } from "react";
import { OrgLayout } from "@/components/org-layout";
import { PageHeader, PageSkeleton, Panel, Notice } from "@/components/ui/page-kit";
import { SITE_CONFIG } from "@/lib/constants";
import { Loader2, Mail, Phone, MapPin, KeyRound, ShieldCheck, Eye, EyeOff, Settings, MessageCircle, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Me { name: string; workEmail: string; phone?: string | null; country?: string | null; mustSetPassword: boolean; }

const WHATSAPP = SITE_CONFIG.social.find((s) => s.key === "whatsapp");

export default function OrgSettings() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => fetch("/api/org/me").then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.org ?? null)).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const strength = [pw.length >= 8, /[A-Z]/.test(pw) && /[a-z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;

  const save = async () => {
    setNotice(null);
    if (pw.length < 8) { setNotice({ ok: false, text: "Password must be at least 8 characters." }); return; }
    if (pw !== pw2) { setNotice({ ok: false, text: "Passwords don't match." }); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/org/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword: pw }) });
      const d = await res.json();
      if (res.ok) { setNotice({ ok: true, text: "Password updated." }); setPw(""); setPw2(""); load(); }
      else setNotice({ ok: false, text: d.message || "Couldn't update the password." });
    } catch { setNotice({ ok: false, text: "Couldn't update the password." }); } finally { setBusy(false); }
  };

  if (loading) return <OrgLayout><PageSkeleton stats={0} rows={3} /></OrgLayout>;

  const initials = (me?.name || "HC").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const input = "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <OrgLayout>
      <div className="space-y-6">
        <PageHeader icon={Settings} title="Settings" description="Your organization profile, password and support." />

        {me?.mustSetPassword && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-300">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            <p><strong>Set your own password.</strong> You&apos;re still using the temporary password from your invite.</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            {/* Profile */}
            <Panel className="overflow-hidden">
              <div className="flex items-center gap-4 bg-gradient-to-br from-zinc-900 to-emerald-950 p-5 text-white">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-lg font-semibold">{initials}</span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{me?.name}</p>
                  <p className="text-sm text-zinc-300">Client account · HustleClickGH for Business</p>
                </div>
              </div>
              <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {[
                  { icon: Building2, k: "Organization", v: me?.name },
                  { icon: Mail, k: "Work email", v: me?.workEmail },
                  { icon: Phone, k: "Phone", v: me?.phone },
                  { icon: MapPin, k: "Country", v: me?.country },
                ].filter((r) => r.v).map((r) => (
                  <div key={r.k} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <r.icon size={15} className="shrink-0 text-zinc-400" />
                    <dt className="w-28 shrink-0 text-zinc-500">{r.k}</dt>
                    <dd className="min-w-0 break-all font-medium text-foreground">{r.v}</dd>
                  </div>
                ))}
              </dl>
              <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-400 dark:border-zinc-800">To change these details, message us and we&apos;ll update them.</p>
            </Panel>

            {/* Password */}
            <Panel className="p-5">
              <p className="flex items-center gap-2 font-semibold text-foreground"><KeyRound size={17} />{me?.mustSetPassword ? "Set your password" : "Change password"}</p>
              <div className="mt-4 space-y-3">
                {notice && <Notice tone={notice.ok ? "success" : "error"}>{notice.text}</Notice>}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">New password</span>
                  <div className="relative">
                    <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" className={cn(input, "pr-11")} />
                    <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600" aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                  {pw && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="grid flex-1 grid-cols-4 gap-1">
                        {[0, 1, 2, 3].map((i) => <span key={i} className={cn("h-1 rounded-full", i < strength ? (strength >= 3 ? "bg-emerald-500" : strength === 2 ? "bg-amber-500" : "bg-red-500") : "bg-zinc-200 dark:bg-zinc-800")} />)}
                      </div>
                      <span className="text-xs text-zinc-500">{strength >= 3 ? "Strong" : strength === 2 ? "Okay" : "Weak"}</span>
                    </div>
                  )}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Confirm password</span>
                  <input type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Type it again" className={input} />
                </label>
                <button onClick={save} disabled={busy || !pw || !pw2} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy && <Loader2 size={16} className="animate-spin" />}Save password
                </button>
              </div>
            </Panel>
          </div>

          {/* Support */}
          <div className="space-y-6">
            <Panel className="p-5">
              <p className="flex items-center gap-2 font-semibold text-foreground"><MessageCircle size={17} className="text-emerald-600" />Need help?</p>
              <p className="mt-1 text-sm text-zinc-500">Custom collection (face capture, ID photos, a specific country), pricing, or anything else — our team replies quickly.</p>
              {WHATSAPP && (
                <a href={WHATSAPP.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                  <MessageCircle size={16} />Chat on WhatsApp
                </a>
              )}
              {WHATSAPP && <p className="mt-2 text-center text-xs text-zinc-400">{WHATSAPP.handle}</p>}
            </Panel>
            <Panel className="p-5 text-sm text-zinc-500">
              <p className="mb-1 flex items-center gap-2 font-semibold text-foreground"><ShieldCheck size={16} className="text-emerald-600" />Your data, handled properly</p>
              Every item comes with the contributor&apos;s consent and the licence you chose. If someone later asks to be erased, we tell you which rows to delete.
            </Panel>
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
