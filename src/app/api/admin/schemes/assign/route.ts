import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

const AssignBody = z
  .object({
    schemeId: z.string().min(1).nullable().default(null),
    userIds: z.array(z.string().min(1)).min(1).max(5000),
  })
  .strict();

/**
 * POST /api/admin/schemes/assign
 *
 * Admin assigns (or unassigns) a scheme to user(s) directly. Assignment is
 * bound by the cascade invariant (same rule as PATCH /api/admin/network/[id]):
 *   - a platform scheme (ownerId null) can only go to SUPER_DISTRIBUTORs;
 *   - a derived scheme can only go to users whose parent owns that scheme.
 * Unassigning (schemeId null) is always allowed.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "scheme.assign",
      roles: ["MASTER_ADMIN", "ADMIN"],
      entity: "Scheme",
    });
    await enforceRateLimit(`scheme:assign:${admin.id}`, RATE_LIMITS.default);
  } catch (e: unknown) {
    return toErrorResponse(e);
  }

  const parsed = AssignBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { schemeId, userIds } = parsed.data;

  if (schemeId) {
    const scheme = await prisma.scheme.findUnique({
      where: { id: schemeId },
      select: { active: true, ownerId: true },
    });
    if (!scheme) return NextResponse.json({ error: "Scheme not found" }, { status: 404 });
    if (!scheme.active) return NextResponse.json({ error: "Cannot assign an inactive scheme" }, { status: 400 });

    // Cascade invariant: a scheme can only land on users it's actually meant for.
    // Platform scheme (no owner) -> super-distributors only; derived scheme ->
    // only users whose parent owns it. Reject the whole batch on any violation
    // so a bulk assign can never silently mis-price part of the network.
    const targets = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, role: true, parentId: true },
    });
    const invalid = targets.filter((u) =>
      scheme.ownerId ? scheme.ownerId !== u.parentId : u.role !== "SUPER_DISTRIBUTOR"
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: scheme.ownerId
            ? `This scheme belongs to a specific parent — ${invalid.length} of the selected user(s) are not that parent's direct children. Assign each user a scheme derived from their own parent.`
            : `Platform schemes can only be assigned to super-distributors — ${invalid.length} of the selected user(s) are lower tiers, who must receive a scheme from their parent.`,
        },
        { status: 400 }
      );
    }
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { schemeId },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: schemeId ? "scheme.assign" : "scheme.unassign",
      entity: "Scheme",
      entityId: schemeId ?? undefined,
      meta: { schemeId, userCount: result.count, userIds },
    },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
