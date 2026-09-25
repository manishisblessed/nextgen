import { prisma } from "@/lib/db";
import { resolveUserScheme } from "@/lib/scheme/resolve-scheme";

/**
 * Scheme gate — "no scheme, no transaction".
 *
 * Admin assigns schemes directly to any user. A user may transact once they
 * have an ACTIVE scheme — either an explicitly-assigned one, or the platform
 * default scheme when SCHEME_DEFAULT_FALLBACK is enabled (resolved via
 * resolveUserScheme, the shared source of truth). There is no hierarchy or
 * cascade. Staff roles (ADMIN/MASTER_ADMIN/SUPPORT/FINANCE) are exempt — they
 * do not price via schemes.
 *
 * Throw-style guard so routes can surface it via toErrorResponse (403).
 */

export const NETWORK_ROLES = [
  "RETAILER",
  "DISTRIBUTOR",
  "MASTER_DISTRIBUTOR",
  "SUPER_DISTRIBUTOR",
] as const;

export class NoSchemeError extends Error {
  readonly statusCode = 403;
  readonly code: "NO_SCHEME_ASSIGNED" | "NO_MDR_SCHEME_ASSIGNED";

  constructor(kind: "SCHEME" | "MDR" = "SCHEME") {
    super("No scheme assigned yet. Contact your admin to assign a scheme before transacting.");
    this.name = "NoSchemeError";
    this.code = kind === "MDR" ? "NO_MDR_SCHEME_ASSIGNED" : "NO_SCHEME_ASSIGNED";
  }
}

/**
 * Assert the user has an active assigned scheme. In the unified model the same
 * scheme carries both service (BBPS/Payout) and MDR (POS) slabs, so the legacy
 * `mdr` option is a no-op kept for call-site compatibility. Throws otherwise.
 */
export async function requireActiveScheme(
  userId: string,
  _opts: { mdr?: boolean } = {}
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) throw new NoSchemeError("SCHEME");

  // Staff accounts don't transact under network schemes.
  if (!NETWORK_ROLES.includes(user.role as (typeof NETWORK_ROLES)[number])) return;

  // Resolves the assigned scheme, or the platform default when the fallback
  // flag is on. NONE means neither exists → block.
  const resolved = await resolveUserScheme(userId);
  if (resolved.source === "NONE") throw new NoSchemeError("SCHEME");
}

/**
 * Non-throwing variant for status displays (dashboard banner, etc.). The
 * unified scheme covers MDR too, so hasMdrScheme mirrors hasScheme.
 */
export async function getSchemeStatus(userId: string): Promise<{
  applicable: boolean;
  hasScheme: boolean;
  hasMdrScheme: boolean;
  schemeName: string | null;
  mdrSchemeName: string | null;
  role: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const applicable =
    !!user && NETWORK_ROLES.includes(user.role as (typeof NETWORK_ROLES)[number]);
  // Mirror the runtime resolver: assigned scheme, else platform default (when
  // enabled). This keeps the dashboard banner/overlay in lockstep with what the
  // pricing engine and gate actually allow.
  const resolved = user ? await resolveUserScheme(userId) : null;
  const hasScheme = !!resolved && resolved.source !== "NONE";
  const schemeName = hasScheme ? resolved!.schemeName : null;
  return {
    applicable,
    hasScheme,
    hasMdrScheme: hasScheme,
    schemeName,
    mdrSchemeName: schemeName,
    role: user?.role ?? null,
  };
}
