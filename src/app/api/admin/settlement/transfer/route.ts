import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { flags } from "@/lib/env";
import {
  samedaySettlementConfigured,
  settlementCharges,
} from "@/lib/partners/sameday-settlement";

/**
 * Admin — settlement charge preview from the Same Day partner wallet.
 *
 * GET ?amount=&mode= — charge preview (partners: ₹0, but never assume).
 *
 * POST (initiate transfer) is disabled: settlement bank transfers are a money
 * movement no admin may perform per product policy.
 */

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

function guardConfigured(): NextResponse | null {
  if (!flags.settlement || !samedaySettlementConfigured()) {
    return NextResponse.json(
      { error: "Settlement rail is not configured. Set PARTNER_SETTLEMENT_ENABLED=true and the SAMEDAY_SETTLEMENT_API_KEY/SECRET." },
      { status: 503 }
    );
  }
  return null;
}

/** Settlement bank transfers are disabled for admins — no admin may perform
 *  this money movement (per product policy). */
function settlementDisabled(): NextResponse {
  return NextResponse.json(
    { error: "Settlement transfers are disabled." },
    { status: 403 }
  );
}

export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    return toErrorResponse(e);
  }
  const notReady = guardConfigured();
  if (notReady) return notReady;

  const url = new URL(req.url);
  const amount = Number(url.searchParams.get("amount"));
  const mode = (url.searchParams.get("mode") || "IMPS") as "IMPS" | "NEFT" | "RTGS";
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount query param required" }, { status: 400 });
  }

  const r = await settlementCharges(amount, mode);
  return r.ok
    ? NextResponse.json(r.data)
    : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}

export async function POST() {
  // Settlement bank transfers are disabled — no admin may perform this money
  // movement (per product policy). Auth is still enforced so unauthenticated
  // callers get a 401 rather than a 403.
  try {
    await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    return toErrorResponse(e);
  }
  return settlementDisabled();
}
