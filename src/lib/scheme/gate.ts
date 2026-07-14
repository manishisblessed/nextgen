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

  constructor(kind: "SCHEME" | "MDR") {
    super(
      kind === "MDR"
        ? "No MDR scheme assigned yet. Ask your distributor or admin to assign an MDR scheme before transacting."
        : "No scheme assigned yet. Ask your distributor or admin to assign a scheme before transacting."
    );
    this.name = "NoSchemeError";
    this.code = kind === "MDR" ? "NO_MDR_SCHEME_ASSIGNED" : "NO_SCHEME_ASSIGNED";
  }
}

/**
 * Assert the user has an active assigned scheme (and, when `mdr` is set, an
 * active MDR scheme too). Throws NoSchemeError otherwise.
 */
export async function requireActiveScheme(
  userId: string,
  opts: { mdr?: boolean } = {}
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      scheme: { select: { id: true, active: true } },
      mdrScheme: { select: { id: true, active: true } },
    },
  });
  if (!user) throw new NoSchemeError("SCHEME");

  // Staff accounts don't transact under network schemes.
  if (!NETWORK_ROLES.includes(user.role as (typeof NETWORK_ROLES)[number])) return;

  if (!user.scheme?.active) throw new NoSchemeError("SCHEME");
  if (opts.mdr && !user.mdrScheme?.active) throw new NoSchemeError("MDR");
}

/**
 * Non-throwing variant for status displays (dashboard banner, etc.).
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
      mdrScheme: { select: { name: true, active: true } },
    },
  });
  const applicable =
    !!user && NETWORK_ROLES.includes(user.role as (typeof NETWORK_ROLES)[number]);
  return {
    applicable,
    hasScheme: !!user?.scheme?.active,
    hasMdrScheme: !!user?.mdrScheme?.active,
    schemeName: user?.scheme?.active ? user.scheme.name : null,
    mdrSchemeName: user?.mdrScheme?.active ? user.mdrScheme.name : null,
  };
}
