"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConsentAgreement } from "@/components/consent-agreement";
import { GHANA_REGIONS, ID_TYPES } from "@/lib/constants";
import { ShieldCheck, MapPin, IdCard, Sparkles } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    phone: "",
    country: "Ghana",
    region: "",
    city: "",
    idType: "ghana_card",
    idNumber: "",
  });
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [consentName, setConsentName] = useState("");

  const update_ = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    // If already completed, no need to be here.
    if (status === "authenticated" && session?.user?.profileCompleted) {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  // Prefill the signature with the user's name for convenience (they can edit).
  useEffect(() => {
    if (session?.user?.name && !consentName) setConsentName(session.user.name);
  }, [session, consentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.phone || form.phone.trim().length < 10) return setError("Please enter a valid phone number.");
    if (!form.region || !form.city) return setError("Please select your region and enter your city.");
    if (!form.idNumber || form.idNumber.trim().length < 4) return setError("Please enter a valid ID number.");
    if (!consentAgreed || consentName.trim().length < 2) {
      return setError("Please sign and agree to the Data Processing Agreement.");
    }

    setLoading(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, consentAgreed, consentName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong.");

      // Refresh the session token so the middleware onboarding gate reopens.
      await update();
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-100 via-white to-zinc-100 dark:from-zinc-950 dark:via-black dark:to-zinc-950 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center text-white">
            <Sparkles size={28} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Complete your profile</h1>
          <p className="text-zinc-500 text-sm mt-2">
            Before you start, we need a few details to verify your identity and keep the platform
            secure and compliant. This is a one-time step.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-6 shadow-sm"
        >
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          {/* Contact */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Phone number</label>
            <Input
              value={form.phone}
              onChange={(e) => update_("phone", e.target.value)}
              placeholder="+233 XX XXX XXXX"
              disabled={loading}
            />
          </div>

          {/* Location */}
          <div>
            <div className="flex items-center gap-2 text-foreground mb-2">
              <MapPin size={16} className="text-blue-600" />
              <span className="font-medium text-sm">Location</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Country</label>
                <Input value={form.country} onChange={(e) => update_("country", e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Region</label>
                <select
                  value={form.region}
                  onChange={(e) => update_("region", e.target.value)}
                  disabled={loading}
                  className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm"
                >
                  <option value="">Select…</option>
                  {GHANA_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">City / Town</label>
                <Input value={form.city} onChange={(e) => update_("city", e.target.value)} disabled={loading} />
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Not in Ghana? Enter your country and type your region/state and city.
            </p>
          </div>

          {/* Identity */}
          <div>
            <div className="flex items-center gap-2 text-foreground mb-2">
              <IdCard size={16} className="text-purple-600" />
              <span className="font-medium text-sm">Identity verification</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">ID type</label>
                <select
                  value={form.idType}
                  onChange={(e) => update_("idType", e.target.value)}
                  disabled={loading}
                  className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm"
                >
                  {ID_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">ID number</label>
                <Input
                  value={form.idNumber}
                  onChange={(e) => update_("idNumber", e.target.value)}
                  placeholder="e.g. GHA-XXXXXXXXX-X"
                  disabled={loading}
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
              <ShieldCheck size={12} className="text-green-600" />
              Your ID number is encrypted and never shown publicly.
            </p>
          </div>

          {/* Consent */}
          <ConsentAgreement
            agreed={consentAgreed}
            onAgreedChange={setConsentAgreed}
            signedName={consentName}
            onSignedNameChange={setConsentName}
            disabled={loading}
          />

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          >
            {loading ? "Saving…" : "Finish & continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
