import crypto from "crypto";

/**
 * Paystack payment-in helper (organizations funding their wallet).
 *
 * Env:
 *   PAYSTACK_SECRET_KEY            server-only secret (sk_test_… / sk_live_…)
 *   NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY  public key (browser, optional for inline)
 *
 * Amounts are handled in GH₵ at the API boundary and converted to the smallest
 * unit (pesewas) for Paystack. If the secret key is absent, isPaystackConfigured
 * returns false and callers disable funding gracefully.
 */

const BASE = "https://api.paystack.co";

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY not configured");
  return key;
}

export interface InitResult {
  ok: boolean;
  authorizationUrl?: string;
  reference?: string;
  error?: string;
}

/** Start a transaction; returns the hosted checkout URL to redirect the org to. */
export async function initTransaction(opts: {
  email: string;
  amountGhs: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<InitResult> {
  if (!isPaystackConfigured()) return { ok: false, error: "Paystack not configured" };
  try {
    const res = await fetch(`${BASE}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: opts.email,
        amount: Math.round(opts.amountGhs * 100), // pesewas
        currency: "GHS",
        reference: opts.reference,
        callback_url: opts.callbackUrl,
        metadata: opts.metadata ?? {},
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.status) return { ok: false, error: data.message || "Init failed" };
    return { ok: true, authorizationUrl: data.data.authorization_url, reference: data.data.reference };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Init error" };
  }
}

export interface VerifyResult {
  ok: boolean;
  success: boolean;
  amountGhs?: number;
  reference?: string;
  error?: string;
}

/** Verify a transaction by reference (used on return + as webhook backstop). */
export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  if (!isPaystackConfigured()) return { ok: false, success: false, error: "Paystack not configured" };
  try {
    const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret()}` },
    });
    const data = await res.json();
    if (!res.ok || !data.status) return { ok: false, success: false, error: data.message || "Verify failed" };
    return {
      ok: true,
      success: data.data.status === "success",
      amountGhs: (data.data.amount ?? 0) / 100,
      reference: data.data.reference,
    };
  } catch (e) {
    return { ok: false, success: false, error: e instanceof Error ? e.message : "Verify error" };
  }
}

/** Validate a Paystack webhook signature (x-paystack-signature = HMAC-SHA512 of body). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const hash = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  return hash === signature;
}
