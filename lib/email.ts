import { SITE_CONFIG } from "@/lib/constants";

/**
 * Minimal, dependency-free email sender.
 *
 * Uses the Resend HTTP API (https://resend.com) when RESEND_API_KEY is set — no npm
 * package required, just a fetch call. If no key is configured, it logs and no-ops so
 * that a missing mail setup never breaks an API request (fire-and-forget by design).
 *
 * Env:
 *   RESEND_API_KEY   API key from resend.com
 *   EMAIL_FROM       verified sender, e.g. "HustleClickGH <info@hustleclickgh.com>"
 */

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || `HustleClickGH <${SITE_CONFIG.contact.email}>`;

  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping email to ${opts.to} (subject: "${opts.subject}")`
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[email] Resend responded ${res.status}: ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Failed to send:", err);
    return false;
  }
}
