import Link from "next/link";
import { LegalShell } from "@/components/legal-shell";
import { SITE_CONFIG } from "@/lib/constants";
import { CONSENT_VERSION } from "@/lib/legal";

export const metadata = {
  title: "Data Processing Agreement — HustleClickGH",
  description: "The agreement you sign consenting to how HustleClickGH processes your personal data.",
};

export default function DataProcessingAgreementPage() {
  return (
    <LegalShell
      title="Data Processing Agreement"
      subtitle={`Version ${CONSENT_VERSION} — the agreement you sign when you register or complete your profile.`}
    >
      <p>
        This Data Processing Agreement (&quot;Agreement&quot;) sets out the terms on which
        HustleClickGH collects and processes your personal data. You are asked to read and sign it
        (by typing your full name and ticking the consent box) before contributing on the platform.
        It should be read together with our <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>1. What you consent to</h2>
      <p>By signing, you consent to HustleClickGH collecting and processing:</p>
      <ul>
        <li>your identity details (name and ID document type and number),</li>
        <li>your contact details (email and phone),</li>
        <li>your location (country, region, city), and</li>
        <li>the voice, image, video, survey, and language data you choose to contribute,</li>
      </ul>
      <p>for the purpose of building consented AI training datasets.</p>

      <h2>2. Sharing with partner organizations</h2>
      <p>
        You understand and agree that datasets you contribute to may be shared with vetted partner
        organizations (including AI companies) that commission projects on the platform, solely for
        the AI-training purposes described to you, and under agreements requiring them to protect
        your data.
      </p>

      <h2>3. Security</h2>
      <p>
        Your ID number is stored encrypted and is not shown publicly. We apply access controls and
        other safeguards described in our Privacy Policy.
      </p>

      <h2>4. Your control</h2>
      <ul>
        <li>Your consent is voluntary and specific to the purposes above.</li>
        <li>You may withdraw consent and request deletion of your data at any time via your <Link href="/account/data">Data &amp; Privacy</Link> page or by emailing <a href={`mailto:${SITE_CONFIG.contact.email}`}>{SITE_CONFIG.contact.email}</a>. Withdrawing consent does not affect processing already carried out lawfully.</li>
        <li>We keep an auditable record of the version of this Agreement you signed and when.</li>
      </ul>

      <h2>5. Updates</h2>
      <p>
        If we materially change this Agreement, we will increment its version and may require you to
        re-sign before continuing to use the platform.
      </p>

      <p className="text-xs text-zinc-500">
        By registering or completing your profile, you confirm that you have read, understood, and
        agreed to this Agreement (v{CONSENT_VERSION}).
      </p>
    </LegalShell>
  );
}
