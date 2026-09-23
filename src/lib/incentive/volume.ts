import type { Prisma } from "@prisma/client";
import type { IncentiveRail } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dec, add, type Money } from "@/lib/money";

/**
 * Monthly volume measurement for the incentive / reverse-cashback engine.
 *
 * All rails are measured by their SETTLEMENT record filtered to `status =
 * SETTLED` and dated by `settledAt` within the IST month. This is deliberate:
 *   - it is the money that actually moved, so the MDR the user paid is a real,
 *     stored figure (the base for CASHBACK_ON_MDR);
 *   - every settled record is counted exactly once, in the month it settled —
 *     no gaps, no double counting — so a month-end run (or re-run) is fully
 *     deterministic and idempotent.
 * QR uses `QrClaim` (amount / mdrAmount), POS/PG use their settlement entries
 * (grossAmount / mdrAmount).
 */

export type RailVolume = {
  /** Gross transacted volume (₹) settled in the window. */
  volume: Money;
  /** Total MDR the user paid (₹) on that volume — the CASHBACK_ON_MDR base. */
  mdrPaid: Money;
  /** Number of settled records. */
  count: number;
};

const ZERO: () => RailVolume = () => ({ volume: dec(0), mdrPaid: dec(0), count: 0 });

/** QR monthly volume + MDR paid (settled claims). */
export async function measureQrVolume(
  userId: string,
  start: Date,
  end: Date,
  tx?: Prisma.TransactionClient
): Promise<RailVolume> {
  const db = tx ?? prisma;
  const agg = await db.qrClaim.aggregate({
    where: { userId, status: "SETTLED", settledAt: { gte: start, lt: end } },
    _sum: { amount: true, mdrAmount: true },
    _count: true,
  });
  return {
    volume: dec(agg._sum.amount ?? 0),
    mdrPaid: dec(agg._sum.mdrAmount ?? 0),
    count: agg._count,
  };
}

/** POS monthly volume + MDR paid (settled acquirer entries). */
export async function measurePosVolume(
  userId: string,
  start: Date,
  end: Date,
  tx?: Prisma.TransactionClient
): Promise<RailVolume> {
  const db = tx ?? prisma;
  const agg = await db.posSettlementEntry.aggregate({
    where: { userId, status: "SETTLED", settledAt: { gte: start, lt: end } },
    _sum: { grossAmount: true, mdrAmount: true },
    _count: true,
  });
  return {
    volume: dec(agg._sum.grossAmount ?? 0),
    mdrPaid: dec(agg._sum.mdrAmount ?? 0),
    count: agg._count,
  };
}

/** PG monthly volume + MDR paid (settled acquirer entries). */
export async function measurePgVolume(
  userId: string,
  start: Date,
  end: Date,
  tx?: Prisma.TransactionClient
): Promise<RailVolume> {
  const db = tx ?? prisma;
  const agg = await db.pgSettlementEntry.aggregate({
    where: { userId, status: "SETTLED", settledAt: { gte: start, lt: end } },
    _sum: { grossAmount: true, mdrAmount: true },
    _count: true,
  });
  return {
    volume: dec(agg._sum.grossAmount ?? 0),
    mdrPaid: dec(agg._sum.mdrAmount ?? 0),
    count: agg._count,
  };
}

/** Sum two rail-volume rollups. */
function addVolume(a: RailVolume, b: RailVolume): RailVolume {
  return {
    volume: add(a.volume, b.volume),
    mdrPaid: add(a.mdrPaid, b.mdrPaid),
    count: a.count + b.count,
  };
}

/**
 * Measure a user's monthly volume for a given rail. COMBINED sums QR + POS + PG.
 */
export async function measureRailVolume(
  userId: string,
  rail: IncentiveRail,
  start: Date,
  end: Date,
  tx?: Prisma.TransactionClient
): Promise<RailVolume> {
  switch (rail) {
    case "QR":
      return measureQrVolume(userId, start, end, tx);
    case "POS":
      return measurePosVolume(userId, start, end, tx);
    case "PG":
      return measurePgVolume(userId, start, end, tx);
    case "COMBINED": {
      const [qr, pos, pg] = await Promise.all([
        measureQrVolume(userId, start, end, tx),
        measurePosVolume(userId, start, end, tx),
        measurePgVolume(userId, start, end, tx),
      ]);
      return addVolume(addVolume(qr, pos), pg);
    }
    default:
      return ZERO();
  }
}
