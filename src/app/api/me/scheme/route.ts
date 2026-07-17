import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { serializeScheme } from "@/lib/scheme/serialize";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/scheme
 *
 * Returns the full scheme (with slabs + MDR slabs) assigned to the caller.
 * Works for any network role — retailers see their distributor-assigned
 * scheme, distributors see their MD-assigned scheme, etc.
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

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { schemeId: true, role: true },
  });

  if (!me?.schemeId)
    return NextResponse.json({ scheme: null, role: me?.role ?? user.role });

  const scheme = await prisma.scheme.findFirst({
    where: { id: me.schemeId, active: true },
    include: {
      slabs: { where: { active: true }, orderBy: [{ service: "asc" }, { minAmount: "asc" }] },
      mdrSlabs: { where: { active: true }, orderBy: [{ serviceKind: "asc" }, { minAmount: "asc" }] },
      _count: { select: { slabs: true, users: true, mdrSlabs: true } },
    },
  });

  return NextResponse.json({
    scheme: scheme ? serializeScheme(scheme) : null,
    role: me.role,
  });
}
