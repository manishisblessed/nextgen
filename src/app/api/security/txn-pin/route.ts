import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";
import { toErrorResponse } from "@/lib/security/apiErrors";
import { setTxnPin } from "@/lib/security/txnPin";

/**
 * Transaction PIN management.
 *   GET  → { isSet, lockedUntil } — drives the client's PIN gate / setup nudge.
 *   POST → set (first time, needs account password) or change (needs current
 *          PIN). The PIN itself is never returned or logged.
 */

const Body = z
  .object({
    newPin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits"),
    currentPin: z.string().optional(),
    password: z.string().optional(),
  })
  .strict();

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { txnPinHash: true, txnPinSetAt: true, txnPinLockedUntil: true },
    });
    const locked = row?.txnPinLockedUntil && row.txnPinLockedUntil > new Date();
    return NextResponse.json({
      isSet: Boolean(row?.txnPinHash),
      setAt: row?.txnPinSetAt?.toISOString() ?? null,
      lockedUntil: locked ? row!.txnPinLockedUntil!.toISOString() : null,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    await enforceRateLimit(`txnpin:set:${user.id}`, RATE_LIMITS.twoFactor);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    await setTxnPin(user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
