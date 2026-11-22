"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Notice, PageHeader, PageSkeleton, Panel } from "@/components/ui/page-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeCheck, Bell, CheckCircle2, Clock, Crown, ImagePlus, Loader2, Zap } from "lucide-react";
import { uploadFile } from "@/lib/upload-file";
import { formatDate } from "@/lib/utils";

interface Status {
  premium: boolean;
  premiumUntil: string | null;
  verified: boolean;
  settings: { enabled: boolean; priceGhs: number; durationDays: number; earlyAccessHours: number; momoNumber: string; momoName: string };
  latest: { id: string; status: "pending" | "approved" | "rejected"; amount: number; reference: string; adminNote: string | null; createdAt: string } | null;
}

function periodLabel(days: number) {
  if (days === 365) return "year";
  if (days === 30 || days === 31) return "month";
  return `${days} days`;
}

export default function PremiumPage() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [momoNumber, setMomoNumber] = useState("");
  const [reference, setReference] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/premium");
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Could not load your plan");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your plan");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const upload = async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) return setError("Upload a screenshot (image) of the payment message.");
    if (file.size > 5 * 1024 * 1024) return setError("Keep the screenshot under 5 MB.");
    setUploading(true);
    try {
      const { url } = await uploadFile(file, "premium-receipts");
      setReceiptUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ momoNumber, reference, receiptUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Could not submit");
      setDone("Payment sent for review. We'll notify you once it's confirmed, usually within a day.");
      setMomoNumber("");
      setReference("");
      setReceiptUrl("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (!data) {
    return (
      <DashboardLayout>
        {error ? <Notice tone="error">{error}</Notice> : <PageSkeleton stats={0} rows={3} />}
      </DashboardLayout>
    );
  }

  const { settings, latest } = data;
  const period = periodLabel(settings.durationDays);
  const pending = latest?.status === "pending";
  const canPay = settings.enabled && !!settings.momoNumber && !pending;
  const benefits = [
    {
      icon: Zap,
      title: "New projects first",
      text: settings.earlyAccessHours
        ? `Start every new project ${settings.earlyAccessHours} hours before Basic members, while all the slots are still open.`
        : "Priority access to new projects.",
    },
    { icon: Bell, title: "Notified first", text: "Get a notification the moment a project launches. Basic members hear later." },
    { icon: BadgeCheck, title: "Verified tick", text: "Premium members can get the blue Verified tick once our team has checked their ID." },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader icon={Crown} title="Premium" description="Get new projects first and be notified before everyone else." />

        {done && <Notice tone="success">{done}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}

        <Panel className={data.premium ? "border-amber-300 bg-amber-50/60 p-5 dark:border-amber-900 dark:bg-amber-950/20" : "p-5"}>
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${data.premium ? "bg-amber-500 text-white" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>
              <Crown size={22} />
            </span>
            <div>
              <p className="text-lg font-semibold text-foreground">{data.premium ? "You're Premium" : "You're on Basic (free)"}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {data.premium
                  ? `Active until ${formatDate(data.premiumUntil)}. Renewing early adds a full ${period} on top.`
                  : `Upgrade for GH₵${settings.priceGhs} a ${period}.`}
              </p>
            </div>
          </div>
          {data.premium && !data.verified && (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Want the Verified tick? Make sure your ID is on your <Link href="/profile" className="text-blue-600 hover:underline">profile</Link>; our team checks it and adds the tick.
            </p>
          )}
        </Panel>

        <div className="grid gap-4 md:grid-cols-3">
          {benefits.map((b) => (
            <Panel key={b.title} className="p-5">
              <b.icon size={20} className="text-amber-500" />
              <p className="mt-2 font-semibold text-foreground">{b.title}</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{b.text}</p>
            </Panel>
          ))}
        </div>

        {latest && latest.status !== "approved" && (
          <Notice tone={latest.status === "pending" ? "info" : "error"}>
            {latest.status === "pending"
              ? `Your payment of GH₵${latest.amount} (transaction ${latest.reference}) is waiting for review. We'll notify you once it's confirmed.`
              : `Your last payment (transaction ${latest.reference}) couldn't be confirmed${latest.adminNote ? `: ${latest.adminNote}` : "."} You can submit it again below.`}
          </Notice>
        )}

        {!settings.enabled ? (
          <Notice tone="info">Premium upgrades are paused right now. Check back soon.</Notice>
        ) : !settings.momoNumber ? (
          <Notice tone="info">Premium payments open soon. Check back in a few days.</Notice>
        ) : canPay ? (
          <Panel className="space-y-4 p-5">
            <h2 className="font-semibold text-foreground">{data.premium ? "Renew Premium" : "Upgrade to Premium"}</h2>
            <ol className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              <li>
                1. Send <strong>GH₵{settings.priceGhs}</strong> by Mobile Money to <strong>{settings.momoNumber}</strong>
                {settings.momoName && <> ({settings.momoName})</>}.
              </li>
              <li>2. Enter the number you paid from and the transaction ID from the MoMo message.</li>
              <li>3. Upload a screenshot of the message, then submit.</li>
            </ol>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">MoMo number you paid from</label>
                <Input value={momoNumber} inputMode="tel" onChange={(e) => setMomoNumber(e.target.value)} placeholder="024 000 0000" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Transaction ID</label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 51234567890" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <ImagePlus size={15} className="mr-1.5" />}
                {receiptUrl ? "Change screenshot" : "Upload screenshot"}
              </Button>
              {receiptUrl && (
                <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                  <CheckCircle2 size={15} /> Screenshot added
                </span>
              )}
            </div>
            <Button onClick={submit} disabled={submitting || uploading || !momoNumber || !reference || !receiptUrl}>
              {submitting ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Crown size={15} className="mr-1.5" />}
              Submit payment
            </Button>
            <p className="text-xs text-zinc-500">
              Premium starts once our team confirms the payment. Premium does not guarantee any number of projects or earnings; every submission is still reviewed the same way.
            </p>
          </Panel>
        ) : pending ? (
          <Panel className="flex items-center gap-3 p-5 text-sm text-zinc-600 dark:text-zinc-400">
            <Clock size={18} className="text-blue-500" /> We&apos;re checking your payment. You can&apos;t submit another until this one is reviewed.
          </Panel>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
