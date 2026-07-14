import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/auth-server";
import { getEffectiveMdr } from "@/lib/mdr/resolver";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.object({
  userId: z.string().min(1),
  serviceKind: z.enum(["POS", "PG", "QR", "UPI"]),
  paymentMode: z.string().min(1).max(30).default("*"),
  amount: z.number().positive(),
});

/**
 * POST — MDR diagnostics: given a user + service + amount, show exactly which
 * scheme/slab resolves and what the MDR + commission split would be.
 */
export async function POST(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT", "FINANCE");
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { userId, serviceKind, amount, paymentMode } = parsed.data;
  try {
    const result = await getEffectiveMdr(userId, serviceKind, amount, paymentMode);
    if (result.source === "NONE")
      return NextResponse.json({
        resolved: false,
        message:
          "No MDR slab matches this user / service / amount. The transaction would use the platform's commission engine defaults.",
      });
    return NextResponse.json({
      resolved: true,
      source: result.source,
      schemeId: result.schemeId,
      schemeName: result.schemeName,
      slabId: result.slabId,
      mdr: result.mdr.toNumber(),
      mdrType: result.mdrType,
      commission: {
        retailer: result.commission.retailer.toNumber(),
        distributor: result.commission.distributor.toNumber(),
        master: result.commission.master.toNumber(),
        superDistributor: result.commission.superDistributor.toNumber(),
      },
    });
  } catch (e) {
    console.error("[admin/mdr-schemes/diagnose] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
