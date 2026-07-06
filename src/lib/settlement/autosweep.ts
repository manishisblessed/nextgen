import { prisma } from "@/lib/db";
import { env, flags } from "@/lib/env";
import { sendOpsAlert } from "@/lib/monitoring/alerts";
import {
  samedaySettlementConfigured,
  settlementBalance,
  settlementListAccounts,
  settlementTransfer,
} from "@/lib/partners/sameday-settlement";

/**
 * Settlement automation (Phase 3): a daily worker job that sweeps the Same Day
 * partner-wallet balance down to a configured float, into a verified bank
 * account — so money doesn't sit idle at the partner and no one has to log in
 * every evening to move it manually.
 *
 * Safety properties:
 *  - pure decision function (computeSweepAmount) — unit-testable;
 *  - one sweep per calendar day, enforced with an IdempotencyKey row —
 *    retries/redeliveries of the job can never double-transfer;
 *  - the target account must exist AND be penny-drop verified at the provider;
 *  - every action (and every skip reason) is audited and alerted.
 */

export type SweepDecision =
  | { sweep: false; reason: string }
  | { sweep: true; amount: number };

/** How much to sweep given the live balance and configured float/minimum. */
export function computeSweepAmount(input: {
  balance: number;
  keepBalance: number;
  minTransfer: number;
  isFrozen: boolean;
}): SweepDecision {
  if (input.isFrozen) return { sweep: false, reason: "partner wallet is frozen" };
  const surplus = Math.floor(input.balance - input.keepBalance);
  if (surplus <= 0) return { sweep: false, reason: "balance at or below the configured float" };
  if (surplus < input.minTransfer) {
    return { sweep: false, reason: `surplus ₹${surplus} below minimum transfer ₹${input.minTransfer}` };
  }
  return { sweep: true, amount: surplus };
}

/** IST calendar date (YYYY-MM-DD) — the idempotency scope for daily sweeps. */
export function istDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

export async function runSettlementAutosweep(now: Date = new Date()): Promise<{
  swept: boolean;
  amount?: number;
  reason?: string;
}> {
  if (!flags.settlementAutosweep) return { swept: false, reason: "autosweep disabled" };
  if (!flags.settlement || !samedaySettlementConfigured()) {
    return { swept: false, reason: "settlement rail not configured" };
  }
  const accountId = env.SETTLEMENT_AUTOSWEEP_ACCOUNT_ID;
  if (!accountId) {
    await sendOpsAlert({
      title: "Settlement autosweep misconfigured",
      severity: "warning",
      details: { problem: "SETTLEMENT_AUTOSWEEP_ACCOUNT_ID is not set" },
    });
    return { swept: false, reason: "no target account configured" };
  }

  // One sweep per IST day — claim the day's key before touching money.
  const dayKey = `settlement:autosweep:${istDateKey(now)}`;
  try {
    await prisma.idempotencyKey.create({
      data: {
        key: dayKey,
        scope: "settlement.autosweep",
        // 48h retention is enough — the key only guards the same calendar day.
        expiresAt: new Date(now.getTime() + 48 * 3600_000),
      },
    });
  } catch {
    return { swept: false, reason: "already swept today" };
  }

  const bal = await settlementBalance();
  if (!bal.ok) {
    await sendOpsAlert({
      title: "Settlement autosweep: balance check failed",
      severity: "warning",
      details: { code: bal.code, message: bal.message },
    });
    return { swept: false, reason: "balance check failed" };
  }

  const decision = computeSweepAmount({
    balance: bal.data.balance,
    keepBalance: Number(env.SETTLEMENT_AUTOSWEEP_KEEP_BALANCE),
    minTransfer: Number(env.SETTLEMENT_AUTOSWEEP_MIN_TRANSFER),
    isFrozen: bal.data.isFrozen,
  });
  if (!decision.sweep) return { swept: false, reason: decision.reason };

  // The target must be a live, verified beneficiary at the provider.
  const accounts = await settlementListAccounts();
  const target = accounts.ok ? accounts.data.find((a) => a.id === accountId) : undefined;
  if (!target || !target.isVerified) {
    await sendOpsAlert({
      title: "Settlement autosweep: target account unavailable",
      severity: "critical",
      details: { accountId, found: Boolean(target), verified: target?.isVerified ?? false },
    });
    return { swept: false, reason: "target account missing or unverified" };
  }

  const r = await settlementTransfer({
    accountId,
    amount: decision.amount,
    mode: env.SETTLEMENT_AUTOSWEEP_MODE,
    narration: `Auto-sweep ${istDateKey(now)}`,
  });

  await prisma.auditLog.create({
    data: {
      action: r.ok ? "settlement.autosweep_executed" : "settlement.autosweep_failed",
      entity: "SettlementTransfer",
      entityId: r.ok ? r.data.referenceId : dayKey,
      meta: r.ok
        ? { amount: decision.amount, mode: env.SETTLEMENT_AUTOSWEEP_MODE, status: r.data.status, utr: r.data.utr ?? null }
        : { amount: decision.amount, code: r.code, message: r.message },
    },
  });

  if (!r.ok) {
    await sendOpsAlert({
      title: "Settlement autosweep transfer failed",
      severity: "critical",
      details: { amount: decision.amount, code: r.code, message: r.message },
    });
    return { swept: false, reason: `transfer failed: ${r.message}` };
  }

  await sendOpsAlert({
    title: "Settlement autosweep executed",
    severity: "info",
    details: {
      amount: decision.amount,
      mode: env.SETTLEMENT_AUTOSWEEP_MODE,
      account: `${target.accountHolderName} (…${target.accountNumber.slice(-4)})`,
      status: r.data.status,
      utr: r.data.utr ?? "pending",
    },
  });

  return { swept: true, amount: decision.amount };
}
