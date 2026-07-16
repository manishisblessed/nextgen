import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { flags } from "@/lib/env";
import { getBalances } from "@/lib/ledger";
import { toNumber } from "@/lib/money";
import { assertServiceEnabled, ServiceDisabledError } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";

/**
 * Thin health probe used by the payout UI to render the "Service Active"
 * pill. Combines three signals:
 *
 *   1. The global `flags.payout` env toggle (worker/partner integration).
 *   2. The admin On/Off Services kill-switch for this specific user.
 *   3. The user's spendable balance snapshot (so the pill can also show ₹).
 *
 * The route is intentionally read-only and cheap — the client polls it every
 * time it opens the payout page + on a manual refresh click.
 */

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ available: false, error: e.message }, { status: e.statusCode });
    throw e;
  }

  const partnerEnabled = flags.payout;

  let adminEnabled = true;
  let adminReason: string | null = null;
  try {
    await assertServiceEnabled(SERVICE_KEYS.PAYOUT, { name: "Payout", userId: user.id, role: user.role });
  } catch (e) {
    if (e instanceof ServiceDisabledError) {
      adminEnabled = false;
      adminReason = e.message;
    } else {
      throw e;
    }
  }

  const balances = await getBalances(user.id).catch(() => null);

  return NextResponse.json({
    available: partnerEnabled && adminEnabled,
    partnerEnabled,
    adminEnabled,
    reason: adminReason,
    balances: balances
      ? {
          walletBalance: toNumber(balances.walletBalance),
          heldBalance: toNumber(balances.heldBalance),
          spendable: toNumber(balances.spendable),
        }
      : null,
  });
}
