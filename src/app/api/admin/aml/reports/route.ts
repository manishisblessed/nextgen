import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toNumber } from "@/lib/money";
import { csvCell } from "@/lib/statements/walletStatement";
import { amlLimitsFromEnv, istDayStartUtc } from "@/lib/aml/engine";

/**
 * AML regulatory report exports (Phase 5).
 *   GET ?type=ctr&from=YYYY-MM-DD&to=YYYY-MM-DD — Cash/Currency Transaction
 *       Report candidates: every movement ≥ the CTR threshold in the window.
 *   GET ?type=str&from=&to= — Suspicious Transaction Report worksheet: all
 *       AML alerts filed in the window with rule evidence and review status.
 *
 * CSV shaped for the compliance officer preparing FIU-IND filings.
 * MASTER_ADMIN / ADMIN only; every export is audit-logged.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function csvResponse(filename: string, rows: string[][]): NextResponse {
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    await enforceRateLimit(`aml:report:${admin.id}`, RATE_LIMITS.reportQuery);
  } catch (e) {
    return toErrorResponse(e);
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (type !== "ctr" && type !== "str") {
    return NextResponse.json({ error: "type must be ctr or str" }, { status: 400 });
  }
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return NextResponse.json({ error: "Provide from/to as YYYY-MM-DD with from <= to" }, { status: 400 });
  }
  const start = istDayStartUtc(from);
  const end = new Date(istDayStartUtc(to).getTime() + 86_400_000);
  if (end.getTime() - start.getTime() > 92 * 86_400_000) {
    return NextResponse.json({ error: "Window too large — export at most 92 days at a time" }, { status: 400 });
  }

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: `aml.report_exported`,
      entity: "AmlReport",
      meta: { type, from, to },
    },
  });

  if (type === "ctr") {
    const threshold = amlLimitsFromEnv().ctrThreshold;
    const [txns, payouts] = await Promise.all([
      prisma.transaction.findMany({
        where: { createdAt: { gte: start, lt: end }, status: "SUCCESS", amount: { gte: threshold } },
        include: { user: { select: { name: true, email: true, phone: true, role: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.payoutRequest.findMany({
        where: { createdAt: { gte: start, lt: end }, status: "SUCCESS", totalDebit: { gte: threshold } },
        include: { user: { select: { name: true, email: true, phone: true, role: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const rows: string[][] = [
      ["Type", "Reference", "Date (UTC)", "User", "Email", "Phone", "Role", "Service/Mode", "Amount (INR)", "Counterparty"],
    ];
    for (const t of txns) {
      rows.push([
        "TXN", t.refId, t.createdAt.toISOString(), t.user.name, t.user.email, t.user.phone, t.user.role,
        t.service, String(toNumber(t.amount)), t.customer ?? "",
      ]);
    }
    for (const p of payouts) {
      rows.push([
        "PAYOUT", p.id, p.createdAt.toISOString(), p.user.name, p.user.email, p.user.phone, p.user.role,
        p.mode, String(toNumber(p.totalDebit)), `${p.beneficiaryName} (…${p.accountLast4})`,
      ]);
    }
    return csvResponse(`ctr-candidates-${from}-to-${to}.csv`, rows);
  }

  // type === "str"
  const alerts = await prisma.amlAlert.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: {
      user: { select: { name: true, email: true, phone: true, role: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows: string[][] = [
    ["Alert ID", "Filed (UTC)", "IST Day", "Rule", "Severity", "Status", "User", "Email", "Phone", "Role", "Evidence", "Review note", "Reviewed by", "Reviewed at"],
  ];
  for (const a of alerts) {
    rows.push([
      a.id,
      a.createdAt.toISOString(),
      a.dateKey,
      a.rule,
      a.severity,
      a.status,
      a.user.name,
      a.user.email,
      a.user.phone,
      a.user.role,
      JSON.stringify(a.details),
      a.reviewNote ?? "",
      a.reviewedBy?.name ?? "",
      a.reviewedAt?.toISOString() ?? "",
    ]);
  }
  return csvResponse(`str-worksheet-${from}-to-${to}.csv`, rows);
}
