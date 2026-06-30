// =====================================================================
// Server-side service guard. Money/feature routes call assertServiceEnabled()
// to hard-gate a rail that an admin has switched OFF globally or per-user in
// the On/Off Services panel. A disabled rail returns 503.
// =====================================================================

import { prisma } from "@/lib/db";

export class ServiceDisabledError extends Error {
  public statusCode = 503;
  constructor(public key: string, message?: string) {
    super(message ?? "Service temporarily unavailable");
    this.name = "ServiceDisabledError";
  }
}

export type ServiceGuardOptions = {
  /**
   * What to do when no ServiceRoute row exists for `key` (not yet seeded).
   * Defaults to `true` (fail-open) so a freshly deployed feature is not blocked
   * before the catalog is seeded. Pass `false` to fail-closed for new rails.
   */
  defaultEnabled?: boolean;
  /** Friendly name used in the error message shown to the user. */
  name?: string;
  /** Optional user ID to also check per-user disabled services. */
  userId?: string;
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
 * True if the service is disabled specifically for this user (admin toggled it off).
 */
export async function isServiceDisabledForUser(
  key: string,
  userId: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { disabledServices: true },
  });
  if (!user) return false;
  return user.disabledServices.includes(key);
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
    const userDisabled = await isServiceDisabledForUser(key, opts.userId);
    if (userDisabled) {
      throw new ServiceDisabledError(
        key,
        `${opts?.name ?? "This service"} is not enabled for your account. Contact your admin.`
      );
    }
  }
}
