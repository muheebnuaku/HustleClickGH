import crypto from "crypto";

/**
 * Paystack payment-in helper (organizations funding their wallet).
 *
 * Env:
 *   PAYSTACK_SECRET_KEY            server-only secret (sk_test_… / sk_live_…)
 *   NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY  public key (browser, optional for inline)
 *   PAYSTACK_CURRENCY              currency Paystack charges in: "GHS" (default) or "USD"
 *
 * Org wallets are in US dollars. A Ghana Paystack account only takes USD once
 * USD is enabled on it (otherwise checkout fails with "No active channel to
 * process transaction"), so by default we charge the cedi equivalent at the live
 * rate and credit the dollar amount. Amounts go to Paystack in the smallest unit.
 * If the secret key is absent, isPaystackConfigured returns false and callers
 * disable funding gracefully.
 */

export type ChargeCurrency = "GHS" | "USD";
export function chargeCurrency(): ChargeCurrency {
  return process.env.PAYSTACK_CURRENCY?.toUpperCase() === "USD" ? "USD" : "GHS";
}

// Overridable only so tests can point at a local fake Paystack.
const BASE = process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

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
  /** Amount in `currency` (major units). */
  amount: number;
  currency: ChargeCurrency;
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
        amount: Math.round(opts.amount * 100), // pesewas / cents
        currency: opts.currency,
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
  /** Amount actually paid, major units, in `currency`. */
  amount?: number;
  currency?: string;
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
      amount: (data.data.amount ?? 0) / 100,
      currency: data.data.currency,
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
