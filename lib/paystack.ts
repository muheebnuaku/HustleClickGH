import crypto from "crypto";

/**
 * Minimal Paystack client (https://paystack.com/docs/api/). Amounts are in the
 * smallest unit (pesewas for GHS). Payment results are always confirmed by
 * calling Paystack's verify endpoint from the server — never trusted from the
 * browser or from a webhook body alone.
 */

const API = () => (process.env.PAYSTACK_API_BASE || "https://api.paystack.co").replace(/\/$/, "");

/** The secret key, tolerating quotes, spaces or a trailing newline pasted into the dashboard. */
function secretKey(): string {
  return (process.env.PAYSTACK_SECRET_KEY || "").trim().replace(/^["']+|["']+$/g, "").trim();
}

export function isPaystackConfigured(): boolean {
  return /^sk_(live|test)_\w+$/.test(secretKey());
}

/** Why online payment is off, in words an admin can act on (null when it's fine). Never reveals the key. */
export function paystackProblem(): string | null {
  const key = secretKey();
  if (!key) return "PAYSTACK_SECRET_KEY is not set for this deployment (check it's ticked for this environment, then redeploy).";
  if (key.startsWith("pk_")) return "PAYSTACK_SECRET_KEY contains the PUBLIC key (pk_…). Paste the SECRET key (sk_live_… or sk_test_…).";
  if (!/^sk_(live|test)_/.test(key)) return `PAYSTACK_SECRET_KEY doesn't look like a Paystack secret key (it starts with "${key.slice(0, 3)}…", expected "sk_live_" or "sk_test_").`;
  if (!/^sk_(live|test)_\w+$/.test(key)) return "PAYSTACK_SECRET_KEY has extra characters (spaces or line breaks inside it). Paste it again on one line.";
  return null;
}

export function paystackMode(): "live" | "test" | null {
  const key = secretKey();
  return key.startsWith("sk_live_") ? "live" : key.startsWith("sk_test_") ? "test" : null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API() + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
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
  const secret = secretKey();
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
