import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { toErrorResponse } from "@/lib/security/apiErrors";

/**
 * Preferred login (second-factor) method management.
 *
 * A master-admin can *allow* an account to sign in with its transaction PIN
 * instead of an authenticator app. When both factors are available, the user
 * decides which to use. This endpoint lets the user set a default so the login
 * chooser can be pre-selected/skipped:
 *
 *   GET  → { canChoose, twoFactorEnabled, pinLoginEnabled, hasTxnPin, preferred }
 *   POST → set the preferred method ("authenticator" | "tpin" | null)
 *
 * `null` = "ask me every time" (show the chooser).
 */

const PREFERENCES = ["authenticator", "tpin"] as const;

const Body = z
  .object({
    preferred: z.enum(PREFERENCES).nullable(),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorExempt: true,
        pinLoginEnabled: true,
        txnPinHash: true,
        preferredLoginMethod: true,
      },
    });

    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const canAuthenticator = Boolean(user.twoFactorEnabled && user.twoFactorSecret);
    const canPinLogin = Boolean(
      user.twoFactorExempt && user.pinLoginEnabled && user.txnPinHash
    );

    return NextResponse.json({
      // The choice only exists when BOTH factors are usable.
      canChoose: canAuthenticator && canPinLogin,
      twoFactorEnabled: canAuthenticator,
      pinLoginAllowed: Boolean(user.pinLoginEnabled),
      hasTxnPin: Boolean(user.txnPinHash),
      preferred: user.preferredLoginMethod ?? null,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorExempt: true,
        pinLoginEnabled: true,
        txnPinHash: true,
      },
    });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const canAuthenticator = Boolean(user.twoFactorEnabled && user.twoFactorSecret);
    const canPinLogin = Boolean(
      user.twoFactorExempt && user.pinLoginEnabled && user.txnPinHash
    );

    // Guard: don't let a user pin a preference to a method they can't use.
    if (parsed.data.preferred === "authenticator" && !canAuthenticator) {
      return NextResponse.json(
        { error: "You don't have an authenticator app set up." },
        { status: 400 }
      );
    }
    if (parsed.data.preferred === "tpin" && !canPinLogin) {
      return NextResponse.json(
        { error: "TPIN login isn't available for your account." },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: auth.id },
      data: { preferredLoginMethod: parsed.data.preferred },
    });

    return NextResponse.json({ ok: true, preferred: parsed.data.preferred });
  } catch (e) {
    return toErrorResponse(e);
  }
}
