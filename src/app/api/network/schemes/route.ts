import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";
import { serializeScheme } from "@/lib/scheme/serialize";
import { createDerivedScheme, DerivedSchemeError, DERIVING_ROLES } from "@/lib/scheme/derived";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const CreateBody = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().max(300).optional(),
    overrides: z
      .array(
        z
          .object({
            parentSlabId: z.string().min(1),
            chargeValue: z.number().nonnegative().optional(),
            commissionValue: z.number().nonnegative().optional(),
          })
          .strict()
      )
      .max(500)
      .optional(),
    mdrOverrides: z
      .array(
        z
          .object({
            parentSlabId: z.string().min(1),
            mdrValue: z.number().nonnegative().optional(),
            mdrValueT0: z.number().nonnegative().optional(),
          })
          .strict()
      )
      .max(500)
      .optional(),
  })
  .strict();

/**
 * GET /api/network/schemes
 *
 * A network parent's scheme workspace: their own base scheme (the derivation
 * floor/ceiling, with slabs) + the derived schemes they own.
 */
export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }
  if (!DERIVING_ROLES.includes(user.role as (typeof DERIVING_ROLES)[number]))
    return NextResponse.json({ error: "Only network parents manage schemes" }, { status: 403 });

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { schemeId: true },
  });

  const [base, mine] = await Promise.all([
    me?.schemeId
      ? prisma.scheme.findFirst({
          where: { id: me.schemeId, active: true },
          include: {
            slabs: { where: { active: true }, orderBy: [{ service: "asc" }, { minAmount: "asc" }] },
            mdrSlabs: { where: { active: true }, orderBy: [{ serviceKind: "asc" }, { minAmount: "asc" }] },
            _count: { select: { slabs: true, users: true, mdrSlabs: true } },
          },
        })
      : Promise.resolve(null),
    prisma.scheme.findMany({
      where: { ownerId: user.id },
      include: {
        slabs: { orderBy: [{ service: "asc" }, { minAmount: "asc" }] },
        mdrSlabs: { orderBy: [{ serviceKind: "asc" }, { minAmount: "asc" }] },
        _count: { select: { slabs: true, users: true, mdrSlabs: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    baseScheme: base ? serializeScheme(base) : null,
    schemes: mine.map(serializeScheme),
  });
}

/**
 * POST /api/network/schemes
 *
 * Create a scheme derived from the caller's own scheme (per-slab markup,
 * bounded by the caller's rates).
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`network:schemes:${user.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json(
        { error: e.message, retryAfterSec: e.result.retryAfterSec },
        { status: 429 }
      );
    throw e;
  }

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const scheme = await createDerivedScheme({
      ownerId: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      overrides: parsed.data.overrides,
      mdrOverrides: parsed.data.mdrOverrides,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "network.scheme.create",
        entity: "Scheme",
        entityId: scheme.id,
        meta: { name: scheme.name, parentSchemeId: scheme.parentSchemeId },
        ip: clientIp(req),
      },
    });

    return NextResponse.json({ scheme: serializeScheme(scheme) }, { status: 201 });
  } catch (e) {
    if (e instanceof DerivedSchemeError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }
}
