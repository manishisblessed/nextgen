import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { assertServiceEnabled, ServiceDisabledError } from "@/lib/services/guard";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { prisma } from "@/lib/db";
import { flags } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { toNumber, gte } from "@/lib/money";
import { posRentalCurrentCycle, machineBusinessInWindow, computeRentalAmounts } from "@/lib/pos/rental";

export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

/**
 * GET /api/pos/rental-target
 *
 * Retailer-facing view of the "free rent on business target" progress. For
 * each of the caller's active machine subscriptions it returns how much POS
 * business the machine has done in the current billing cycle, the target, the
 * remaining amount, and whether the target is already achieved (rent waived).
 *
 * Restricted to RETAILERs — the target is a retailer incentive. Other roles
 * receive an empty list.
 */
export async function GET() {
  let user;
  try {
    user = await requireAuth();
    await assertServiceEnabled(SERVICE_KEYS.POS, { name: "POS Terminals", userId: user.id, role: user.role });
  } catch (e) {
    if (e instanceof AuthError || e instanceof ServiceDisabledError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    throw e;
  }

  if (!flags.pos)
    return NextResponse.json({ error: "POS service is not enabled" }, { status: 503 });

  const waiver = await getSetting("pos.rental_waiver");
  const target = waiver.thresholdPerMachine;

  // Only retailers see the incentive.
  if (user.role !== "RETAILER") {
    return NextResponse.json({ enabled: waiver.enabled, target, machines: [] });
  }

  const subs = await prisma.posSubscription.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: {
      plan: { select: { name: true, monthlyRent: true } },
      machine: { select: { id: true, serial: true, tid: true, model: true } },
    },
  });

  const now = new Date();
  const machines = await Promise.all(
    subs.map(async (s) => {
      const { cycleStart, nextBilling } = posRentalCurrentCycle(s.billingDay, now, s.startedAt);
      const business = await machineBusinessInWindow(s.machine.id, cycleStart, now);
      const businessNum = toNumber(business);
      const remaining = Math.max(0, Math.round((target - businessNum) * 100) / 100);
      const achieved = gte(business, target);
      const { total } = computeRentalAmounts(
        (s.monthlyRent ?? s.plan.monthlyRent).toString(),
        s.includeGst
      );
      return {
        subscriptionId: s.id,
        machine: s.machine,
        planName: s.plan.name,
        billingDay: s.billingDay,
        rent: toNumber(total),
        businessDone: businessNum,
        target,
        remaining,
        achieved,
        progress: target > 0 ? Math.min(1, businessNum / target) : 0,
        cycleStart: cycleStart.toISOString(),
        nextBilling: nextBilling.toISOString(),
      };
    })
  );

  return NextResponse.json({ enabled: waiver.enabled, target, machines });
}
