import { prisma } from "@/lib/db";

/**
 * Scheme gate — "no scheme, no transaction".
 *
 * Assignment cascades strictly down the network (admin → SD → MD → DT → RT):
 * a user may only transact once their parent (or admin, for SDs) has assigned
 * them an ACTIVE scheme. There is no platform-default fallback. Staff roles
 * (ADMIN/MASTER_ADMIN/SUPPORT/FINANCE) are exempt — they do not price via
 * schemes.
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
    super("No scheme assigned yet. Ask your distributor or admin to assign a scheme before transacting.");
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
    select: {
      role: true,
      scheme: { select: { id: true, active: true } },
    },
  });
  if (!user) throw new NoSchemeError("SCHEME");

  // Staff accounts don't transact under network schemes.
  if (!NETWORK_ROLES.includes(user.role as (typeof NETWORK_ROLES)[number])) return;

  if (!user.scheme?.active) throw new NoSchemeError("SCHEME");
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
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      scheme: { select: { name: true, active: true } },
    },
  });
  const applicable =
    !!user && NETWORK_ROLES.includes(user.role as (typeof NETWORK_ROLES)[number]);
  const hasScheme = !!user?.scheme?.active;
  const schemeName = user?.scheme?.active ? user.scheme.name : null;
  return {
    applicable,
    hasScheme,
    hasMdrScheme: hasScheme,
    schemeName,
    mdrSchemeName: schemeName,
  };
}
