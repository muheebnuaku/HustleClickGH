import Link from "next/link";
import { LegalShell } from "@/components/legal-shell";
import { SITE_CONFIG } from "@/lib/constants";

export const metadata = {
  title: "Terms of Service — HustleClickGH",
  description: "The terms governing your use of the HustleClickGH platform.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      subtitle="The terms governing your use of HustleClickGH."
    >
      <p>
        By creating an account or using HustleClickGH, you agree to these Terms. If you do not
        agree, please do not use the platform.
      </p>

      <h2>1. Eligibility &amp; accounts</h2>
      <ul>
        <li>You must be at least 18 years old and provide accurate registration information, including a valid identity document and your location.</li>
        <li>You are responsible for keeping your User ID and password secure. One account per person; duplicate or fraudulent accounts may be suspended.</li>
      </ul>

      <h2>2. Contributions &amp; consent</h2>
      <ul>
        <li>When you submit voice, image, video, survey, or language data, you confirm it is your own or you have the right to submit it, and you grant us and the relevant partner project a licence to use it to build and train AI datasets for the purposes you consented to.</li>
        <li>You must not submit content that is unlawful, or that infringes anyone else&apos;s rights or privacy.</li>
      </ul>

      <h2>3. Rewards &amp; payments</h2>
      <ul>
        <li>Approved contributions earn rewards in Ghana Cedis (GH₵), paid via Mobile Money subject to the minimum withdrawal threshold.</li>
        <li>We may reject or withhold rewards for submissions that fail quality review, are fraudulent, or breach these Terms.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to misuse the platform, attempt to bypass security, submit fake or automated data, or use another person&apos;s identity.</p>

      <h2>5. Suspension &amp; termination</h2>
      <p>We may suspend or terminate accounts that breach these Terms. You may close your account at any time from your <Link href="/account/data">Data &amp; Privacy</Link> page.</p>

      <h2>6. Privacy</h2>
      <p>Our handling of your personal data is described in our <Link href="/privacy">Privacy Policy</Link> and <Link href="/data-processing-agreement">Data Processing Agreement</Link>.</p>

      <h2>7. Contact</h2>
      <p>Questions about these Terms? Email <a href={`mailto:${SITE_CONFIG.contact.email}`}>{SITE_CONFIG.contact.email}</a>.</p>
    </LegalShell>
  );
}
