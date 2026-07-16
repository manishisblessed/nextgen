import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { getDailyUserReport } from "@/lib/reports/daily";
import { isAdminRole, getDescendantIds } from "@/lib/security/ownership";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports/daily
 *   ?date=YYYY-MM-DD           (IST day; defaults to today IST)
 *   &role=RETAILER|DISTRIBUTOR|MASTER_DISTRIBUTOR|SUPER_DISTRIBUTOR
 *   &service=<ServiceCode>     (limits Balance-used breakdown to this service)
 *   &q=<name/email/shop/id>
 *   &page=1&pageSize=25
 *
 * Ownership-scoped: admins see everyone; non-admins see self + downline
 * (uses the same primitives as the Reports hub).
 *
 * Returns the *rich* daily report shape (with per-service debit &
 * commission breakdowns) — the dashboard panel expands each row using
 * these arrays. For the flat/exportable shape use /api/reports/daily-user.
 */

const QuerySchema = z.object({
  date: z.string().trim().max(40).optional(),
  role: z.string().trim().max(40).optional(),
  service: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export async function GET(req: Request) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`report:daily:${user.id}`, RATE_LIMITS.reportQuery);
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json({ error: e.message }, { status: 429 });
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const q = parsed.data;

  try {
    // Ownership scoping: admins see everyone; non-admins see self + downline.
    const userIds = isAdminRole(user.role)
      ? null
      : [user.id, ...(await getDescendantIds(user.id))];

    const report = await getDailyUserReport({
      date: q.date ?? null,
      userIds,
      role: q.role ?? null,
      service: q.service ?? null,
      q: q.q ?? null,
      page: q.page,
      pageSize: q.pageSize,
    });
    return NextResponse.json(report);
  } catch (e) {
    console.error("[admin/reports/daily] error:", e);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
