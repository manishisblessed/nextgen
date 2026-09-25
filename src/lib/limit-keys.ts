/**
 * Client-safe registry of the PlatformSetting keys that represent
 * USER-TRANSACTION LIMITS.
 *
 * This lives apart from `settings.ts` (which imports Prisma / server-only code)
 * so the admin **Limits** tab and the **Platform Controls** tab — both client
 * components — can import it without dragging server code into the bundle.
 * `settings.ts` re-exports this as `LIMIT_KEYS` with a `satisfies SettingKey[]`
 * check, so any typo here fails the build.
 *
 * The Limits tab shows ONLY these keys; Platform Controls HIDES them — so every
 * transaction cap is raised or lowered in exactly one place.
 */
export const LIMIT_SETTING_KEYS = [
  "limits.qr_claim",
  "limits.settlement_defaults",
  "wallet.global_cap",
  "wallet.op_max_amount",
] as const;

export type LimitSettingKey = (typeof LIMIT_SETTING_KEYS)[number];

/** True when `key` is a user-transaction limit owned by the Limits tab. */
export function isLimitSettingKey(key: string): boolean {
  return (LIMIT_SETTING_KEYS as readonly string[]).includes(key);
}
