import { NextResponse } from "next/server";
import { z } from "zod";
import { IdentityField, type Role } from "@prisma/client";
import { requireRole } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

/**
 * Master-admin: identity duplicate exceptions.
 *   GET  — list exceptions (default: PENDING) for review.
 *   POST — proactively create + APPROVE a value-scoped exception (pre-approval),
 *          e.g. before an invitee onboards. Guarded by step-up + activity log.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const NETWORK_TIERS: Role[] = ["SUPER_DISTRIBUTOR", "MASTER_DISTRIBUTOR", "DISTRIBUTOR", "RETAILER"];

export async function GET(req: Request) {
  try {
    // Read access — all admin roles may view; approval is master-admin only.
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
  } catch (e) {
    return toErrorResponse(e);
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  const where = status === "ALL" ? {} : { status: status as never };

  const rows = await prisma.identityException.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Resolve linked-account + requester names in a single pass.
  const userIds = Array.from(
    new Set(rows.flatMap((r) => [r.linkedUserId, r.userId, r.approvedById, r.requestedById].filter(Boolean) as string[]))
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, userCode: true, role: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    exceptions: rows.map((r) => ({
      id: r.id,
      field: r.field,
      value: r.value,
      role: r.role,
      status: r.status,
      reason: r.reason,
      linkedUser: r.linkedUserId ? byId.get(r.linkedUserId) ?? null : null,
      account: r.userId ? byId.get(r.userId) ?? null : null,
      approvedBy: r.approvedById ? byId.get(r.approvedById) ?? null : null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      inviteId: r.inviteId,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

const CreateBody = z
  .object({
    field: z.nativeEnum(IdentityField),
    value: z.string().min(2).max(120),
    role: z.enum(["SUPER_DISTRIBUTOR", "MASTER_DISTRIBUTOR", "DISTRIBUTOR", "RETAILER"]),
    reason: z.string().min(3).max(500),
    inviteId: z.string().optional(),
    // step-up fields tolerated in body (also read from headers)
    stepUpCode: z.string().max(20).optional(),
    stepUpType: z.enum(["totp", "backup"]).optional(),
  })
  .strict();

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "identity_exception.preapprove",
      roles: ["MASTER_ADMIN"],
      entity: "IdentityException",
    });
    await enforceRateLimit(`identity-exc:${admin.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const value = normalizeIdentityValue(parsed.data.field, parsed.data.value);
  const role = parsed.data.role as Role;

  if (!NETWORK_TIERS.includes(role)) {
    return NextResponse.json({ error: "Exceptions apply to network tiers only" }, { status: 400 });
  }

  try {
    const exc = await prisma.identityException.upsert({
      where: { field_value_role: { field: parsed.data.field, value, role } },
      create: {
        field: parsed.data.field,
        value,
        role,
        status: "APPROVED",
        reason: parsed.data.reason,
        inviteId: parsed.data.inviteId ?? null,
        requestedById: admin.id,
        approvedById: admin.id,
        approvedAt: new Date(),
      },
      update: {
        status: "APPROVED",
        reason: parsed.data.reason,
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, id: exc.id, status: exc.status });
  } catch (e) {
    return toErrorResponse(e);
  }
}

function normalizeIdentityValue(field: IdentityField, raw: string): string {
  const v = raw.trim();
  // Uppercase alphanumeric identifiers; leave account numbers / shop names as-is.
  if (field === "PAN" || field === "GSTIN") return v.toUpperCase();
  return v;
}
