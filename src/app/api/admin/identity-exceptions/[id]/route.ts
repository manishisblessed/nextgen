import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

/**
 * Master-admin: approve / reject / revoke an identity duplicate exception.
 * Master-admin only, gated by step-up + activity recording (who/where/what).
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    action: z.enum(["approve", "reject", "revoke"]),
    reason: z.string().max(500).optional(),
    stepUpCode: z.string().max(20).optional(),
    stepUpType: z.enum(["totp", "backup"]).optional(),
  })
  .strict();

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "identity_exception.review",
      roles: ["MASTER_ADMIN"],
      entity: "IdentityException",
      entityId: params.id,
    });
    await enforceRateLimit(`identity-exc:${admin.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.identityException.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Exception not found" }, { status: 404 });

  const nextStatus =
    parsed.data.action === "approve" ? "APPROVED" : parsed.data.action === "reject" ? "REJECTED" : "REVOKED";

  const updated = await prisma.identityException.update({
    where: { id: params.id },
    data: {
      status: nextStatus,
      reason: parsed.data.reason ?? existing.reason,
      approvedById: admin.id,
      approvedAt: parsed.data.action === "approve" ? new Date() : existing.approvedAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: `identity_exception.${parsed.data.action}`,
      entity: "IdentityException",
      entityId: params.id,
      meta: {
        field: updated.field,
        value: updated.value,
        role: updated.role,
        linkedUserId: updated.linkedUserId,
        note: parsed.data.reason ?? null,
      },
    },
  });

  return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
}
