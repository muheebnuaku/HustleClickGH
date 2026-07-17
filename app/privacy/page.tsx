import Link from "next/link";
import { LegalShell } from "@/components/legal-shell";
import { SITE_CONFIG } from "@/lib/constants";

export const metadata = {
  title: "Privacy Policy — HustleClickGH",
  description: "How HustleClickGH collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your personal data — in line with the Ghana Data Protection Act, 2012 (Act 843) and GDPR principles."
    >
      <p>
        HustleClickGH (&quot;we&quot;, &quot;us&quot;) operates a platform that connects contributors in
        Ghana and beyond with organizations that need consented data to train artificial
        intelligence systems. This policy explains what personal data we collect, why, how we
        protect it, and the rights you have over it.
      </p>

      <h2>1. Who is responsible for your data</h2>
      <p>
        HustleClickGH is the data controller for the personal data described here. For any
        privacy request or question, contact us at{" "}
        <a href={`mailto:${SITE_CONFIG.contact.email}`}>{SITE_CONFIG.contact.email}</a>.
      </p>

      <h2>2. Data we collect</h2>
      <ul>
        <li><strong>Identity data:</strong> your full name and identity/ID document type and number (e.g. Ghana Card).</li>
        <li><strong>Contact data:</strong> email address and phone number.</li>
        <li><strong>Location data:</strong> your country, region, and city.</li>
        <li><strong>Contribution data:</strong> voice recordings, images, video, survey answers, and language/text data you submit to projects.</li>
        <li><strong>Account &amp; usage data:</strong> your user ID, referral information, balance and earnings, and activity/log data (including IP address) used for security.</li>
      </ul>

      <h2>3. Why we collect it (purpose &amp; lawful basis)</h2>
      <p>We process your data on the basis of your <strong>explicit consent</strong> and to perform our agreement with you, for the following purposes:</p>
      <ul>
        <li>To verify your identity and keep the platform secure and free of fraudulent accounts.</li>
        <li>To build consented, high-quality datasets used to train AI systems.</li>
        <li>To share contributed datasets with vetted partner organizations for the purposes you consented to.</li>
        <li>To pay you for approved contributions via Mobile Money.</li>
        <li>To comply with our legal obligations.</li>
      </ul>
      <p>We only use your data for the purposes described here (purpose limitation) and collect only what we need (data minimization).</p>

      <h2>4. Sharing your data</h2>
      <p>
        Contribution data may be shared with the specific partner organization(s) running the
        project you contributed to, under agreements that require them to respect this policy and
        your consent. We use service providers (e.g. cloud hosting and storage, Mobile Money
        processors) who process data on our behalf under contract. We do not sell your identity or
        contact data.
      </p>

      <h2>5. How we protect your data</h2>
      <ul>
        <li>Your ID number is <strong>encrypted at rest</strong> using strong (AES-256-GCM) encryption and is never displayed publicly.</li>
        <li>Access to sensitive data is restricted to authorized administrators.</li>
        <li>Passwords are hashed; connections are encrypted in transit.</li>
      </ul>

      <h2>6. How long we keep it</h2>
      <p>
        We keep your account data for as long as your account is active. Consent records are kept
        for the life of the account plus a reasonable period to evidence compliance. Contribution
        data is retained for the duration agreed with the relevant partner project. When data is no
        longer needed, it is deleted or anonymized. You may request deletion at any time (see
        Section 7).
      </p>

      <h2>7. Your rights</h2>
      <p>Under the Ghana Data Protection Act and GDPR principles you have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you and receive a copy (data export).</li>
        <li>Correct inaccurate data.</li>
        <li>Withdraw consent and request deletion of your account and data.</li>
        <li>Object to or restrict certain processing.</li>
      </ul>
      <p>
        You can export your data or delete your account from your{" "}
        <Link href="/account/data">Data &amp; Privacy</Link> page, or by emailing{" "}
        <a href={`mailto:${SITE_CONFIG.contact.email}`}>{SITE_CONFIG.contact.email}</a>.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        We may update this policy. Where changes are material, we will notify you and may ask you to
        re-confirm your consent before you continue using the platform.
      </p>
    </LegalShell>
  );
}
