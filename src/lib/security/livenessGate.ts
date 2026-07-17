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
 * Liveness gate disabled — users are now approved manually by admin.
 * Kept as no-ops so every call site still compiles without changes.
 */
export async function assertLivenessReady(
  _user: Pick<SessionUser, "id" | "role">
): Promise<void> {}

export async function assertLivenessReadyById(_userId: string): Promise<void> {}
