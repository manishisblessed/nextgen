import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";
import { serializeScheme } from "@/lib/scheme/serialize";
import {
  updateDerivedScheme,
  deactivateDerivedScheme,
  DerivedSchemeError,
} from "@/lib/scheme/derived";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const UpdateBody = z
  .object({
    name: z.string().trim().min(3).max(80).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    active: z.boolean().optional(),
    slabs: z
      .array(
        z
          .object({
            id: z.string().min(1),
            chargeValue: z.number().nonnegative().optional(),
            commissionValue: z.number().nonnegative().optional(),
          })
          .strict()
      )
      .max(500)
      .optional(),
  })
  .strict();

/** GET /api/network/schemes/[id] — a derived scheme the caller owns. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const scheme = await prisma.scheme.findFirst({
    where: { id: params.id, ownerId: user.id },
    include: {
      slabs: { orderBy: [{ service: "asc" }, { minAmount: "asc" }] },
      _count: { select: { slabs: true, users: true } },
    },
  });
  if (!scheme) return NextResponse.json({ error: "Scheme not found" }, { status: 404 });

  return NextResponse.json({ scheme: serializeScheme(scheme) });
}

/** PUT /api/network/schemes/[id] — edit slab values within parent bounds. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
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

  const parsed = UpdateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const scheme = await updateDerivedScheme(user.id, params.id, parsed.data);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "network.scheme.update",
        entity: "Scheme",
        entityId: scheme.id,
        meta: { name: scheme.name, slabEdits: parsed.data.slabs?.length ?? 0 },
        ip: clientIp(req),
      },
    });

    return NextResponse.json({ scheme: serializeScheme(scheme) });
  } catch (e) {
    if (e instanceof DerivedSchemeError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }
}

/** DELETE /api/network/schemes/[id] — deactivate (blocked while assigned). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
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

  try {
    const scheme = await deactivateDerivedScheme(user.id, params.id);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "network.scheme.deactivate",
        entity: "Scheme",
        entityId: scheme.id,
        meta: { name: scheme.name },
        ip: clientIp(req),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DerivedSchemeError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }
}
