import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { NETWORK_TIERS, type DbRole } from "@/lib/hierarchy";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/invite/parents?role=MASTER_DISTRIBUTOR
 *
 * Returns active users one tier above the given role — these are valid parents
 * for the new invitee. Only Master Admin needs this (Admin can only create SD
 * which has no parent).
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireRole("MASTER_ADMIN");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const targetRole = searchParams.get("role") as DbRole | null;

  if (!targetRole || !NETWORK_TIERS.includes(targetRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const tierIdx = NETWORK_TIERS.indexOf(targetRole);

  // SD has no parent — they're top-level network nodes
  if (tierIdx === NETWORK_TIERS.length - 1) {
    return NextResponse.json({ parents: [] });
  }

  const parentRole = NETWORK_TIERS[tierIdx + 1];

  const parents = await prisma.user.findMany({
    where: {
      role: parentRole,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      phone: true,
      shopName: true,
      city: true,
      state: true,
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  return NextResponse.json({ parents, parentRole });
}
