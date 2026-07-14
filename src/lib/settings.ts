import { z } from "zod";
import { prisma } from "./db";

/**
 * Platform settings — typed accessors over the PlatformSetting key-value
 * store. Every operational knob an admin can change at runtime lives here so
 * a config change never needs a deploy.
 *
 * Each key declares a zod schema + default. Reads fall back to the default
 * when the row is missing or fails validation (a bad manual edit can never
 * take the platform down). Writes validate before persisting.
 */

const SETTING_SCHEMAS = {
  /** Max PRIMARY wallet balance any network user may hold (₹). */
  "wallet.global_cap": z.object({
    enabled: z.boolean().default(true),
    amount: z.number().positive().default(500_000),
  }),

  /** Admin wallet PUSH/PULL above this amount needs a second admin (₹). */
  "wallet.ops_approval_threshold": z.object({
    amount: z.number().nonnegative().default(50_000),
  }),

  /** Reversals above this amount need a second admin (₹). */
  "reversal.approval_threshold": z.object({
    amount: z.number().nonnegative().default(25_000),
  }),

  /** T+1 auto-settlement engine (AEPS wallet → primary wallet). */
  "settlement.t1": z.object({
    enabled: z.boolean().default(false),
    /** Cron hour (IST, 0-23) the daily run fires at. */
    hour: z.number().int().min(0).max(23).default(7),
    /** Global pause switch — overrides per-user configs. */
    paused: z.boolean().default(false),
    /** Minimum AEPS balance to bother settling (₹). */
    minAmount: z.number().nonnegative().default(100),
  }),

  /** POS rental billing job. */
  "pos.rental_billing": z.object({
    enabled: z.boolean().default(false),
    /** Cron hour (IST, 0-23) the daily billing run fires at. */
    hour: z.number().int().min(0).max(23).default(3),
  }),

  /** Default settlement tier caps applied when a user has no UserLimit row (₹). */
  "limits.settlement_defaults": z.object({
    dailyCap: z.number().positive().default(200_000),
    perTxnCap: z.number().positive().default(100_000),
  }),

  /** POS acquirer settlement — instant mode (admin-toggled per user or global). */
  "settlement.pos_instant": z.object({
    /** Platform-wide default for new users (overridden per-user by User.instantSettlement). */
    defaultEnabled: z.boolean().default(false),
  }),

  /** POS T+1 settlement cron (for non-instant users). */
  "settlement.pos_t1": z.object({
    enabled: z.boolean().default(true),
    hour: z.number().int().min(0).max(23).default(9),
    paused: z.boolean().default(false),
    minAmount: z.number().nonnegative().default(50),
  }),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_SCHEMAS, key);
}

export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

/** The validated default for a key (schema defaults applied to {}). */
export function settingDefault<K extends SettingKey>(key: K): SettingValue<K> {
  return SETTING_SCHEMAS[key].parse({}) as SettingValue<K>;
}

/** Read a setting, falling back to defaults when missing/invalid. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  if (!row) return settingDefault(key);
  const parsed = SETTING_SCHEMAS[key].safeParse(row.value);
  return (parsed.success ? parsed.data : settingDefault(key)) as SettingValue<K>;
}

/** Validate + upsert a setting. Returns the stored value. */
export async function setSetting<K extends SettingKey>(
  key: K,
  value: unknown,
  updatedById?: string
): Promise<SettingValue<K>> {
  const parsed = SETTING_SCHEMAS[key].parse(value) as SettingValue<K>;
  await prisma.platformSetting.upsert({
    where: { key },
    update: { value: parsed as object, updatedById },
    create: { key, value: parsed as object, updatedById },
  });
  return parsed;
}

/** All settings with their current (or default) values — for the admin UI. */
export async function getAllSettings(): Promise<Record<SettingKey, unknown>> {
  const keys = Object.keys(SETTING_SCHEMAS) as SettingKey[];
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingKey, unknown>;
  for (const key of keys) {
    const raw = byKey.get(key);
    const parsed = raw !== undefined ? SETTING_SCHEMAS[key].safeParse(raw) : null;
    out[key] = parsed?.success ? parsed.data : settingDefault(key);
  }
  return out;
}
