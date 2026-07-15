import { prisma } from "@/lib/db";

/**
 * A successor declaration approval is only valid while its invite is still
 * active. There is no background cron in this deployment, so we expire stale
 * PENDING approvals lazily whenever they are read or acted upon: if the invite
 * has passed its expiry, the pending approval is marked EXPIRED and can no
 * longer be approved (the onboardee must be re-invited).
 *
 * Returns the effective status after applying expiry.
 */
export async function resolveApprovalStatus(params: {
  approvalId: string;
  currentStatus: string;
  inviteExpiresAt: Date | null | undefined;
}): Promise<string> {
  const { approvalId, currentStatus, inviteExpiresAt } = params;

  if (
    currentStatus === "PENDING" &&
    inviteExpiresAt &&
    new Date() > inviteExpiresAt
  ) {
    await prisma.declarationApproval.update({
      where: { id: approvalId },
      data: { status: "EXPIRED" },
    });
    return "EXPIRED";
  }

  return currentStatus;
}
