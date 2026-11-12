import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { chagansCcGetBillers } from "@/lib/partners/chagans-cc-bill";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/services/chagans-cc/operators
 *
 * Returns credit-card billers (issuers/banks) from Chagans CC Bill API V2.
 * Cached in-process for 6 hours; pass ?refresh=true to bust the cache.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    if (user.role !== "RETAILER")
      throw new AuthError("CC Bill Payment is available for retailers only", 403);
    await assertServiceEnabled(SERVICE_KEYS.BBPS_CHAGANS, {
      name: "CC Bill Payment",
      userId: user.id,
      role: user.role,
    });
    await enforceRateLimit(`chagans-cc:operators:${user.id}`, RATE_LIMITS.default);
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

  return NextResponse.json({
    operators: result.data.map((b) => ({
      operatorCode: b.billerId,
      operatorName: b.billerName,
      billerId: b.billerId,
      billerName: b.billerName,
    })),
    count: result.data.length,
  });
}
