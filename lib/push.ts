import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { SITE_CONFIG } from "@/lib/constants";

/**
 * Web Push helper (VAPID).
 *
 * Env:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  public key (also read by the browser to subscribe)
 *   VAPID_PRIVATE_KEY             private key — server only
 *
 * Generate a pair with:  npx web-push generate-vapid-keys
 */

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(`mailto:${SITE_CONFIG.contact.email}`, publicKey, privateKey);
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send a notification to every stored subscription (optionally a subset of users).
 * Subscriptions rejected as gone (404/410) are pruned automatically.
 */
export async function sendPushToAll(
  payload: PushPayload,
  userIds?: string[]
): Promise<{ sent: number; failed: number; removed: number }> {
  if (!ensureConfigured()) {
    console.warn("[push] VAPID keys not configured — skipping notification");
    return { sent: 0, failed: 0, removed: 0 };
  }

  const subs = await prisma.pushSubscription.findMany({
    where: userIds?.length ? { userId: { in: userIds } } : undefined,
  });

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 404/410 mean the browser dropped the subscription — clean it up
        if (statusCode === 404 || statusCode === 410) {
          stale.push(s.id);
        } else {
          failed++;
          console.error("[push] send failed:", statusCode ?? err);
        }
      }
    })
  );

  if (stale.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
  }

  return { sent, failed, removed: stale.length };
}
