import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { prisma } from "@/lib/db";

/**
 * Admin — enable/disable a static QR.
 *   PATCH { active: boolean }
 * Re-activating an old QR disables the current one in the same transaction
 * (the "at most one active QR" invariant). QRs are never deleted so old
 * claims keep their reference.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.object({ active: z.boolean() }).strict();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    await enforceRateLimit(`qr:manage:${admin.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const qr = await prisma.staticQr.findUnique({ where: { id: params.id } });
  if (!qr) return NextResponse.json({ error: "QR not found" }, { status: 404 });

  if (parsed.data.active) {
    await prisma.$transaction(async (tx) => {
      await tx.staticQr.updateMany({
        where: { active: true, id: { not: qr.id } },
        data: { active: false, disabledAt: new Date(), disabledById: admin.id },
      });
      await tx.staticQr.update({
        where: { id: qr.id },
        data: { active: true, disabledAt: null, disabledById: null },
      });
    });
  } else {
    await prisma.staticQr.update({
      where: { id: qr.id },
      data: { active: false, disabledAt: new Date(), disabledById: admin.id },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: parsed.data.active ? "static_qr.activated" : "static_qr.disabled",
      entity: "StaticQr",
      entityId: qr.id,
      meta: { label: qr.label },
    },
  });

  return NextResponse.json({ ok: true, id: qr.id, active: parsed.data.active });
}
