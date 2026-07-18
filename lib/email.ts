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

/** Shared branded wrapper so all outgoing mail looks consistent. */
export function emailLayout(heading: string, bodyHtml: string): string {
  return `
  <div style="background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
      <div style="background:#0f172a;padding:20px 24px;">
        <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">HUSTLECLICKGH</p>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Ghana&rsquo;s AI Dataset Collection Platform</p>
      </div>
      <div style="padding:24px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">${heading}</h1>
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px;background:#fafafa;border-top:1px solid #e4e4e7;">
        <p style="margin:0;color:#71717a;font-size:12px;">
          Need help? Reply to this email or contact
          <a href="mailto:${SITE_CONFIG.contact.email}" style="color:#2563eb;">${SITE_CONFIG.contact.email}</a>.
        </p>
      </div>
    </div>
  </div>`;
}

/** Welcome email sent right after a contributor registers. */
export function welcomeEmail(fullName: string, userId: string) {
  const firstName = fullName.split(" ")[0] || "there";
  return {
    subject: `Welcome to HustleClickGH — your User ID is ${userId}`,
    html: emailLayout(`Welcome, ${firstName}!`, `
      <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
        Your account is ready. You sign in with your <strong>User ID</strong> and password —
        not your email address, so please keep this ID safe.
      </p>
      <div style="margin:20px 0;padding:16px;background:#f0fdf4;border:2px dashed #86efac;border-radius:10px;text-align:center;">
        <p style="margin:0 0 6px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Your User ID</p>
        <p style="margin:0;color:#16a34a;font-size:28px;font-weight:700;letter-spacing:3px;">${userId}</p>
      </div>
      <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
        You can now browse voice, survey and data projects, contribute, and get paid in GH&#8373;
        straight to Mobile Money once your submissions are approved.
      </p>
      <p style="margin:24px 0 0;">
        <a href="https://hustleclickgh.com/login"
           style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Sign in to your dashboard
        </a>
      </p>
    `),
  };
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
