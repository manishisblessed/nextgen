import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import {
  verifyTempToken,
  decryptSecret,
  verifyTotpCode,
  verifyBackupCode,
  MAX_2FA_ATTEMPTS,
} from "@/lib/two-factor";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";

const Body = z.object({
  tempToken: z.string().min(10),
  code: z.string().min(1).max(20),
  type: z.enum(["totp", "backup"]).default("totp"),
});

/**
 * Creates a short-lived session grant token (HMAC-signed, 30s TTL).
 * The token-login NextAuth provider verifies this server-side.
 */
function createSessionGrant(userId: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  const exp = Math.floor(Date.now() / 1000) + 30;
  const payload = `${userId}:${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64")}.${sig}`;
}

/**
 * POST /api/auth/2fa/verify-session
 * Web-specific: verifies 2FA code and returns a session grant token.
 * Frontend uses this grant to call signIn("token-login") and establish a NextAuth session.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const rl = await checkRateLimit(`2fa:ip:${clientIp(req)}`, RATE_LIMITS.twoFactor);
    if (!rl.allowed)
      return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

    const { tempToken, code, type } = parsed.data;

    const tokenPayload = verifyTempToken(tempToken);
    if (!tokenPayload) {
      return NextResponse.json(
        { error: "Session expired. Please log in again." },
        { status: 401 }
      );
    }

    const userId = tokenPayload.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user || !user.twoFactorSecret) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    if (user.status === "CLOSED") {
      return NextResponse.json({ error: "Account closed" }, { status: 403 });
    }

    // Rate limiting
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
    const recentAttempts = await prisma.auditLog.count({
      where: {
        userId,
        action: "2fa.attempt_failed",
        createdAt: { gte: threeMinAgo },
      },
    });

    if (recentAttempts >= MAX_2FA_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many attempts. Please log in again." },
        { status: 429 }
      );
    }

    const secret = decryptSecret(user.twoFactorSecret);
    let verified = false;

    if (type === "totp") {
      verified = verifyTotpCode(secret, code);
    } else if (type === "backup") {
      const result = await verifyBackupCode(code, user.twoFactorBackupCodes);
      if (result.valid) {
        verified = true;
        const updatedCodes = [...user.twoFactorBackupCodes];
        updatedCodes[result.index] = "";
        await prisma.user.update({
          where: { id: userId },
          data: { twoFactorBackupCodes: updatedCodes },
        });
      }
    }

    if (!verified) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: "2fa.attempt_failed",
          entity: "User",
          entityId: userId,
          meta: { type, remainingAttempts: MAX_2FA_ATTEMPTS - recentAttempts - 1 },
          ip: clientIp(req),
        },
      });

      return NextResponse.json(
        {
          error: "Invalid code.",
          remainingAttempts: Math.max(0, MAX_2FA_ATTEMPTS - recentAttempts - 1),
        },
        { status: 401 }
      );
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: "2fa.verified",
        entity: "User",
        entityId: userId,
        ip: clientIp(req),
      },
    });

    const grant = createSessionGrant(user.id);

    return NextResponse.json({ ok: true, grant });
  } catch (err) {
    console.error("[auth/2fa/verify-session] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
