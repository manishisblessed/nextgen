import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";

/**
 * GET /api/admin/pos/manual-slips
 *
 * Admin verification queue for manual POS slips (no-API acquirers). Defaults to
 * the PENDING queue; filterable by status. Includes the uploader + terminal so
 * an admin can review and approve/reject. The slip image/PDF is fetched via the
 * per-slip signed viewer route so private URLs aren't minted for the whole page.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT", "FINANCE");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 25));

  const where = status && status !== "ALL" ? { status } : {};

  const [total, slips, counts] = await Promise.all([
    prisma.posManualSlip.count({ where }),
    prisma.posManualSlip.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        uploader: { select: { id: true, name: true, userCode: true, role: true } },
      },
    }),
    prisma.posManualSlip.groupBy({ by: ["status"], _count: true }),
  ]);

  // Enrich with terminal display info (machineId is a plain reference).
  const machineIds = Array.from(new Set(slips.map((s) => s.machineId)));
  const machines = machineIds.length
    ? await prisma.posMachine.findMany({
        where: { id: { in: machineIds } },
        select: { id: true, model: true, location: true, city: true, provider: true, brandId: true },
      })
    : [];
  const machineById = new Map(machines.map((m) => [m.id, m]));

  return NextResponse.json({
    summary: counts.map((c) => ({ status: c.status, count: c._count })),
    slips: slips.map((s) => {
      const m = machineById.get(s.machineId);
      return {
        id: s.id,
        uploader: {
          id: s.uploader.id,
          name: s.uploader.name,
          userCode: s.uploader.userCode,
          role: s.uploader.role,
        },
        tid: s.tid,
        machine: m
          ? { model: m.model, location: m.location, city: m.city, provider: m.provider, branded: !!m.brandId }
          : null,
        grossAmount: toNumber(s.grossAmount),
        paymentMode: s.paymentMode,
        rrn: s.rrn,
        authCode: s.authCode,
        cardType: s.cardType,
        brandType: s.brandType,
        txnTime: s.txnTime?.toISOString() ?? null,
        slipFormat: s.slipFormat,
        slipResourceType: s.slipResourceType,
        status: s.status,
        rejectionReason: s.rejectionReason,
        transactionRef: s.transactionRef,
        reviewedAt: s.reviewedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      };
    }),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
