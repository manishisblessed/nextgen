// =====================================================================
// Account status gate. Login + money-moving chokepoints require ACTIVE.
// Network-tier users (SD/MD/DT/RT) stay PENDING_KYC until an admin approves
// their invite — they must not receive a session before that. Suspension can
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

export class AccountPendingApprovalError extends Error {
  public statusCode = 403;
  public code = "ACCOUNT_PENDING_APPROVAL" as const;
  constructor(
    message = "Your account is pending admin approval. You'll be notified once approved and can then log in."
  ) {
    super(message);
    this.name = "AccountPendingApprovalError";
  }
}

/**
 * Whether this account status may establish a login session.
 * Only ACTIVE users (post admin approval for network tiers) may log in.
 */
export function isLoginAllowed(status: string): boolean {
  return status === "ACTIVE";
}

/**
 * Human-readable login denial for a non-ACTIVE status, or null if allowed.
 */
export function getLoginBlock(
  status: string
): { error: string; code: string } | null {
  if (status === "ACTIVE") return null;
  if (status === "PENDING_KYC") {
    return {
      error:
        "Your account is pending admin approval. You'll be notified once approved and can then log in.",
      code: "ACCOUNT_PENDING_APPROVAL",
    };
  }
  if (status === "SUSPENDED") {
    return {
      error: "Your account is suspended. Please contact your distributor or support.",
      code: "ACCOUNT_SUSPENDED",
    };
  }
  if (status === "CLOSED") {
    return { error: "Account has been closed", code: "ACCOUNT_CLOSED" };
  }
  return { error: "Account is not active", code: "ACCOUNT_INACTIVE" };
}

/**
 * Throw when the account is not ACTIVE. Reads status fresh from the DB (one
 * primary-key lookup) so a suspension / pending state applies to in-flight
 * sessions too — never trusts the status baked into a JWT.
 */
export async function assertAccountActive(userId: string): Promise<void> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!row) return; // unknown user is handled by auth layers
  if (row.status === "PENDING_KYC") {
    throw new AccountPendingApprovalError();
  }
  if (row.status === "SUSPENDED" || row.status === "CLOSED") {
    throw new AccountSuspendedError();
  }
}
