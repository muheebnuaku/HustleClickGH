import crypto from "crypto";

/**
 * Minimal Paystack client (https://paystack.com/docs/api/). Amounts are in the
 * smallest unit (pesewas for GHS). Payment results are always confirmed by
 * calling Paystack's verify endpoint from the server — never trusted from the
 * browser or from a webhook body alone.
 */

const API = () => (process.env.PAYSTACK_API_BASE || "https://api.paystack.co").replace(/\/$/, "");

export function isPaystackConfigured(): boolean {
  return /^sk_(live|test)_\w+/.test(process.env.PAYSTACK_SECRET_KEY || "");
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API() + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || !body.status || !body.data) throw new Error(`Paystack: ${body.message || `HTTP ${res.status}`}`);
  return body.data;
}

export function initializeTransaction(opts: {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}) {
  return call<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: opts.email,
      amount: opts.amountMinor,
      currency: opts.currency,
      reference: opts.reference,
      callback_url: opts.callbackUrl,
      metadata: opts.metadata,
    }),
  });
}

export interface VerifiedTransaction {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amount: number; // minor units
  currency: string;
  paid_at?: string | null;
  channel?: string;
  metadata?: Record<string, unknown> | string | null;
}

export function verifyTransaction(reference: string) {
  return call<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function isValidWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
