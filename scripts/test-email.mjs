/**
 * Verify your email credentials without registering a test account.
 *
 * Usage:
 *   node scripts/test-email.mjs you@example.com
 *
 * Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM from .env
 * (the same variables the app uses) and sends one test message.
 */
import "dotenv/config";
import nodemailer from "nodemailer";

const to = process.argv[2];
if (!to) {
  console.error("Usage: node scripts/test-email.mjs you@example.com");
  process.exit(1);
}

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;

console.log("Config:");
console.log("  SMTP_HOST :", SMTP_HOST || "(missing)");
console.log("  SMTP_PORT :", SMTP_PORT || "465 (default)");
console.log("  SMTP_USER :", SMTP_USER || "(missing)");
console.log("  SMTP_PASS :", SMTP_PASS ? "(set)" : "(missing)");
console.log("  EMAIL_FROM:", EMAIL_FROM || "(missing)");
console.log("");

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error("✗ Missing SMTP settings. Add them to .env then re-run.");
  process.exit(1);
}

const port = Number(SMTP_PORT || 465);
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

try {
  console.log("Verifying connection…");
  await transporter.verify();
  console.log("✓ Connected and authenticated");

  const info = await transporter.sendMail({
    from: EMAIL_FROM || SMTP_USER,
    to,
    subject: "HustleClickGH test email",
    html: "<p>If you can read this, your mail setup works. Reply to check the inbox routing.</p>",
  });

  console.log("✓ Sent:", info.messageId);
  console.log("  Check the inbox (and spam) of", to);
} catch (err) {
  console.error("✗ Failed:", err.message);
  console.error("\nCommon causes:");
  console.error("  • Wrong region host — try smtp.zoho.eu or smtp.zoho.in");
  console.error("  • Using your login password instead of an app-specific password");
  console.error("  • Mailbox not created yet, or domain not verified in Zoho");
  process.exit(1);
}
