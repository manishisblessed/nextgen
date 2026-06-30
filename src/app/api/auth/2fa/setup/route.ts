import { NextResponse } from "next/server";
import { toDataURL } from "qrcode";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import {
  generateTotpSecret,
  encryptSecret,
  getTotpUri,
  generateBackupCodes,
  hashBackupCodes,
} from "@/lib/two-factor";

/**
 * POST /api/auth/2fa/setup
 * Generates a new TOTP secret + QR code for the authenticated user.
 * Does NOT activate 2FA yet — user must confirm with /api/auth/2fa/confirm.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorEnabled: true },
  });

  if (dbUser?.twoFactorEnabled) {
    return NextResponse.json(
      { error: "2FA is already enabled. Disable it first to reconfigure." },
      { status: 400 }
    );
  }

  const base32Secret = generateTotpSecret();
  const uri = getTotpUri(base32Secret, user.email);

  const qrDataUrl = await toDataURL(uri, {
    errorCorrectionLevel: "M",
    width: 256,
    margin: 2,
  });

  const backupCodes = generateBackupCodes();
  const hashedCodes = await hashBackupCodes(backupCodes);

  // Store encrypted secret + hashed backup codes (not yet activated)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecret: encryptSecret(base32Secret),
      twoFactorBackupCodes: hashedCodes,
      twoFactorEnabled: false,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "2fa.setup_initiated",
      entity: "User",
      entityId: user.id,
      meta: { backupCodeCount: backupCodes.length },
    },
  });

  return NextResponse.json({
    ok: true,
    qrCode: qrDataUrl,
    secret: base32Secret, // shown once for manual entry
    backupCodes, // shown once — user must save these
  });
}
