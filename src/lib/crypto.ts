import crypto from "crypto";
import { env } from "./env";

/**
 * AES-256-GCM helpers for encrypting PII (PAN / Aadhaar / bank account) at
 * rest. Output format: base64(iv).base64(authTag).base64(cipherText).
 */
const ALGO = "aes-256-gcm";

function key() {
  // Derive a stable 32-byte key from APP_ENCRYPTION_KEY.
  return crypto.createHash("sha256").update(env.APP_ENCRYPTION_KEY).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, encB64] = payload.split(".");
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

/** Stable HMAC for things you need to lookup but not reverse (e.g. PAN dedupe). */
export function hmac(value: string): string {
  return crypto.createHmac("sha256", env.APP_ENCRYPTION_KEY).update(value).digest("hex");
}

/** Hash with sha256 — for API key secrets, OTP codes, etc. */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Mask sensitive values for logs / UI. "1234567890" → "******7890" */
export function mask(value: string, keep = 4): string {
  if (!value) return "";
  if (value.length <= keep) return "*".repeat(value.length);
  return "*".repeat(value.length - keep) + value.slice(-keep);
}
