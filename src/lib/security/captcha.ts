import { env, flags } from "../env";
import { securityLogger } from "../logger";

/**
 * Cloudflare Turnstile (CAPTCHA) server-side verification. Protects the
 * unauthenticated, abuse-prone endpoints (login, register, OTP send) from bots
 * and credential-stuffing.
 *
 * Behaviour:
 *   - Disabled (SECURITY_CAPTCHA_ENABLED!="true"): always passes, so local dev
 *     and tests work without a Turnstile key.
 *   - Enabled but TURNSTILE_SECRET_KEY missing: fails closed (clear 500-ish
 *     error surfaced as CaptchaError) — never silently skip in prod.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 3000;

export class CaptchaError extends Error {
  public statusCode = 400;
  constructor(message = "CAPTCHA verification failed. Please try again.") {
    super(message);
    this.name = "CaptchaError";
  }
}

export async function verifyCaptcha(token: string | undefined | null, ip?: string | null): Promise<boolean> {
  if (!flags.captcha) return true; // disabled — pass through

  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    securityLogger.error({ action: "captcha.misconfigured" });
    throw new CaptchaError("CAPTCHA is enabled but not configured.");
  }

  if (!token) return false;

  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (ip) form.set("remoteip", ip);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timer));

    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (!data.success) {
      securityLogger.warn({ action: "captcha.failed", errors: data["error-codes"] });
    }
    return Boolean(data.success);
  } catch (err) {
    securityLogger.warn({ action: "captcha.error", err: String(err) });
    return false;
  }
}

/** Throw {@link CaptchaError} unless the token verifies (or CAPTCHA is off). */
export async function assertCaptcha(token: string | undefined | null, ip?: string | null): Promise<void> {
  const ok = await verifyCaptcha(token, ip);
  if (!ok) throw new CaptchaError();
}
