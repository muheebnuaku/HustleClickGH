import crypto from "crypto";

/**
 * Field-level encryption for sensitive personal data (e.g. national ID numbers).
 *
 * Uses AES-256-GCM (authenticated encryption). The key comes from the
 * FIELD_ENCRYPTION_KEY env var, which must be 32 bytes encoded as base64 or hex.
 * Generate one with:  openssl rand -base64 32
 *
 * Encrypted values are stored as  v1:<iv>:<authTag>:<ciphertext>  (all base64),
 * so the format is self-describing and future key rotations can be versioned.
 */

const ALGO = "aes-256-gcm";
const PREFIX = "v1";

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY is not set — cannot encrypt/decrypt sensitive fields."
    );
  }
  // Accept base64 or hex; both must decode to exactly 32 bytes.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY must decode to 32 bytes (use: openssl rand -base64 32)."
    );
  }
  return key;
}

/** Encrypt a plaintext string. Returns the self-describing token described above. */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit nonce recommended for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt a token produced by encryptField. Returns null if the input is falsy. */
export function decryptField(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    // Not an encrypted value (e.g. legacy plaintext) — return as-is so reads don't crash.
    return token;
  }
  const key = getKey();
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Last N characters of a value, for masked display (e.g. "•••••• 1234"). */
export function lastChars(value: string, n = 4): string {
  return value.slice(-n);
}

/** Whether field encryption is configured (key present). */
export function isEncryptionConfigured(): boolean {
  return !!process.env.FIELD_ENCRYPTION_KEY;
}
