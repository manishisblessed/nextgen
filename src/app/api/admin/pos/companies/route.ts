import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/pos/companies
 *
 * Distinct acquiring "company" labels present on POS machines in the fleet.
 * Used to populate the brand picker so admins select an existing company from
 * the fleet instead of typing a name by hand. Each entry includes the machine
 * count for that company as a quick sanity signal.
 */
export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT", "FINANCE");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const grouped = await prisma.posMachine.groupBy({
    by: ["company"],
    where: { company: { not: null } },
    _count: { _all: true },
  });

  const companies = grouped
    .map((g) => ({ company: (g.company ?? "").trim(), machineCount: g._count._all }))
    .filter((c) => c.company.length > 0)
    .sort((a, b) => a.company.localeCompare(b.company));

  return NextResponse.json({ companies });
}
