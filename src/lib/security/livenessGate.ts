import { prisma } from "../db";
import { isNetworkTier } from "./kycGate";
import type { SessionUser } from "../auth-server";

/**
 * Onboarding liveness gate (Phase 14).
 *
 * Every NETWORK-tier user (RT/DT/MD/SD) must have recorded a 10-second liveness
 * video before they can transact. A face frame from that video is the baseline
 * for Phase 13's monthly face match. Until the baseline is ready
 * (User.hasLivenessVideo = true) every money/transaction route must refuse the
 * operation BEFORE touching the ledger. Login and read-only viewing stay open so
 * the user can complete the capture — same gating pattern as the monthly re-KYC.
 *
 * Staff/admin roles (ADMIN, SUPPORT, MASTER_ADMIN) are never prompted and never
 * gated.
 */

export class LivenessRequiredError extends Error {
  public statusCode = 403;
  public code = "LIVENESS_REQUIRED" as const;
  constructor(
    message = "A one-time liveness video is required before you can transact."
  ) {
    super(message);
    this.name = "LivenessRequiredError";
  }
}

/**
 * Throw {@link LivenessRequiredError} (403, code LIVENESS_REQUIRED) when a
 * network-tier user has not yet completed their onboarding liveness video.
 * No-op for staff/admin roles and for network users who already have it.
 *
 * Cheap by design: staff roles never hit the database; network users incur a
 * single primary-key lookup of the flag.
 */
export async function assertLivenessReady(
  user: Pick<SessionUser, "id" | "role">
): Promise<void> {
  if (!isNetworkTier(user.role)) return;

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { hasLivenessVideo: true },
  });

  if (!row?.hasLivenessVideo) {
    throw new LivenessRequiredError();
  }
}

/**
 * Like {@link assertLivenessReady} but fetches the role too — for ledger
 * chokepoints (e.g. runTransaction) that only carry a userId. One indexed
 * lookup; no-op for staff/admin.
 */
export async function assertLivenessReadyById(userId: string): Promise<void> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, hasLivenessVideo: true },
  });
  if (!row) return;
  if (!isNetworkTier(row.role)) return;
  if (!row.hasLivenessVideo) throw new LivenessRequiredError();
}
