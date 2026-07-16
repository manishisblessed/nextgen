import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { isAdminRole } from "@/lib/security/ownership";
import { prisma } from "@/lib/db";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/schemes/meta — dropdown data for the scheme-management UI:
 *   providers:    configured partner routes grouped by service kind
 *                 (BBPS/RECHARGE/DMT/PAYOUT/...), for provider-scoped slabs
 *   posCompanies: distinct acquiring-company labels from the POS fleet,
 *                 for company-wise MDR rates
 */
export async function GET() {
  try {
    const admin = await requireRole("MASTER_ADMIN", "ADMIN");
    if (!isAdminRole(admin.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const [routes, companiesByField, companiesByModel] = await Promise.all([
    prisma.serviceRoute.findMany({
      where: { type: "SERVICE", provider: { not: null } },
      select: { kind: true, provider: true, name: true },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.posMachine.findMany({
      where: { company: { not: null } },
      select: { company: true },
      distinct: ["company"],
      orderBy: { company: "asc" },
    }),
    prisma.posMachine.findMany({
      where: { model: { not: null } },
      select: { model: true },
      distinct: ["model"],
      orderBy: { model: "asc" },
    }),
  ]);

  // De-duplicate providers per kind (multiple routes can share a provider).
  const providersByKind: Record<string, Array<{ provider: string; name: string }>> = {};
  for (const r of routes) {
    if (!r.provider) continue;
    const list = (providersByKind[r.kind] ??= []);
    if (!list.some((p) => p.provider === r.provider)) {
      list.push({ provider: r.provider, name: r.name });
    }
  }

  const companyNames = new Set<string>();
  for (const c of companiesByField) if (c.company) companyNames.add(c.company);
  for (const c of companiesByModel) if (c.model) companyNames.add(c.model);

  return NextResponse.json({
    providersByKind,
    posCompanies: Array.from(companyNames).sort(),
  });
}
