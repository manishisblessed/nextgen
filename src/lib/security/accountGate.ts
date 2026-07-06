// =====================================================================
// Account status gate. Money-moving chokepoints call assertAccountActive()
// to hard-block SUSPENDED / CLOSED accounts from transacting. Suspension can
// come from an admin (AML/fraud desk) or from the user's own distributor
// (the network "security switch"), and takes effect immediately — even for
// sessions minted before the suspension.
// =====================================================================

import { prisma } from "@/lib/db";

export class AccountSuspendedError extends Error {
  public statusCode = 403;
  public code = "ACCOUNT_SUSPENDED" as const;
  constructor(
    message = "Your account is suspended. Transactions are blocked — contact your distributor or support."
  ) {
    super(message);
    this.name = "AccountSuspendedError";
  }
}

/**
 * Throw {@link AccountSuspendedError} (403, code ACCOUNT_SUSPENDED) when the
 * account is SUSPENDED or CLOSED. Reads the status fresh from the DB (one
 * primary-key lookup) so a suspension applies to in-flight sessions too —
 * never trusts the status baked into a JWT.
 *
 * Statuses other than SUSPENDED/CLOSED (ACTIVE, PENDING_KYC) pass through;
 * KYC gating is handled separately by kycGate/livenessGate.
 */
export async function assertAccountActive(userId: string): Promise<void> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!row) return; // unknown user is handled by auth layers
  if (row.status === "SUSPENDED" || row.status === "CLOSED") {
    throw new AccountSuspendedError();
  }
}
