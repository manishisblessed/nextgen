import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { assertServiceEnabled, ServiceDisabledError } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { isAdminRole } from "@/lib/security/ownership";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/pos/terminal-tree
 *
 * Returns the caller's network hierarchy members who sit on the path between
 * the caller and any assigned POS terminal, plus the terminals themselves.
 * Used by the frontend to build cascading filters:
 *   SD → MD → DT → RT → Terminal
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await assertServiceEnabled(SERVICE_KEYS.POS, {
      name: "POS Terminals",
      userId: user.id,
      role: user.role,
    });
  } catch (e) {
    if (e instanceof AuthError || e instanceof ServiceDisabledError)
      return NextResponse.json(
        { error: e.message },
        { status: e.statusCode }
      );
    throw e;
  }

  if (!flags.pos)
    return NextResponse.json(
      { error: "POS service is not enabled" },
      { status: 503 }
    );

  // Admins see everything — skip hierarchy scoping.
  if (isAdminRole(user.role)) {
    const terminals = await prisma.posMachine.findMany({
      where: { assignedUserId: { not: null }, tid: { not: null } },
      select: {
        tid: true,
        mid: true,
        model: true,
        location: true,
        city: true,
        assignedUserId: true,
        assignedAt: true,
        assignedUser: {
          select: { id: true, name: true, role: true, parentId: true },
        },
      },
    });

    return NextResponse.json({
      callerRole: user.role,
      members: [],
      terminals: terminals.map((t) => ({
        tid: t.tid,
        mid: t.mid,
        model: t.model,
        location: t.location,
        city: t.city,
        ownerId: t.assignedUserId,
        ownerName: t.assignedUser?.name ?? null,
        ownerRole: t.assignedUser?.role ?? null,
        assignedAt: t.assignedAt?.toISOString() ?? null,
      })),
    });
  }

  // Fetch the full downline subtree with a recursive CTE.
  const descendants = await prisma.$queryRaw<
    { id: string; name: string; role: string; parentId: string | null }[]
  >`
    WITH RECURSIVE downline AS (
      SELECT id, name, role, "parentId" FROM "User" WHERE "parentId" = ${user.id}
      UNION ALL
      SELECT u.id, u.name, u.role, u."parentId" FROM "User" u
      INNER JOIN downline d ON u."parentId" = d.id
    )
    SELECT id, name, role, "parentId" FROM downline
  `;

  const descendantIds = descendants.map((d) => d.id);
  const allIds = [user.id, ...descendantIds];

  // Fetch all terminals assigned to the caller or their downline.
  const terminals = await prisma.posMachine.findMany({
    where: { assignedUserId: { in: allIds }, tid: { not: null } },
    select: {
      tid: true,
      mid: true,
      model: true,
      location: true,
      city: true,
      assignedUserId: true,
      assignedAt: true,
    },
  });

  // Walk from each terminal owner up to the caller, collecting every
  // intermediate member that sits on the path. This ensures the cascading
  // dropdowns include users who don't hold a terminal directly but whose
  // children/grandchildren do.
  const descendantMap = new Map(descendants.map((d) => [d.id, d]));
  const relevantIds = new Set<string>();

  for (const t of terminals) {
    let cur = t.assignedUserId;
    while (cur && cur !== user.id && descendantMap.has(cur)) {
      relevantIds.add(cur);
      cur = descendantMap.get(cur)!.parentId;
    }
  }

  const members = descendants
    .filter((d) => relevantIds.has(d.id))
    .map((d) => ({
      id: d.id,
      name: d.name,
      role: d.role,
      parentId: d.parentId,
    }));

  return NextResponse.json({
    callerRole: user.role,
    members,
    terminals: terminals.map((t) => ({
      tid: t.tid,
      mid: t.mid,
      model: t.model,
      location: t.location,
      city: t.city,
      ownerId: t.assignedUserId,
      assignedAt: t.assignedAt?.toISOString() ?? null,
    })),
  });
}
