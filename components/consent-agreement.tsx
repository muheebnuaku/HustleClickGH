"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { CONSENT_SUMMARY, CONSENT_VERSION } from "@/lib/legal";
import { ShieldCheck } from "lucide-react";

interface ConsentAgreementProps {
  agreed: boolean;
  onAgreedChange: (v: boolean) => void;
  signedName: string;
  onSignedNameChange: (v: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * Explicit, opt-in consent block. Renders the agreement summary, a typed-name
 * e-signature, and an unbundled checkbox. Consent is captured server-side as a
 * ConsentRecord (auditable, versioned). See lib/legal.ts for the version.
 */
export function ConsentAgreement({
  agreed,
  onAgreedChange,
  signedName,
  onSignedNameChange,
  disabled,
  compact,
}: ConsentAgreementProps) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-foreground">
        <ShieldCheck size={18} className="text-green-600" />
        <span className="font-medium text-sm">Data Processing Agreement (v{CONSENT_VERSION})</span>
      </div>

      <p className={`text-zinc-600 dark:text-zinc-400 ${compact ? "text-xs" : "text-sm"}`}>
        {CONSENT_SUMMARY}
      </p>

      <p className="text-xs text-zinc-500">
        Read the full{" "}
        <Link href="/data-processing-agreement" target="_blank" className="text-blue-600 hover:underline">
          Data Processing Agreement
        </Link>
        {", "}
        <Link href="/privacy" target="_blank" className="text-blue-600 hover:underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/terms" target="_blank" className="text-blue-600 hover:underline">
          Terms
        </Link>
        .
      </p>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          Type your full legal name to sign
        </label>
        <Input
          value={signedName}
          onChange={(e) => onSignedNameChange(e.target.value)}
          placeholder="Full legal name"
          disabled={disabled}
          className="h-10 rounded-lg bg-white dark:bg-zinc-950"
        />
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => onAgreedChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-green-600 focus:ring-green-500"
        />
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          I have read and agree to the Data Processing Agreement and Privacy Policy, and I consent
          to my personal data being processed as described.
        </span>
      </label>
    </div>
  );
}
