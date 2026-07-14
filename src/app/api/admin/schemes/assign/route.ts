import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { isAdminRole } from "@/lib/security/ownership";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

const AssignBody = z
  .object({
    // null/absent schemeId clears the assignment (user is then blocked from
    // transacting until a scheme is assigned again — cascade model).
    schemeId: z.string().min(1).nullable().default(null),
    userIds: z.array(z.string().min(1)).max(5000).optional(),
    // Cascade model: admin assigns platform schemes to SUPER_DISTRIBUTORs
    // only; each tier below is priced by its parent's derived schemes.
    role: z.enum(["SUPER_DISTRIBUTOR"]).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((!v.userIds || v.userIds.length === 0) && !v.role)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["userIds"], message: "Provide userIds or a role to assign" });
  });

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    if (!isAdminRole(admin.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await enforceRateLimit(`scheme:assign:${admin.id}`, RATE_LIMITS.default);
  } catch (e: unknown) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json({ error: e.message, retryAfterSec: e.result.retryAfterSec }, { status: 429 });
    throw e;
  }

  const parsed = AssignBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { schemeId, userIds, role } = parsed.data;

  // Validate target scheme (must exist + be active + be a PLATFORM scheme —
  // admin never hands out a network parent's derived scheme).
  if (schemeId) {
    const scheme = await prisma.scheme.findUnique({
      where: { id: schemeId },
      select: { active: true, ownerId: true },
    });
    if (!scheme) return NextResponse.json({ error: "Scheme not found" }, { status: 404 });
    if (!scheme.active) return NextResponse.json({ error: "Cannot assign an inactive scheme" }, { status: 400 });
    if (scheme.ownerId)
      return NextResponse.json(
        { error: "This is a network parent's derived scheme — admin can only assign platform schemes" },
        { status: 400 }
      );
  }

  // Cascade model: admin assignment targets SUPER_DISTRIBUTORs only.
  const where =
    userIds && userIds.length > 0
      ? { id: { in: userIds }, role: "SUPER_DISTRIBUTOR" as const }
      : { role: role! };

  const result = await prisma.user.updateMany({
    where,
    data: { schemeId },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: schemeId ? "scheme.assign" : "scheme.unassign",
      entity: "Scheme",
      entityId: schemeId ?? undefined,
      meta: { schemeId, role: role ?? null, userCount: result.count, byUserIds: !!(userIds && userIds.length) },
    },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
