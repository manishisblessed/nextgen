// =====================================================================
// Server-side service guard. Money/feature routes call assertServiceEnabled()
// to hard-gate a rail. A rail is usable only when it is enabled globally
// (On/Off Services panel) AND present in the user's `enabledServices`
// allowlist (default-disabled; an admin must enable it per user). Staff roles
// (SUPPORT/ADMIN/MASTER_ADMIN) bypass the per-user allowlist.
// A blocked rail returns 503.
// =====================================================================

import { prisma } from "@/lib/db";

export class ServiceDisabledError extends Error {
  public statusCode = 503;
  constructor(public key: string, message?: string) {
    super(message ?? "Service temporarily unavailable");
    this.name = "ServiceDisabledError";
  }
}

/** Staff roles bypass the per-user allowlist (they administer the rails). */
const STAFF_ROLES = new Set(["SUPPORT", "ADMIN", "MASTER_ADMIN"]);

export type ServiceGuardOptions = {
  /**
   * What to do when no ServiceRoute row exists for `key` (not yet seeded).
   * Defaults to `true` (fail-open) so a freshly deployed feature is not blocked
   * before the catalog is seeded. Pass `false` to fail-closed for new rails.
   * Note: the per-user allowlist check still applies regardless.
   */
  defaultEnabled?: boolean;
  /** Friendly name used in the error message shown to the user. */
  name?: string;
  /** User ID whose `enabledServices` allowlist is checked. */
  userId?: string;
  /**
   * The caller's role (DB enum, e.g. "RETAILER", "ADMIN"). Staff roles skip
   * the per-user allowlist check. When omitted, the role is looked up along
   * with the allowlist.
   */
  role?: string;
};

/**
 * True if the rail identified by `key` is currently enabled globally.
 */
export async function isServiceEnabled(
  key: string,
  opts?: ServiceGuardOptions
): Promise<boolean> {
  const route = await prisma.serviceRoute.findUnique({
    where: { key },
    select: { enabled: true },
  });
  if (!route) return opts?.defaultEnabled ?? true;
  return route.enabled;
}

/**
 * True if the service is enabled for this user (in their allowlist, or the
 * user holds a staff role). Does NOT consider the global switch.
 */
export async function isServiceEnabledForUser(
  key: string,
  userId: string,
  role?: string
): Promise<boolean> {
  if (role && STAFF_ROLES.has(role)) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, enabledServices: true },
  });
  if (!user) return false;
  if (STAFF_ROLES.has(user.role)) return true;
  return user.enabledServices.includes(key);
}

/**
 * Throw {@link ServiceDisabledError} (503) unless the rail is enabled both
 * globally AND for the specific user (if userId provided). Call this at the
 * top of a money/feature mutation, after auth, to hard-gate the rail.
 */
export async function assertServiceEnabled(
  key: string,
  opts?: ServiceGuardOptions
): Promise<void> {
  const globalEnabled = await isServiceEnabled(key, opts);
  if (!globalEnabled) {
    throw new ServiceDisabledError(
      key,
      `${opts?.name ?? "This service"} is temporarily unavailable. Please try again later.`
    );
  }

  if (opts?.userId) {
    const userEnabled = await isServiceEnabledForUser(key, opts.userId, opts.role);
    if (!userEnabled) {
      throw new ServiceDisabledError(
        key,
        `${opts?.name ?? "This service"} is not enabled for your account. Contact your admin.`
      );
    }
  }
}

/**
 * Effective service keys for a user: globally-enabled rails intersected with
 * the user's allowlist (staff roles get every globally-enabled rail). Used by
 * the sidebar/overview to show only usable services.
 */
export async function getEffectiveServiceKeys(
  userId: string,
  role?: string
): Promise<string[]> {
  const routes = await prisma.serviceRoute.findMany({
    where: { enabled: true, type: "SERVICE" },
    select: { key: true },
  });
  const globallyOn = routes.map((r) => r.key);

  if (role && STAFF_ROLES.has(role)) return globallyOn;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, enabledServices: true },
  });
  if (!user) return [];
  if (STAFF_ROLES.has(user.role)) return globallyOn;

  const allowed = new Set(user.enabledServices);
  return globallyOn.filter((k) => allowed.has(k));
}
