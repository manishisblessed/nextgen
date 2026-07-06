import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/platform/apiKeys";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { getBalances } from "@/lib/ledger";
import { toNumber } from "@/lib/money";

/**
 * Partner API v1 — GET /api/v1/wallet
 * Scope: wallet.read
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { user } = await requireApiKey(req, ["wallet.read"]);
    const balances = await getBalances(user.id);
    return NextResponse.json({
      ok: true,
      data: {
        walletBalance: toNumber(balances.walletBalance),
        heldBalance: toNumber(balances.heldBalance),
        spendable: toNumber(balances.spendable),
        currency: "INR",
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
