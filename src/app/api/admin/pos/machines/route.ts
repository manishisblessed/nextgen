import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { isAdminRole } from "@/lib/security/ownership";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import { posMachineSelect, serializePosMachine } from "@/lib/pos/assignments";
import type { Prisma } from "@prisma/client";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/pos/machines
 *
 * Admin view of the locally-synced POS inventory, including each machine's
 * assignee. Supports status / search / assignee filters and pagination.
 */
export async function GET(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
    if (!isAdminRole(admin.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  const status = searchParams.get("status") ?? "";
  const search = (searchParams.get("search") ?? "").trim();
  // assignee: "all" | "assigned" | "unassigned" | a specific userId
  const assignee = searchParams.get("assignee") ?? "all";

  const where: Prisma.PosMachineWhereInput = {};

  if (status) where.status = status;

  if (assignee === "assigned") where.assignedUserId = { not: null };
  else if (assignee === "unassigned") where.assignedUserId = null;
  else if (assignee && assignee !== "all") where.assignedUserId = assignee;

  if (search) {
    where.OR = [
      { tid: { contains: search, mode: "insensitive" } },
      { mid: { contains: search, mode: "insensitive" } },
      { serial: { contains: search, mode: "insensitive" } },
      { externalId: { contains: search, mode: "insensitive" } },
    ];
  }

  const [rows, total, assigned] = await Promise.all([
    prisma.posMachine.findMany({
      where,
      select: posMachineSelect,
      orderBy: [{ assignedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.posMachine.count({ where }),
    prisma.posMachine.count({ where: { assignedUserId: { not: null } } }),
  ]);

  const totalAll = await prisma.posMachine.count();

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
    stats: {
      total: totalAll,
      assigned,
      unassigned: totalAll - assigned,
    },
  });
}
