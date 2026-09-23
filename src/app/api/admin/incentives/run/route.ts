import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { clientIp } from "@/lib/security/audit";
import { prisma } from "@/lib/db";
import { runMonthlyIncentives, istPeriodKey } from "@/lib/incentive/engine";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.object({
  // "YYYY-MM"; defaults to the current IST month.
  periodKey: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "periodKey must be YYYY-MM")
    .optional(),
  // true = preview only (compute, don't credit). false = actually pay out.
  dryRun: z.boolean().default(true),
});

/**
 * POST /api/admin/incentives/run
 *
 * Manually run (or preview) the monthly incentive engine for a period, ignoring
 * the enabled / last-day gates. Idempotent: real runs never double-pay a
 * (user, scheme, period). Defaults to a dry-run preview.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "incentive.run",
      roles: ["MASTER_ADMIN", "ADMIN"],
      entity: "IncentiveScheme",
    });
    await enforceRateLimit(`incentive:run:${admin.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const periodKey = parsed.data.periodKey ?? istPeriodKey();

  const result = await runMonthlyIncentives(new Date(), {
    force: true,
    dryRun: parsed.data.dryRun,
    periodKey,
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: parsed.data.dryRun ? "incentive.run.preview" : "incentive.run.execute",
      entity: "IncentiveScheme",
      meta: {
        periodKey,
        dryRun: parsed.data.dryRun,
        paid: result.paid,
        skipped: result.skipped,
        failed: result.failed,
        totalRewarded: result.totalRewarded,
      },
      ip: clientIp(req),
    },
  });

  return NextResponse.json({ ok: true, result });
}
