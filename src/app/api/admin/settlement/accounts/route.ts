import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { flags } from "@/lib/env";
import {
  samedaySettlementConfigured,
  settlementListAccounts,
} from "@/lib/partners/sameday-settlement";

/**
 * Admin — Same Day settlement beneficiary accounts.
 *   GET    — list all accounts (verified + trusted)
 *   POST   — DISABLED (adding an account triggers a chargeable penny-drop)
 *   DELETE — DISABLED (settlement account management removed for admins)
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

/** Settlement account management is disabled for admins — adding an account
 *  triggers a chargeable penny-drop and is part of the settlement money rail
 *  that no admin may operate (per product policy). */
function settlementDisabled(): NextResponse {
  return NextResponse.json(
    { error: "Settlement account management is disabled." },
    { status: 403 }
  );
}

export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    return toErrorResponse(e);
  }
  const notReady = guardConfigured();
  if (notReady) return notReady;

  const r = await settlementListAccounts();
  return r.ok
    ? NextResponse.json({ accounts: r.data })
    : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}

export async function POST() {
  // Adding a settlement account (chargeable penny-drop) is disabled.
  try {
    await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    return toErrorResponse(e);
  }
  return settlementDisabled();
}

export async function DELETE() {
  // Settlement account management is disabled.
  try {
    await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    return toErrorResponse(e);
  }
  return settlementDisabled();
}
