import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { deleteUserAccount } from "@/lib/user-deletion";

// ---------------------------------------------------------------------------
// Catches the half of "fake email" that a domain-level check (see
// lib/email-domain-check.ts) can't: a real domain (gmail.com) with a
// mailbox that doesn't exist. Providers like Gmail accept the message at
// connect-time and bounce it asynchronously later specifically to prevent
// proactive verification — so the only way to see it is to look at the
// bounce notification that eventually lands in the sending mailbox.
//
// Reuses the existing Zoho SMTP credentials (SMTP_USER/SMTP_PASS) over IMAP.
// Deliberately heuristic: bounce message formats vary by provider, so this
// won't catch every one — it's tuned to the common "Mail Delivery
// Subsystem" pattern (the kind Gmail sends), not a general parser. If the
// app is ever switched to send transactional mail via Resend/SendGrid/etc.
// instead of Zoho, this stops being effective and should be replaced with
// that provider's bounce webhook instead.
// ---------------------------------------------------------------------------

const LOOKBACK_DAYS = 3;
const PROCESSED_FLAG = "LanaBounceChecked";

// Soft throttle so this can ALSO be triggered from the admin panel's 30s
// poll (for near-live detection while an admin is actively watching) without
// hammering the IMAP server with a fresh login every 30 seconds. Best-effort
// only — serverless instances don't reliably persist this across cold
// starts, which just means an occasional extra check, never a missed one.
const MIN_CHECK_INTERVAL_MS = 3 * 60 * 1000;
let lastCheckStartedAt = 0;

const BOUNCE_SENDER_PATTERN = /mailer-daemon|postmaster|mail delivery subsystem/i;
const BOUNCE_SUBJECT_PATTERN = /undeliver|delivery status notification|delivery has failed|failure notice|returned mail|mail delivery failed/i;

function imapHostFromSmtpHost(smtpHost: string): string {
  return smtpHost.replace(/^smtp\./i, "imap.");
}

function extractBouncedRecipient(bodyText: string, knownEmails: Set<string>): string | null {
  // Try the structured DSN fields first (RFC 3464 — what the Google/Zoho
  // example bounce actually used).
  const structured = bodyText.match(/(?:Final|Original)-Recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/i);
  if (structured?.[1]) return structured[1].toLowerCase();

  // Fall back to: any email address mentioned in the bounce body that
  // happens to match a real user — sidesteps needing to parse every
  // provider's exact NDR wording.
  const allEmails = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  for (const e of allEmails) {
    const lower = e.toLowerCase();
    if (knownEmails.has(lower)) return lower;
  }
  return null;
}

