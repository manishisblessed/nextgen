import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import {
  samedaySettlementConfigured,
  settlementCharges,
  settlementTransfer,
} from "@/lib/partners/sameday-settlement";

/**
 * Admin — initiate a settlement transfer from the Same Day partner wallet to
 * a pre-verified bank account. MASTER_ADMIN/ADMIN only; idempotency-keyed so
 * a double-click or retry can never fire two transfers.
 *
 * GET ?amount=&mode= — charge preview (partners: ₹0, but never assume).
 */
const Body = z.object({
  accountId: z.string().min(1),
  amount: z.number().positive().max(10000000),
  mode: z.enum(["IMPS", "NEFT", "RTGS"]).default("IMPS"),
  narration: z.string().max(120).optional(),
  idempotencyKey: z.string().min(8),
}).strict();

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

export async function GET(req: Request) {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    return toErrorResponse(e);
  }
  const notReady = guardConfigured();
  if (notReady) return notReady;

  const url = new URL(req.url);
  const amount = Number(url.searchParams.get("amount"));
  const mode = (url.searchParams.get("mode") || "IMPS") as "IMPS" | "NEFT" | "RTGS";
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount query param required" }, { status: 400 });
  }

  const r = await settlementCharges(amount, mode);
  return r.ok
    ? NextResponse.json(r.data)
    : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    await enforceRateLimit(`settlement:transfer:${admin.id}`, RATE_LIMITS.payoutCreate);
  } catch (e) {
    return toErrorResponse(e);
  }
  const notReady = guardConfigured();
  if (notReady) return notReady;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { accountId, amount, mode, narration, idempotencyKey } = parsed.data;

  try {
    const result = await withIdempotency(
      { key: idempotencyKey, scope: "settlement.transfer", userId: admin.id },
      async () => {
        const r = await settlementTransfer({ accountId, amount, mode, narration });
        await prisma.auditLog.create({
          data: {
            userId: admin.id,
            action: r.ok ? "settlement.transfer_initiated" : "settlement.transfer_failed",
            entity: "SettlementTransfer",
            entityId: r.ok ? r.data.referenceId : idempotencyKey,
            meta: r.ok
              ? { amount, mode, accountId, status: r.data.status, utr: r.data.utr ?? null }
              : { amount, mode, accountId, code: r.code, message: r.message },
          },
        });
        if (!r.ok) {
          // Throwing releases the idempotency claim so a legitimate retry works.
          throw Object.assign(new Error(r.message), { partnerCode: r.code });
        }
        return r.data;
      }
    );
    return NextResponse.json({ transaction: result });
  } catch (e) {
    const code = (e as { partnerCode?: string }).partnerCode;
    if (code) return NextResponse.json({ error: (e as Error).message, code }, { status: 502 });
    return toErrorResponse(e);
  }
}
