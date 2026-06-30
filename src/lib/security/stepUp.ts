import { prisma } from "../db";
import { flags } from "../env";
import {
  decryptSecret,
  verifyTotpCode,
  verifyBackupCode,
} from "../two-factor";
import { logSecurityEvent } from "./audit";
import type { SessionUser } from "../auth-server";

/**
 * Step-up authentication: re-verify the user's TOTP (or a backup code) at the
 * moment they perform a high-risk action — payout approval, scheme/charge
 * changes, withdrawals — even though they already hold a valid session. This
 * blunts session-hijack and insider-misuse: a stolen cookie alone cannot move
 * money or change pricing.
 *
 * Gated behind SECURITY_STEPUP_ENABLED (flags.stepUp) so it can be rolled out
 * once the client step-up prompt is wired into every sensitive surface. When
 * enabled, a user without 2FA configured is refused the sensitive action with
 * a clear "enable 2FA first" message.
 */

export class StepUpError extends Error {
  constructor(message: string, public statusCode: number, public code: string) {
    super(message);
    this.name = "StepUpError";
  }
}

/** Read a step-up code from common request locations (header preferred). */
export function readStepUpCode(req: Request, body?: Record<string, unknown>): { code?: string; type: "totp" | "backup" } {
  const header = req.headers.get("x-2fa-code") || req.headers.get("x-totp-code");
  const type = (req.headers.get("x-2fa-type") || (body?.stepUpType as string) || "totp") === "backup" ? "backup" : "totp";
  const code = header || (typeof body?.stepUpCode === "string" ? (body.stepUpCode as string) : undefined);
  return { code: code?.trim() || undefined, type };
}

export type StepUpOptions = {
  action: string; // for audit, e.g. "payout.approve"
  code?: string;
  type?: "totp" | "backup";
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Verify a fresh 2FA code for `user`. Throws {@link StepUpError} when:
 *   - 2FA is not configured for the user (412 — must enable first),
 *   - no code is supplied (401 with code STEP_UP_REQUIRED),
 *   - the code is invalid (401 with code STEP_UP_INVALID).
 * Returns silently (no-op) when step-up is globally disabled.
 */
export async function requireStepUp(user: SessionUser, opts: StepUpOptions): Promise<void> {
  if (!flags.stepUp) return;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true },
  });

  if (!dbUser?.twoFactorEnabled || !dbUser.twoFactorSecret) {
    throw new StepUpError(
      "This action requires two-factor authentication. Enable 2FA in Security settings first.",
      412,
      "STEP_UP_NOT_CONFIGURED"
    );
  }

  if (!opts.code) {
    throw new StepUpError("Two-factor verification required for this action.", 401, "STEP_UP_REQUIRED");
  }

  let verified = false;
  if (opts.type === "backup") {
    const result = await verifyBackupCode(opts.code, dbUser.twoFactorBackupCodes);
    if (result.valid) {
      verified = true;
      const updated = [...dbUser.twoFactorBackupCodes];
      updated[result.index] = "";
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: updated } });
    }
  } else {
    verified = verifyTotpCode(decryptSecret(dbUser.twoFactorSecret), opts.code);
  }

  if (!verified) {
    await logSecurityEvent({
      action: "stepup.failed",
      severity: "warn",
      userId: user.id,
      entity: "User",
      entityId: user.id,
      ip: opts.ip,
      userAgent: opts.userAgent,
      meta: { action: opts.action, type: opts.type ?? "totp" },
    });
    throw new StepUpError("Invalid two-factor code.", 401, "STEP_UP_INVALID");
  }

  await logSecurityEvent({
    action: "stepup.verified",
    severity: "info",
    userId: user.id,
    entity: "User",
    entityId: user.id,
    ip: opts.ip,
    userAgent: opts.userAgent,
    meta: { action: opts.action },
  });
}
