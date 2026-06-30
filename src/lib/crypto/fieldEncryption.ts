import crypto from "crypto";
import { requireEnv } from "../env";

/**
 * Authenticated field-level encryption (AES-256-GCM) for PII at rest —
 * bank account numbers, IFSC, Aadhaar references, etc.
 *
 * Storage format (single string, safe for a Prisma `String` column):
 *   v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
 *
 * The "v1" prefix lets us rotate algorithms/keys later without ambiguity.
 * GCM provides integrity: tampered ciphertext fails to decrypt rather than
 * returning garbage.
 */

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, recommended for GCM

let cachedKey: Buffer | null = null;

/** Derive a stable 32-byte key from APP_ENCRYPTION_KEY (accepts any length). */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = requireEnv("APP_ENCRYPTION_KEY");
  // sha256 yields exactly 32 bytes regardless of the configured key length.
  cachedKey = crypto.createHash("sha256").update(secret).digest();
  return cachedKey;
}

/** Encrypt a plaintext string. Returns the versioned, self-describing token. */
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt a token produced by `encryptField`. Throws if tampered or malformed. */
export function decryptField(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("[crypto] Unrecognized ciphertext format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** True if a value looks like a v1 ciphertext token (helps migrations). */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}:`);
}

/**
 * Mask sensitive values for display/logs, e.g. an account number
 * "1234567890" -> "******7890". Never log the raw value.
 */
export function maskTail(value: string, visible = 4): string {
  if (value.length <= visible) return "*".repeat(value.length);
  return "*".repeat(value.length - visible) + value.slice(-visible);
}
