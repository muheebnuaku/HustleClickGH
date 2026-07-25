import crypto from "crypto";

/**
 * Submission anti-fraud helpers: content hashing (duplicate detection) and
 * velocity limits (farming). Kept advisory + cheap — hashing is capped by size
 * so large consented call recordings don't get fetched/hashed on every submit.
 */

export const HASH_MAX_MB = 40;          // don't fetch/hash files bigger than this
export const VELOCITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const VELOCITY_MAX = 20;         // max submissions per user per window

/**
 * SHA-256 of a submitted file, fetched from its (blob or local) URL. Returns
 * null if the file is too large or can't be fetched — hashing is best-effort.
 * `requestUrl` lets relative dev URLs (/uploads/…) resolve to an absolute URL.
 */
export async function hashFileFromUrl(fileUrl: string, requestUrl: string, sizeMB: number): Promise<string | null> {
  if (sizeMB > HASH_MAX_MB) return null;
  try {
    const abs = fileUrl.startsWith("http") ? fileUrl : new URL(fileUrl, requestUrl).toString();
    const res = await fetch(abs, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}
