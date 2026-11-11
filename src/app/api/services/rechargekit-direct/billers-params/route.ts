import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { chagansCcGetBillerParams } from "@/lib/partners/chagans-cc-bill";
import { AuthError } from "@/lib/auth-server";

const Body = z
  .object({
    billerId: z.string().min(1, "billerId is required"),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * POST /api/services/rechargekit-direct/billers-params
 *
 * Fetches the required input fields for a specific biller from the Chagans CC
 * Bill API. Also returns an enquiryId (valid 30 minutes) that MUST be passed
 * to both the subsequent fetch-bill and pay calls.
 *
 * The UI should call this every time the user selects a biller so that a fresh
 * enquiryId is always in hand when the user clicks "Fetch Bill".
 *
 * Response:
 *   {
 *     requiredFields: [{ paramName: string, dataType: string }],
 *     billerName: string,
 *     enquiryId: string,   // 30-min session token
 *     enquiryFetchedAt: number  // Date.now() so the client can track expiry
 *   }
 */
export async function POST(req: Request) {
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
    await enforceRateLimit(`rkd:billers-params:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await chagansCcGetBillerParams(parsed.data.billerId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: 502 }
    );
  }

  return NextResponse.json({
    requiredFields: result.data.requiredFields,
    billerName: result.data.billerName,
    enquiryId: result.data.enquiryId,
    enquiryFetchedAt: Date.now(), // Client uses this to check 30-min expiry
  });
}
