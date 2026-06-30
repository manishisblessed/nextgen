import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { scopeUserIdFilter } from "@/lib/security/ownership";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import { posMachineSelect, serializePosMachine } from "@/lib/pos/assignments";
import type { Prisma } from "@prisma/client";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/pos/my-machines
 *
 * User-facing list of POS machines assigned to the caller (and, for parents,
 * their downline). Scoped via `scopeUserIdFilter` so a user can never see a
 * machine that isn't theirs. Admins see the whole assigned fleet.
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!flags.pos)
    return NextResponse.json(
      { error: "POS service is not enabled" },
      { status: 503 }
    );

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") ?? 50)));

  // scopeUserIdFilter returns { userId: { in: [...] } } for non-admins, {} for
  // admins. The machine's owner column is `assignedUserId`, so remap it.
  const scope = await scopeUserIdFilter(user);
  const where: Prisma.PosMachineWhereInput = scope.userId
    ? { assignedUserId: scope.userId }
    : { assignedUserId: { not: null } };

  const [rows, total] = await Promise.all([
    prisma.posMachine.findMany({
      where,
      select: posMachineSelect,
      orderBy: [{ assignedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.posMachine.count({ where }),
  ]);

  const active = await prisma.posMachine.count({
    where: { ...where, status: "active" },
  });

  return NextResponse.json({
    data: rows.map(serializePosMachine),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasPrev: page > 1,
      hasNext: page * pageSize < total,
    },
    stats: { total, active },
  });
}
