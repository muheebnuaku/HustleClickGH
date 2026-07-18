import { SITE_CONFIG } from "@/lib/constants";

/**
 * Email sender with two interchangeable transports.
 *
 * 1. SMTP (e.g. Zoho Mail) — used when SMTP_HOST/SMTP_USER/SMTP_PASS are set.
 *    Preferred when you host the mailbox yourself, so sent mail lands in the
 *    account's Sent folder and replies come back to the same inbox.
 * 2. Resend HTTP API — used when RESEND_API_KEY is set and SMTP is not.
 *
 * If neither is configured it logs and no-ops, so a missing mail setup never
 * breaks an API request (everything here is fire-and-forget by design).
 *
 * Env (Zoho example):
 *   SMTP_HOST=smtp.zoho.com     (smtp.zoho.eu / .in depending on your region)
 *   SMTP_PORT=465               (465 = SSL, 587 = STARTTLS)
 *   SMTP_USER=info@hustleclickgh.com
 *   SMTP_PASS=<app-specific password>
 *   EMAIL_FROM=HustleClickGH <info@hustleclickgh.com>
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

/** Sent when an admin asks a user to provide their location. */
export function locationRequestEmail(fullName: string) {
  const firstName = fullName.split(" ")[0] || "there";
  return {
    subject: "Please add your location to HustleClickGH",
    html: emailLayout(`Hi ${firstName},`, `
      <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
        We still don&rsquo;t have your location on file. Adding it lets us match you with
        projects available in your area — some projects are limited to specific regions.
      </p>
      <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
        It takes a few seconds: sign in and you&rsquo;ll see a short prompt asking for your
        country, region and city.
      </p>
      <p style="margin:24px 0 0;">
        <a href="https://hustleclickgh.com/dashboard"
           style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Add my location
        </a>
      </p>
    `),
  };
}

/** Sent when an admin verifies a user's account. */
export function accountVerifiedEmail(fullName: string) {
  const firstName = fullName.split(" ")[0] || "there";
  return {
    subject: "Your HustleClickGH account is verified ✅",
    html: emailLayout(`You&rsquo;re verified, ${firstName}!`, `
      <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
        Your account has been reviewed and verified by our team. A blue verification badge
        now appears next to your name across the platform.
      </p>
      <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
        Verified contributors are trusted for a wider range of projects — keep contributing
        quality data to stay verified.
      </p>
      <p style="margin:24px 0 0;">
        <a href="https://hustleclickgh.com/dashboard"
           style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Go to my dashboard
        </a>
      </p>
    `),
  };
}

/** Admin-composed broadcast. Plain text is converted to paragraphs. */
export function broadcastEmail(subject: string, message: string, fullName?: string) {
  const firstName = fullName?.split(" ")[0];
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="color:#3f3f46;font-size:14px;line-height:1.6;">${p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br/>")}</p>`
    )
    .join("");

  return {
    subject,
    html: emailLayout(firstName ? `Hi ${firstName},` : subject, paragraphs),
  };
}

export interface SendResult {
  ok: boolean;
  /** Human-readable failure reason, surfaced to admins in the UI. */
  error?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || `HustleClickGH <${SITE_CONFIG.contact.email}>`;

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  // Preferred transport: SMTP (Zoho and friends)
  if (smtpHost && smtpUser && smtpPass) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const port = Number(process.env.SMTP_PORT || 465);
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465, // 465 = implicit SSL, 587 = STARTTLS
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      });
      return { ok: true };
    } catch (err) {
      // Surface the provider's actual complaint (rate limit, bad login, bad
      // recipient…) instead of a silent false.
      const e = err as { responseCode?: number; response?: string; message?: string };
      const reason = [e.responseCode ? `SMTP ${e.responseCode}` : null, e.response || e.message]
        .filter(Boolean)
        .join(": ") || "Unknown SMTP error";
      console.error("[email] SMTP send failed:", reason);
      return { ok: false, error: reason };
    }
  }

  if (!apiKey) {
    const reason = "No email transport configured (SMTP_* or RESEND_API_KEY missing)";
    console.warn(`[email] ${reason} — skipping email to ${opts.to}`);
    return { ok: false, error: reason };
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
      const reason = `Resend ${res.status}: ${detail}`;
      console.error(`[email] ${reason}`);
      return { ok: false, error: reason };
    }
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    console.error("[email] Failed to send:", reason);
    return { ok: false, error: reason };
  }
}
