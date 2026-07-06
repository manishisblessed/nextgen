import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { flags } from "@/lib/env";
import {
  samedaySettlementConfigured,
  settlementBalance,
  settlementList,
  settlementStatus,
} from "@/lib/partners/sameday-settlement";

/**
 * Admin — settlement status & listing.
 *   GET ?referenceId=  — one transfer (also live-refreshes PENDING at provider)
 *   GET ?list=true&limit=20 — recent transfers
 *   GET ?balance=true  — partner wallet balance at Same Day
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
  } catch (e) {
    return toErrorResponse(e);
  }
  if (!flags.settlement || !samedaySettlementConfigured()) {
    return NextResponse.json(
      { error: "Settlement rail is not configured. Set PARTNER_SETTLEMENT_ENABLED=true and the SAMEDAY_SETTLEMENT_API_KEY/SECRET." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const referenceId = url.searchParams.get("referenceId");

  if (url.searchParams.get("balance") === "true") {
    const r = await settlementBalance();
    return r.ok
      ? NextResponse.json(r.data)
      : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
  }

  if (referenceId) {
    const r = await settlementStatus(referenceId);
    return r.ok
      ? NextResponse.json({ transaction: r.data })
      : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
  }

  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
  const r = await settlementList(limit);
  return r.ok
    ? NextResponse.json({ transactions: r.data })
    : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}
