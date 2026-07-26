/**
 * Live USD → GHS conversion. Buyers pay in USD; contributors are paid in Cedis,
 * so the admin needs the current Cedi value of a buyer's payment.
 *
 * The rate is fetched live from a free FX API and cached in-memory (~1h) to avoid
 * hammering it. On any failure it falls back to the last cached rate, then the
 * NEXT_PUBLIC_USD_TO_GHS env value, then a hardcoded default.
 */

const FALLBACK_RATE = 11.6; // used only if live + cache + env all fail
const TTL_MS = 60 * 60 * 1000; // cache the live rate for an hour
const SOURCE = "https://open.er-api.com/v6/latest/USD"; // free, no API key, includes GHS

let cache: { rate: number; at: number } | null = null;

/** Env-configured or hardcoded fallback (no network). */
export function fallbackRate(): number {
  const r = Number(process.env.NEXT_PUBLIC_USD_TO_GHS);
  return r > 0 ? r : FALLBACK_RATE;
}

/** Current USD→GHS rate — live (cached ~1h), degrading to cache/env/default. */
export async function getUsdToGhsRate(): Promise<number> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rate;
  try {
    const res = await fetch(SOURCE, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data?.rates?.GHS);
      if (rate > 0) {
        cache = { rate, at: Date.now() };
        return rate;
      }
    }
  } catch {
    /* fall through to fallback */
  }
  return cache?.rate ?? fallbackRate();
}

/** Convert with an already-resolved rate (pure). */
export function convertUsdToGhs(usd: number, rate: number): number {
  return Math.round(usd * rate * 100) / 100;
}
export function convertGhsToUsd(ghs: number, rate: number): number {
  return rate > 0 ? Math.round((ghs / rate) * 100) / 100 : 0;
}
