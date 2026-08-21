import { promises as dns } from "dns";

// Fast, zero-cost check that the email's DOMAIN can receive mail at all —
// catches typos ("gmial.com") and made-up domains before an account is even
// created. It can NOT catch a valid domain with a nonexistent mailbox (e.g.
// a typo'd Gmail address) — providers like Gmail deliberately accept mail
// for any address and bounce asynchronously later specifically to prevent
// this kind of check, which is what lib/email-bounce-check.ts is for.
const TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// "No such domain" is a confident negative; anything else (timeout, resolver
// hiccup) is inconclusive and should never block a real signup.
function isDefinitiveNoRecord(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return code === "ENOTFOUND" || code === "ENODATA";
}

export async function domainCanReceiveMail(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || !domain.includes(".")) return false;

  let mxWasDefinitiveNo = false;
  try {
    const mx = await withTimeout(dns.resolveMx(domain), TIMEOUT_MS);
    if (mx.length > 0) return true;
  } catch (err) {
    // No MX records — fall through to the RFC 5321 fallback: a domain with
    // no MX but a bare A/AAAA record can still accept mail there.
    mxWasDefinitiveNo = isDefinitiveNoRecord(err);
  }

  try {
    const addresses = await withTimeout(dns.resolve(domain), TIMEOUT_MS);
    return addresses.length > 0;
  } catch (err) {
    if (mxWasDefinitiveNo && isDefinitiveNoRecord(err)) return false; // confidently no mail server anywhere
    return true; // inconclusive (timeout/resolver issue) — don't block a real signup over it
  }
}
