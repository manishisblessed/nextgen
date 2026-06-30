import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { runReport } from "@/lib/reports/server";
import { clientIpFromHeaders } from "@/lib/security/audit";
import { isReportType, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE, type ReportParams } from "@/lib/reports/types";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
  service: z.string().trim().max(40).optional(),
  mode: z.string().trim().max(40).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  export: z.enum(["1", "true"]).optional(),
});

/** Parse a YYYY-MM-DD or ISO string into a Date (null if absent/invalid). */
function parseDate(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Date-only strings should cover the whole day on the upper bound.
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) d.setHours(23, 59, 59, 999);
  return d;
}

export async function GET(req: Request, { params }: { params: { type: string } }) {
  let user;
  try {
    user = await requireAuth();
    await enforceRateLimit(`report:${user.id}`, RATE_LIMITS.reportQuery);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json({ error: e.message, retryAfterSec: e.result.retryAfterSec }, { status: 429 });
    throw e;
  }

  const type = params.type;
  if (!isReportType(type)) {
    return NextResponse.json({ error: "Unknown report type" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const q = parsed.data;

  const reportParams: ReportParams = {
    from: parseDate(q.from),
    to: parseDate(q.to, true),
    page: q.page,
    pageSize: q.pageSize,
    q: q.q ?? null,
    status: q.status ?? null,
    service: q.service ?? null,
    mode: q.mode ?? null,
    forExport: q.export === "1" || q.export === "true",
  };

  try {
    const result = await runReport(type, user, reportParams);

    // Audit trail — only the sensitive case (a full data export) is logged.
    // Routine paginated views are high-frequency reads and would flood the log.
    if (reportParams.forExport) {
      const h = headers();
      await prisma.auditLog
        .create({
          data: {
            userId: user.id,
            action: "report.export",
            entity: "Report",
            entityId: type,
            meta: {
              type,
              from: q.from ?? null,
              to: q.to ?? null,
              filters: { q: q.q ?? null, status: q.status ?? null, service: q.service ?? null, mode: q.mode ?? null },
              matched: result.total,
            },
            ip: clientIpFromHeaders(h),
            userAgent: h.get("user-agent") ?? null,
          },
        })
        .catch(() => {
          /* never let audit logging break a read */
        });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error(`[reports/${type}] query error:`, e);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
