import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { getPartner } from "@/lib/partners";
import { flags } from "@/lib/env";
import { SERVICE_KEYS } from "@/lib/services/catalog";
import { isAdminRole } from "@/lib/security/ownership";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/security/rateLimit";
import { dec, toNumber } from "@/lib/money";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

/**
 * On-demand live BulkPe wallet balance refresh for the admin dashboard.
 * Persists the value back onto the payout ServiceRoute so the cached
 * "Vendor Balances" card stays in sync.
 */
export async function GET() {
  let admin;
  try {
    admin = await requireRole("MASTER_ADMIN", "ADMIN", "SUPPORT");
    await enforceRateLimit(`bulkpe:balance:${admin.id}`, RATE_LIMITS.sensitiveWrite);
  } catch (e: unknown) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    if (e instanceof RateLimitError)
      return NextResponse.json(
        { error: e.message, retryAfterSec: e.result.retryAfterSec },
        { status: 429 }
      );
    throw e;
  }

  if (!isAdminRole(admin.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!flags.payout) {
    return NextResponse.json(
      { error: "Payout service is currently disabled" },
      { status: 503 }
    );
  }

  const provider = getPartner("payout");
  if (typeof provider.fetchBalance !== "function") {
    return NextResponse.json(
      { error: "Active payout provider does not expose a balance" },
      { status: 501 }
    );
  }

  const result = await provider.fetchBalance();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: 502 }
    );
  }

  const balance = dec(result.data);
  const route = await prisma.serviceRoute.update({
    where: { key: SERVICE_KEYS.PAYOUT },
    data: { balance },
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "service.balance.refresh",
      entity: "ServiceRoute",
      entityId: route.id,
      meta: { key: route.key, balance: toNumber(balance) },
    },
  });

  return NextResponse.json({
    ok: true,
    key: route.key,
    name: route.name,
    provider: route.provider,
    balance: toNumber(balance),
    refreshedAt: new Date().toISOString(),
  });
}
