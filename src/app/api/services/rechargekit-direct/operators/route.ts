import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { chagansCcGetBillers } from "@/lib/partners/chagans-cc-bill";
import { AuthError } from "@/lib/auth-server";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/services/rechargekit-direct/operators
 *
 * Returns the list of credit-card billers (card issuers / banks) from the
 * Chagans CC Bill API (category C15). Cached in-process for 6 hours;
 * pass ?refresh=true to bust the cache and re-fetch live.
 *
 * Response shape is kept backwards-compatible with the old RechargeKit form
 * (operators[] with operatorCode + operatorName) so the form's loadOperators
 * call needs no changes.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    if (user.role !== "RETAILER")
      throw new AuthError(
        "Offline CC Bill Payment is available for retailers only",
        403
      );
    await assertServiceEnabled(SERVICE_KEYS.RECHARGEKIT_DIRECT, {
      name: "Offline CC Bill Payment",
      userId: user.id,
      role: user.role,
    });
    await enforceRateLimit(`rkd:operators:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const refresh = new URL(req.url).searchParams.get("refresh") === "true";
  const result = await chagansCcGetBillers(refresh);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: 502 }
    );
  }

  // Normalise to the shape the UI expects: { operators, count }
  // billerId → operatorCode; billerName → operatorName
  return NextResponse.json({
    operators: result.data.map((b) => ({
      operatorCode: b.billerId,
      operatorName: b.billerName,
      // Include billerId explicitly so the new form can use it directly.
      billerId: b.billerId,
      billerName: b.billerName,
    })),
    count: result.data.length,
  });
}
