import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { assertServiceEnabled, isServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { bulkpeBbpsPendingBills } from "@/lib/partners/bulkpe-bbps";
import { flags } from "@/lib/env";

/**
 * GET /api/services/bbps/pending-bills?page=1&limit=25&sort=dueDate&order=desc
 *
 * Returns pending/upcoming bills from BulkPe's auto-fetch system.
 * These are pre-registered bill accounts whose due dates are tracked.
 */

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    await assertServiceEnabled(SERVICE_KEYS.BBPS, { name: "Bill Payments", userId: user.id, role: user.role });
    await enforceRateLimit(`bbps:pending:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  // Pending-bill auto-fetch is a BulkPe-only feature — return an empty list
  // when BulkPe is held (env flag) or BBPS-2 is disabled by admin.
  const bbps2On = flags.bbpsBulkpe && (await isServiceEnabled(SERVICE_KEYS.BBPS_BULKPE));
  if (!bbps2On) {
    return NextResponse.json({ bills: [], total: 0, message: "BBPS-2 (BulkPe) is not enabled" });
  }

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page")) || 1;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 50);
  const sort = (url.searchParams.get("sort") as "dueDate" | "createdAt") || "dueDate";
  const order = (url.searchParams.get("order") as "asc" | "desc") || "desc";
  const billerCategory = url.searchParams.get("category") || undefined;

  const r = await bulkpeBbpsPendingBills({
    page,
    limit,
    sort,
    order,
    billerCategory,
    isAutofetchEnabled: 1,
  });

  if (!r.ok) {
    return NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
  }

  const raw = r.raw as { total?: number; count?: number; page?: number } | undefined;
  return NextResponse.json({
    bills: r.data,
    total: raw?.total ?? r.data.length,
    page: raw?.page ?? page,
  });
}
