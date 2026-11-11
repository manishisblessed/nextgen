import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { assertServiceEnabled } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { chagansCcFetchBill } from "@/lib/partners/chagans-cc-bill";
import { AuthError } from "@/lib/auth-server";

const Body = z
  .object({
    billerId: z.string().min(1, "billerId is required"),
    enquiryId: z.string().min(1, "enquiryId is required"),
    /**
     * Positional parameters mapping biller fields to values.
     * Keys are param1, param2, … matching the order of requiredFields returned
     * by /billers-params. Values are strings (even for NUMERIC dataType).
     */
    parameters: z
      .record(z.string(), z.string())
      .refine(
        (p) => Object.keys(p).length > 0,
        "At least one parameter is required"
      ),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * POST /api/services/rechargekit-direct/fetch-bill
 *
 * Validates the consumer inputs and retrieves bill details from the Chagans
 * CC Bill API. No money moves here — this is a read-only preflight.
 *
 * The same enquiryId obtained from /billers-params must be used here AND in
 * the subsequent /pay call. The enquiryId is valid for 30 minutes.
 *
 * Response:
 *   {
 *     billerResponse: Record<string,unknown>,  // raw BBPS biller data
 *     additionalInfo: Record<string,unknown>,
 *     message: string,
 *     dueAmount: number | null  // extracted bill amount (null if unavailable)
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
    // Rate limit is shared with charges (non-money, reads only)
    await enforceRateLimit(`rkd:fetch-bill:${user.id}`, RATE_LIMITS.default);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;

  const result = await chagansCcFetchBill({
    billerId: d.billerId,
    enquiryId: d.enquiryId,
    parameters: d.parameters,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: 502 }
    );
  }

  return NextResponse.json({
    billerResponse: result.data.billerResponse,
    additionalInfo: result.data.additionalInfo,
    message: result.data.message,
    dueAmount: result.data.dueAmount,
  });
}
