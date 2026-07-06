import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { prisma } from "@/lib/db";

/**
 * The one live static QR every retailer collects payments on.
 * Returns { qr: null } when the admin hasn't configured one yet.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    await assertServiceEnabled(SERVICE_KEYS.QR, { name: "QR Payments", userId: user.id, role: user.role });
  } catch (e) {
    return toErrorResponse(e);
  }

  const qr = await prisma.staticQr.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    qr: qr
      ? {
          id: qr.id,
          label: qr.label,
          upiVpa: qr.upiVpa,
          imageUrl: qr.imageUrl,
          activatedAt: qr.createdAt.toISOString(),
        }
      : null,
  });
}
