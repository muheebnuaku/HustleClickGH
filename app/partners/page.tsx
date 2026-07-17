"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PARTNER_PROJECT_TYPES, SITE_CONFIG } from "@/lib/constants";
import {
  Building2,
  Users,
  ShieldCheck,
  Globe2,
  Image as ImageIcon,
  Mic,
  Video,
  FileText,
  Languages,
  CheckCircle2,
  Send,
} from "lucide-react";

const DATA_TYPES = [
  { icon: ImageIcon, title: "Image datasets", desc: "Labelled photos, faces (with consent), objects & scenes." },
  { icon: Mic, title: "Voice & speech", desc: "Natural speech in English, Twi, Ga, Hausa and more." },
  { icon: Video, title: "Video", desc: "Recorded prompts, gestures and real-world scenarios." },
  { icon: FileText, title: "Surveys", desc: "Structured questionnaires and human feedback." },
  { icon: Languages, title: "Language & text", desc: "Transcriptions, translations and local-language corpora." },
];

const WHY_US = [
  { icon: Users, title: "A verified contributor network", desc: "Thousands of ID-verified contributors across all 16 regions of Ghana — and a growing international base." },
  { icon: ShieldCheck, title: "Consent-first & compliant", desc: "Every contributor signs a Data Processing Agreement. We operate under the Ghana Data Protection Act 2012 and GDPR principles." },
  { icon: Globe2, title: "Quality at scale", desc: "Built-in review, gender quotas, and per-project specifications so you get clean, usable data." },
];

export default function PartnersPage() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    workEmail: "",
    phone: "",
    country: "",
    projectType: "image_dataset",
    datasetSize: "",
    budgetRange: "",
    message: "",
  });

  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.companyName || !form.contactName || !form.workEmail || !form.message) {
      setError("Please fill in your company name, contact name, work email, and a short message.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="relative pt-28 pb-16 bg-slate-900 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 text-blue-200 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Building2 size={16} />
            For companies & AI teams
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6 leading-tight">
            Partner with HustleClickGH for
            <span className="block text-blue-400">
              consented, high-quality AI data
            </span>
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-8">
            Need voice, image, video or survey data collected ethically at scale? We connect your
            project to a verified network of contributors across Ghana and beyond.
          </p>
          <Button
            size="lg"
            className="bg-blue-500 hover:bg-blue-600 text-white text-lg px-8"
            asChild
          >
            <Link href="#inquiry">Start a project</Link>
          </Button>
        </div>
      </section>

      {/* Why partner */}
      <section className="py-16 bg-white dark:bg-zinc-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-foreground mb-12">Why partner with us</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {WHY_US.map((item) => (
              <div key={item.title} className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                  <item.icon size={28} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data types */}
      <section className="py-16 bg-zinc-50 dark:bg-zinc-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-foreground mb-4">Data we can collect</h2>
          <p className="text-center text-zinc-600 dark:text-zinc-400 mb-12 max-w-2xl mx-auto">
            From AI image datasets to multilingual speech — tell us what you need and we&apos;ll scope it with you.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {DATA_TYPES.map((item) => (
              <div
                key={item.title}
                className="bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6"
              >
                <div className="w-12 h-12 mb-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600">
                  <item.icon size={24} />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Inquiry form */}
      <section id="inquiry" className="py-16 bg-white dark:bg-zinc-950">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-3">Tell us about your project</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Send us the details and our team will get back to you at your work email. You can also
              reach us directly at{" "}
              <a href={`mailto:${SITE_CONFIG.contact.email}`} className="text-blue-600 hover:underline">
                {SITE_CONFIG.contact.email}
              </a>
              .
            </p>
          </div>

          {done ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-8 text-center">
              <CheckCircle2 size={48} className="text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-foreground mb-2">Thank you!</h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                We&apos;ve received your inquiry. Our team will reach out to you shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm border border-red-200 dark:border-red-800">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Company name *">
                  <Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} placeholder="Acme AI Ltd" disabled={submitting} />
                </Field>
                <Field label="Contact name *">
                  <Input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} placeholder="Your name" disabled={submitting} />
                </Field>
                <Field label="Work email *">
                  <Input type="email" value={form.workEmail} onChange={(e) => update("workEmail", e.target.value)} placeholder="you@company.com" disabled={submitting} />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+233 …" disabled={submitting} />
                </Field>
                <Field label="Country">
                  <Input value={form.country} onChange={(e) => update("country", e.target.value)} placeholder="Ghana" disabled={submitting} />
                </Field>
                <Field label="Project type *">
                  <select
                    value={form.projectType}
                    onChange={(e) => update("projectType", e.target.value)}
                    disabled={submitting}
                    className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PARTNER_PROJECT_TYPES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Estimated dataset size">
                  <Input value={form.datasetSize} onChange={(e) => update("datasetSize", e.target.value)} placeholder="e.g. 10k–50k images" disabled={submitting} />
                </Field>
                <Field label="Budget range">
                  <Input value={form.budgetRange} onChange={(e) => update("budgetRange", e.target.value)} placeholder="Optional" disabled={submitting} />
                </Field>
              </div>

              <Field label="Project details *">
                <textarea
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                  placeholder="Describe your dataset, quality requirements, languages, timelines…"
                  rows={5}
                  disabled={submitting}
                  className="flex w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </Field>

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {submitting ? "Sending…" : (<><Send size={18} /> Send inquiry</>)}
              </Button>
              <p className="text-xs text-zinc-500 text-center">
                By submitting, you agree that we may contact you about your inquiry. See our{" "}
                <Link href="/privacy" className="underline">Privacy Policy</Link>.
              </p>
            </form>
          )}
        </div>
      </section>

      <Footer />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}
