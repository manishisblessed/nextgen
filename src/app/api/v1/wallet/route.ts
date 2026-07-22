import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/platform/apiKeys";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { getBalances } from "@/lib/ledger";
import { sub, toNumber } from "@/lib/money";

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
    // An admin lien (chargeback/fraud freeze) is intentionally hidden from the
    // partner API: `spendable` here reports walletBalance − heldBalance and does
    // NOT subtract the lien, so a lien cannot be inferred. A payout that dips
    // into liened funds will still be refused by the ledger at execution time.
    return NextResponse.json({
      ok: true,
      data: {
        walletBalance: toNumber(balances.walletBalance),
        heldBalance: toNumber(balances.heldBalance),
        spendable: toNumber(sub(balances.walletBalance, balances.heldBalance)),
        currency: "INR",
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
