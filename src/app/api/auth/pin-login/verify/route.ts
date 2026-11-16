import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSessionGrant } from "@/lib/auth-server";
import { verifyTempToken } from "@/lib/two-factor";
import { verifyUserPin } from "@/lib/security/txnPin";
import { TxnPinError } from "@/lib/security/txnPin";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";
import { logSecurityEvent } from "@/lib/security/audit";
import { getLoginBlock } from "@/lib/security/accountGate";

/**
 * POST /api/auth/pin-login/verify
 *
 * Second-factor login with the transaction PIN. Any user who has enabled PIN
 * login and set a transaction PIN can use this route. Because a 4–6 digit PIN
 * is weaker than TOTP, the user must accept the liability at least once; the
 * acceptance is recorded. On success, returns a session grant for
 * signIn("token-login").
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    tempToken: z.string().min(10),
    pin: z.string().min(4).max(6),
    riskAccepted: z.boolean().optional(),
  })
  .strict();

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");

    const rl = await checkRateLimit(`pinlogin:ip:${ip}`, RATE_LIMITS.twoFactor);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const tokenPayload = verifyTempToken(parsed.data.tempToken);
    if (!tokenPayload) {
      return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
    }

    const userId = tokenPayload.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        pinLoginEnabled: true,
        txnPinHash: true,
        pinLoginRiskAcceptedAt: true,
      },
    });

    if (!user || !user.pinLoginEnabled || !user.txnPinHash) {
      return NextResponse.json({ error: "PIN login is not available for this account." }, { status: 403 });
    }

    const loginBlock = getLoginBlock(user.status);
    if (loginBlock) {
      return NextResponse.json({ error: loginBlock.error, code: loginBlock.code }, { status: 403 });
    }

    // Liability acceptance is mandatory. If never accepted before, it must be
    // provided now; once accepted it is remembered.
    if (!user.pinLoginRiskAcceptedAt && !parsed.data.riskAccepted) {
      return NextResponse.json(
        { error: "You must accept the no-2FA risk to continue.", code: "RISK_NOT_ACCEPTED" },
        { status: 400 }
      );
    }

    // Verify the PIN (shared lockout: 5 attempts → 15 min).
    try {
      await verifyUserPin(user.id, parsed.data.pin, { action: "auth.pin_login", ip, userAgent });
    } catch (e) {
      if (e instanceof TxnPinError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: e.statusCode });
      }
      throw e;
    }

    // Record first-time (or refreshed) risk acceptance.
    if (parsed.data.riskAccepted && !user.pinLoginRiskAcceptedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { pinLoginRiskAcceptedAt: new Date(), pinLoginRiskAcceptedIp: ip },
      });
    }

    await logSecurityEvent({
      action: "auth.pin_login",
      severity: "info",
      userId: user.id,
      entity: "User",
      entityId: user.id,
      ip,
      userAgent,
      meta: { method: "txn_pin" },
    });

    const grant = createSessionGrant(user.id);
    return NextResponse.json({ ok: true, grant });
  } catch (err) {
    console.error("[auth/pin-login/verify] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error. Please try again." }, { status: 500 });
  }
}
