import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { getPosMachines } from "@/lib/partners/sameday-pos";
import { flags } from "@/lib/env";
import { toErrorResponse } from "@/lib/security/apiErrors";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

/**
 * Raw partner (tenant-wide) machine inventory. This is the unscoped fleet feed,
 * so it is restricted to admins. End users get their assigned terminals from
 * the ownership-scoped `/api/pos/my-machines`.
 */
export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
  } catch (e) {
    return toErrorResponse(e);
  }

  if (!flags.pos) {
    return NextResponse.json(
      { error: "POS service is not enabled" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const status = searchParams.get("status") as "active" | "inactive" | "maintenance" | "decommissioned" | undefined;
  const machine_type = searchParams.get("machine_type") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  const result = await getPosMachines({
    page: isNaN(page) ? 1 : page,
    limit: isNaN(limit) ? 50 : Math.min(limit, 100),
    status: status || undefined,
    machine_type,
    search,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.error?.message ?? "Failed to fetch POS machines" },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data);
}
