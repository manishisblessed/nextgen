import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { clientIp } from "@/lib/security/audit";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const PARENT_ROLES = ["DISTRIBUTOR", "MASTER_DISTRIBUTOR", "SUPER_DISTRIBUTOR"];

const Body = z.object({
  childId: z.string().min(1),
  schemeId: z.string().min(1).nullable(),
}).strict();

/**
 * POST /api/network/scheme
 *
 * A network parent assigns (or clears) the unified scheme (charges + MDR) on a
 * direct child. Cascade model: only schemes the CALLER OWNS (derived from their
 * own scheme via /api/network/schemes) can be assigned. Clearing (null) leaves
 * the child with no scheme — which blocks them from transacting until a scheme
 * is assigned again.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
    if (!PARENT_ROLES.includes(user.role))
      return NextResponse.json({ error: "Only network parents can assign schemes" }, { status: 403 });
    await enforceRateLimit(`network:scheme:${user.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json({ error: e.message, retryAfterSec: e.result.retryAfterSec }, { status: 429 });
    throw e;
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { childId, schemeId } = parsed.data;

  const child = await prisma.user.findFirst({
    where: { id: childId, parentId: user.id, deletedAt: null },
    select: { id: true, name: true, schemeId: true },
  });
  if (!child)
    return NextResponse.json({ error: "User not found in your direct network" }, { status: 404 });

  // Validate the scheme exists, is active, and is OWNED by the caller (a
  // scheme they derived from their own — never someone else's pricing).
  if (schemeId) {
    const scheme = await prisma.scheme.findFirst({
      where: { id: schemeId, active: true, ownerId: user.id },
      select: { id: true },
    });
    if (!scheme)
      return NextResponse.json(
        { error: "Scheme not found, inactive, or not one of your derived schemes" },
        { status: 404 }
      );
  }

  await prisma.user.update({
    where: { id: childId },
    data: { schemeId },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "network.scheme.assign",
      entity: "User",
      entityId: childId,
      meta: {
        childName: child.name,
        previousSchemeId: child.schemeId,
        newSchemeId: schemeId ?? null,
      },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, childId, schemeId: schemeId ?? null });
}

/**
 * GET /api/network/scheme
 *
 * List schemes the caller can assign to their children — ONLY schemes the
 * caller owns (derived from their own scheme via /api/network/schemes).
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

  const schemes = await prisma.scheme.findMany({
    where: { active: true, ownerId: user.id },
    select: { id: true, name: true, description: true, isDefault: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ schemes });
}
