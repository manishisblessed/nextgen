import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";
import { serializeMdrScheme } from "@/lib/mdr/serialize";
import {
  updateDerivedMdrScheme,
  deactivateDerivedMdrScheme,
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
            mdrValue: z.number().nonnegative().optional(),
          })
          .strict()
      )
      .max(500)
      .optional(),
  })
  .strict();

/** GET /api/network/mdr-schemes/[id] — a derived MDR scheme the caller owns. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const scheme = await prisma.mdrScheme.findFirst({
    where: { id: params.id, ownerId: user.id },
    include: {
      slabs: { orderBy: [{ serviceKind: "asc" }, { minAmount: "asc" }] },
      _count: { select: { slabs: true, users: true } },
    },
  });
  if (!scheme) return NextResponse.json({ error: "MDR scheme not found" }, { status: 404 });

  return NextResponse.json({ scheme: serializeMdrScheme(scheme) });
}

/** PUT /api/network/mdr-schemes/[id] — edit MDR values within parent bounds. */
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
    const scheme = await updateDerivedMdrScheme(user.id, params.id, parsed.data);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "network.mdr_scheme.update",
        entity: "MdrScheme",
        entityId: scheme.id,
        meta: { name: scheme.name, slabEdits: parsed.data.slabs?.length ?? 0 },
        ip: clientIp(req),
      },
    });

    return NextResponse.json({ scheme: serializeMdrScheme(scheme) });
  } catch (e) {
    if (e instanceof DerivedSchemeError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }
}

/** DELETE /api/network/mdr-schemes/[id] — deactivate (blocked while assigned). */
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
    const scheme = await deactivateDerivedMdrScheme(user.id, params.id);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "network.mdr_scheme.deactivate",
        entity: "MdrScheme",
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
