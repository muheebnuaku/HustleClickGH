import crypto from "crypto";

/**
 * WebAuthn (passkey / biometric) helpers.
 *
 * The Relying Party ID and expected origin are derived from the incoming request
 * so this works on localhost in dev and on the deployed domain in production
 * without hardcoding. A passkey is bound to the domain it was registered on.
 */

export const RP_NAME = "HustleClickGH";
export const CHALLENGE_COOKIE = "webauthn_challenge";

/** Effective domain (host without port), used as the WebAuthn RP ID. */
export function getRpID(request: Request): string {
  const host = request.headers.get("host") || "localhost";
  return host.split(":")[0];
}

/** Full origin (scheme://host[:port]) the ceremony must match. */
export function getExpectedOrigin(request: Request): string {
  const host = request.headers.get("host") || "localhost:3000";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * Short-lived signed token proving a passkey was just verified server-side.
 * The login page hands this to NextAuth, which only needs to validate the token
 * (no WebAuthn crypto inside the auth provider). Signed with NEXTAUTH_SECRET.
 */
export function signAuthToken(userId: string, ttlMs = 120_000): string {
  const secret = process.env.NEXTAUTH_SECRET || "dev-secret";
  const exp = Date.now() + ttlMs;
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(sig)}`;
}

/** Returns the userId if the token is valid and unexpired, else null. */
export function verifyAuthToken(token: string): string | null {
  try {
    const secret = process.env.NEXTAUTH_SECRET || "dev-secret";
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return null;
    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", secret).update(payload).digest();
    const given = Buffer.from(sigB64, "base64url");
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    const [userId, expStr] = payload.split(".");
    if (!userId || !expStr) return null;
    if (Date.now() > Number(expStr)) return null;
    return userId;
  } catch {
    return null;
  }
}
