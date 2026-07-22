import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { rejectQrClaim } from "@/lib/qr/claims";

/** Admin — reject a QR claim (note required; shown to the retailer). */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z.object({ note: z.string().min(3).max(500) }).strict();

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
    await enforceRateLimit(`qr:review:${admin.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await rejectQrClaim({
      claimId: params.id,
      adminId: admin.id,
      note: parsed.data.note,
    });
    return NextResponse.json(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
