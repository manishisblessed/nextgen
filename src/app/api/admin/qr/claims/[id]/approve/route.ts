import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { clientIp } from "@/lib/security/audit";
import { requireAdminActivity } from "@/lib/security/adminActivity";
import { requireTxnPin } from "@/lib/security/txnPin";
import { approveQrClaim } from "@/lib/qr/claims";

/**
 * Admin — approve a QR claim (SINGLE-approval model).
 * `portalVerified: true` is mandatory: the admin attests (audit-logged) that
 * the UTR was found in the third-party provider's merchant portal. One admin
 * approval is sufficient — but the approving admin must confirm their
 * transaction PIN (`x-txn-pin` header) as the authorization control. The wallet
 * credit is idempotent.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    portalVerified: z.boolean(),
    note: z.string().max(500).optional(),
  })
  .strict();

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let admin;
  try {
    admin = await requireAdminActivity(req, {
      action: "qr.claim.approve",
      roles: ["MASTER_ADMIN", "ADMIN", "SUPPORT"],
      entity: "QrClaim",
      entityId: params.id,
    });
    await enforceRateLimit(`qr:review:${admin.id}`, RATE_LIMITS.sensitiveWrite);
    // A single admin approval is enough, but it authorizes money movement, so
    // require the approving admin's transaction PIN (x-txn-pin header) — this
    // replaces the old second-admin maker-checker control.
    await requireTxnPin(admin, req, {
      action: "qr.claim.approve",
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  } catch (e) {
    return toErrorResponse(e);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await approveQrClaim({
      claimId: params.id,
      adminId: admin.id,
      note: parsed.data.note,
      portalVerified: parsed.data.portalVerified,
    });
    return NextResponse.json(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
