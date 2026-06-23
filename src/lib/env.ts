/**
 * Runtime environment loader.
 *
 * Design notes:
 * - All secrets are OPTIONAL at parse time. This lets `next build` succeed
 *   even when secrets are not present (e.g. on a CI runner that builds the
 *   container but does not need to invoke crypto/auth code paths).
 * - Use `requireEnv("KEY")` at the actual call site that needs the secret.
 *   That gives a clear runtime error pointing to the missing key.
 * - In production at runtime, a missing secret causes a 500 with a clear
 *   message — never a silent fallback to insecure defaults.
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Auth — optional at parse time, enforced via requireEnv() at runtime.
  NEXTAUTH_SECRET: z.string().min(16).optional(),
  JWT_SECRET: z.string().min(16).optional(),
  APP_ENCRYPTION_KEY: z.string().min(16).optional(),

  // Neon — optional so the build pipeline doesn't fail without a DB.
  DATABASE_URL: z.string().min(20).optional(),
  DIRECT_URL: z.string().min(20).optional(),

  // Cloudinary — optional; used only when uploads are exercised.
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),

  // Partner toggles — default to false. Honoured by the partner factory.
  PARTNER_AEPS_ENABLED: z.string().default("false"),
  PARTNER_DMT_ENABLED: z.string().default("false"),
  PARTNER_UPI_ENABLED: z.string().default("false"),
  PARTNER_PAYOUT_ENABLED: z.string().default("false"),
  PARTNER_BBPS_ENABLED: z.string().default("false"),
  PARTNER_RECHARGE_ENABLED: z.string().default("false"),
  PARTNER_TRAVEL_ENABLED: z.string().default("false"),
  PARTNER_PAN_ENABLED: z.string().default("false"),
  PARTNER_SMS_ENABLED: z.string().default("false"),
  PARTNER_EMAIL_ENABLED: z.string().default("false"),
  PARTNER_VERIFICATION_ENABLED: z.string().default("false"),
  PARTNER_POS_ENABLED: z.string().default("false"),

  // Same Day Solution — POS Partner API
  SAMEDAY_POS_BASE_URL: z.string().url().default("https://api.samedaysolution.in"),
  SAMEDAY_POS_API_KEY: z.string().min(1).optional(),
  SAMEDAY_POS_API_SECRET: z.string().min(1).optional(),

  // eKYC Hub
  EKYCHUB_USERNAME: z.string().min(1).optional(),
  EKYCHUB_API_TOKEN: z.string().min(1).optional(),
  EKYCHUB_BASE_URL: z.string().url().default("https://connect.ekychub.in/v3")
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Soft-warn; the build/runtime continues. Individual call sites that
  // require a missing key will throw via requireEnv().
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  // eslint-disable-next-line no-console
  console.warn(`[env] Some environment variables look invalid: ${issues}`);
}

export const env = (parsed.success ? parsed.data : (process.env as unknown as z.infer<typeof schema>));

/**
 * Throw a clear error if a required env var is missing at the moment a
 * runtime code path needs it. Use this inside the function that actually
 * uses the secret — never at module top-level.
 */
export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `[env] Missing required environment variable: ${String(key)}. ` +
        `Add it to your hosting provider's environment variables (Amplify / Vercel / etc.).`
    );
  }
  return value as NonNullable<(typeof env)[K]>;
}

export const flags = {
  aeps: env.PARTNER_AEPS_ENABLED === "true",
  dmt: env.PARTNER_DMT_ENABLED === "true",
  upi: env.PARTNER_UPI_ENABLED === "true",
  payout: env.PARTNER_PAYOUT_ENABLED === "true",
  bbps: env.PARTNER_BBPS_ENABLED === "true",
  recharge: env.PARTNER_RECHARGE_ENABLED === "true",
  travel: env.PARTNER_TRAVEL_ENABLED === "true",
  pan: env.PARTNER_PAN_ENABLED === "true",
  sms: env.PARTNER_SMS_ENABLED === "true",
  email: env.PARTNER_EMAIL_ENABLED === "true",
  verification: env.PARTNER_VERIFICATION_ENABLED === "true",
  pos: env.PARTNER_POS_ENABLED === "true"
} as const;

export const isProd = env.NODE_ENV === "production";
