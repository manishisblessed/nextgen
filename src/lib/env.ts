/**
 * Runtime environment validation. Fails fast at boot if a required secret
 * is missing in production. Never log this object — it contains keys.
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Auth
  NEXTAUTH_SECRET: z.string().min(16),
  JWT_SECRET: z.string().min(16),
  APP_ENCRYPTION_KEY: z.string().min(16),

  // Neon
  DATABASE_URL: z.string().min(20),
  DIRECT_URL: z.string().min(20).optional(),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  // Partner toggles — all default to false. Each is honoured by its provider factory.
  PARTNER_AEPS_ENABLED: z.string().default("false"),
  PARTNER_DMT_ENABLED: z.string().default("false"),
  PARTNER_UPI_ENABLED: z.string().default("false"),
  PARTNER_PAYOUT_ENABLED: z.string().default("false"),
  PARTNER_BBPS_ENABLED: z.string().default("false"),
  PARTNER_RECHARGE_ENABLED: z.string().default("false"),
  PARTNER_TRAVEL_ENABLED: z.string().default("false"),
  PARTNER_PAN_ENABLED: z.string().default("false"),
  PARTNER_SMS_ENABLED: z.string().default("false"),
  PARTNER_EMAIL_ENABLED: z.string().default("false")
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
  throw new Error(`[env] Invalid environment configuration:\n  ${issues}`);
}

export const env = parsed.data;

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
  email: env.PARTNER_EMAIL_ENABLED === "true"
} as const;

export const isProd = env.NODE_ENV === "production";