export async function checkForBouncedWelcomeEmails(opts: { throttle?: boolean } = {}): Promise<{ checked: number; bouncesFound: number; deleted: number; skipped?: string }> {
  if (opts.throttle && Date.now() - lastCheckStartedAt < MIN_CHECK_INTERVAL_MS) {
    return { checked: 0, bouncesFound: 0, deleted: 0, skipped: "throttled" };
  }
  lastCheckStartedAt = Date.now();

  const { SMTP_HOST, SMTP_USER, SMTP_PASS, IMAP_HOST, IMAP_PORT } = process.env;
  if (!SMTP_USER || !SMTP_PASS || !(IMAP_HOST || SMTP_HOST)) {
    return { checked: 0, bouncesFound: 0, deleted: 0, skipped: "IMAP not configured (need SMTP_USER/SMTP_PASS and SMTP_HOST or IMAP_HOST)" };
  }

  const host = IMAP_HOST || imapHostFromSmtpHost(SMTP_HOST!);
  const port = IMAP_PORT ? Number(IMAP_PORT) : 993;

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    logger: false,
  });

  let checked = 0;
  let bouncesFound = 0;
  let deleted = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const uids = await client.search({ since, unKeyword: PROCESSED_FLAG }, { uid: true });
      if (!uids || uids.length === 0) return { checked: 0, bouncesFound: 0, deleted: 0 };

      // Known emails to match against, fetched once for the whole batch.
      // lastSeenAt matters: the welcome email is the ONLY place the User ID
      // is ever shown (see app/login/page.tsx — deliberately not on-screen),
      // so if it bounced AND the account has never shown any dashboard
      // activity, there is no possible way that person ever logged in. That
      // makes a bounce here about as close to zero-false-positive as a
      // fraud signal gets, unlike the pattern/heuristic checks elsewhere,
      // which stay conservative on purpose.
      const users = await prisma.user.findMany({ where: { role: "user" }, select: { id: true, email: true, fullName: true, userId: true, lastSeenAt: true } });
      const emailMap = new Map(users.map((u) => [u.email.toLowerCase(), u]));
      const knownEmails = new Set(emailMap.keys());

      for (const uid of uids) {
        checked++;
        try {
          const { content } = await client.download(String(uid), undefined, { uid: true });
          const parsed = await simpleParser(content);
          const fromAddr = parsed.from?.value?.[0]?.address ?? "";
          const subject = parsed.subject ?? "";
          const bodyText = parsed.text ?? parsed.html?.toString() ?? "";

          const isBounce = BOUNCE_SENDER_PATTERN.test(fromAddr) || BOUNCE_SUBJECT_PATTERN.test(subject);
          if (isBounce) {
            const bouncedEmail = extractBouncedRecipient(bodyText, knownEmails);
            const user = bouncedEmail ? emailMap.get(bouncedEmail) : null;
            if (user) {
              const existing = await prisma.lanaCase.findFirst({
                where: { type: "bounced_email", subjectUserId: user.id, status: { in: ["open", "auto_actioned"] } },
              });
              if (!existing) {
                if (user.lastSeenAt === null) {
                  await deleteUserAccount(user.id, { reason: "admin_action" });
                  await logActivity({
                    type: "lana_auto_action",
                    userId: user.id,
                    userName: user.fullName,
                    severity: "warning",
                    metadata: { action: "deleted", reason: `Welcome email to "${bouncedEmail}" hard-bounced (no such mailbox) and the account never showed any activity — the User ID was only ever sent by email, so this address was never reachable.`, source: "bounce_check" },
                  });
                  await prisma.lanaCase.create({
                    data: {
                      type: "bounced_email",
                      subjectUserId: user.id,
                      relatedUserIds: "[]",
                      riskScore: 90,
                      summary: `${user.fullName} (${user.userId}) auto-deleted — welcome email to "${bouncedEmail}" bounced (no such mailbox), account never used`,
                      reasoning: `Hard bounce ("${subject}") on the only email that ever contained this account's User ID, and zero dashboard activity since — there's no way this person could have ever logged in. Deleted automatically.`,
                      proposedAction: "delete_account",
                      status: "resolved_approved",
                      resolvedAt: new Date(),
                      autoActionTaken: "deleted",
                    },
                  });
                  deleted++;
                } else {
                  // Has shown activity despite the bounce — maybe a changed
                  // email after signup. Flag instead of auto-deleting.
                  await prisma.lanaCase.create({
                    data: {
                      type: "bounced_email",
                      subjectUserId: user.id,
                      relatedUserIds: "[]",
                      riskScore: 40,
                      summary: `${user.fullName} (${user.userId})'s welcome email hard-bounced — "${bouncedEmail}" may not be a real mailbox`,
                      reasoning: `An email sent to this account's registered address came back as undeliverable ("${subject}"), but the account has shown dashboard activity since — not auto-deleted, worth a manual look (e.g. they may have changed their email after signup).`,
                      proposedAction: "investigate",
                    },
                  });
                }
                bouncesFound++;
              }
            }
          }
        } catch (err) {
          console.error(`[lana] failed to parse message uid=${uid}:`, err);
        } finally {
          // Mark processed either way, so a message we can't parse doesn't
          // get retried forever.
          await client.messageFlagsAdd({ uid: String(uid) }, [PROCESSED_FLAG], { uid: true }).catch(() => {});
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error("[lana] bounce-mailbox check failed:", err);
    return { checked, bouncesFound, deleted, skipped: err instanceof Error ? err.message : "IMAP connection failed" };
  } finally {
    await client.logout().catch(() => {});
  }

  return { checked, bouncesFound, deleted };
}
