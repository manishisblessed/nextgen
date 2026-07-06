import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import {
  samedaySettlementConfigured,
  settlementAddAccount,
  settlementDeleteAccount,
  settlementListAccounts,
} from "@/lib/partners/sameday-settlement";

/**
 * Admin — Same Day settlement beneficiary accounts.
 *   GET    — list verified accounts
 *   POST   — add + penny-drop verify a new account (₹4 partner charge)
 *   DELETE — ?id=  deactivate an account
 */
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

const AddBody = z.object({
  accountNumber: z.string().min(6).max(20),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  accountHolderName: z.string().min(2).max(120),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().optional(),
  contactMobile: z.string().regex(/^\d{10}$/).optional(),
}).strict();

export async function GET() {
  try {
    await requireRole("MASTER_ADMIN", "ADMIN");
  } catch (e) {
    return toErrorResponse(e);
  }
  const notReady = guardConfigured();
  if (notReady) return notReady;

  const r = await settlementListAccounts();
  return r.ok
    ? NextResponse.json({ accounts: r.data })
    : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    await enforceRateLimit(`settlement:accounts:${admin.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return toErrorResponse(e);
  }
  const notReady = guardConfigured();
  if (notReady) return notReady;

  const parsed = AddBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const r = await settlementAddAccount(parsed.data);
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: r.ok ? "settlement.account_added" : "settlement.account_add_failed",
      entity: "SettlementAccount",
      entityId: r.ok ? r.data.account.id : parsed.data.accountNumber.slice(-4),
      meta: r.ok
        ? { verificationStatus: r.data.verificationStatus, verifiedName: r.data.verifiedName ?? null }
        : { code: r.code },
    },
  });
  return r.ok
    ? NextResponse.json(r.data)
    : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}

export async function DELETE(req: Request) {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN");
    await enforceRateLimit(`settlement:accounts:${admin.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e) {
    return toErrorResponse(e);
  }
  const notReady = guardConfigured();
  if (notReady) return notReady;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  const r = await settlementDeleteAccount(id);
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "settlement.account_deleted",
      entity: "SettlementAccount",
      entityId: id,
      meta: { ok: r.ok },
    },
  });
  return r.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: r.message, code: r.code }, { status: 502 });
}
