import type { Prisma } from "@prisma/client";
import type { IncentiveRail } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dec, add, type Money } from "@/lib/money";

/**
 * Monthly volume measurement for the incentive / reverse-cashback engine, SPLIT
 * by settlement leg (INSTANT / T1).
 *
 * All rails are measured by their SETTLEMENT record filtered to `status =
 * SETTLED` and dated by `settledAt` within the IST month. This is deliberate:
 *   - it is the money that actually moved, so the MDR the user paid is a real,
 *     stored figure (the base for CASHBACK_ON_MDR);
 *   - every settled record is counted exactly once, in the month it settled —
 *     no gaps, no double counting — so a month-end run (or re-run) is fully
 *     deterministic and idempotent.
 * The leg discriminator per rail:
 *   - QR  → QrClaim.settlementKind (INSTANT | T1)
 *   - POS → PosSettlementEntry.mode ("INSTANT" | "T1")
 *   - PG  → PgSettlementEntry.mode ("INSTANT" | "T1")
 */

export type RailVolume = {
  /** Gross transacted volume (₹) settled in the window. */
  volume: Money;
  /** Total MDR the user paid (₹) on that volume — the CASHBACK_ON_MDR base. */
  mdrPaid: Money;
  /** Number of settled records. */
  count: number;
};

/** A rail's monthly volume split by settlement leg. */
export type SplitVolume = {
  instant: RailVolume;
  t1: RailVolume;
  total: RailVolume;
};

const zero = (): RailVolume => ({ volume: dec(0), mdrPaid: dec(0), count: 0 });

/** Sum two rail-volume rollups. */
function addVolume(a: RailVolume, b: RailVolume): RailVolume {
  return {
    volume: add(a.volume, b.volume),
    mdrPaid: add(a.mdrPaid, b.mdrPaid),
    count: a.count + b.count,
  };
}

/** Sum two split rollups leg-by-leg (used for COMBINED). */
function addSplit(a: SplitVolume, b: SplitVolume): SplitVolume {
  return {
    instant: addVolume(a.instant, b.instant),
    t1: addVolume(a.t1, b.t1),
    total: addVolume(a.total, b.total),
  };
}

function toSplit(instant: RailVolume, t1: RailVolume): SplitVolume {
  return { instant, t1, total: addVolume(instant, t1) };
}

/** QR monthly volume + MDR paid (settled claims), split by settlementKind. */
export async function measureQrVolume(
  userId: string,
  start: Date,
  end: Date,
  tx?: Prisma.TransactionClient
): Promise<SplitVolume> {
  const db = tx ?? prisma;
  const rows = await db.qrClaim.groupBy({
    by: ["settlementKind"],
    where: { userId, status: "SETTLED", settledAt: { gte: start, lt: end } },
    _sum: { amount: true, mdrAmount: true },
    _count: true,
  });
  let instant = zero();
  let t1 = zero();
  for (const r of rows) {
    const leg: RailVolume = {
      volume: dec(r._sum.amount ?? 0),
      mdrPaid: dec(r._sum.mdrAmount ?? 0),
      count: r._count,
    };
    if (r.settlementKind === "INSTANT") instant = leg;
    else t1 = leg;
  }
  return toSplit(instant, t1);
}

/** POS monthly volume + MDR paid (settled acquirer entries), split by mode. */
export async function measurePosVolume(
  userId: string,
  start: Date,
  end: Date,
  tx?: Prisma.TransactionClient
): Promise<SplitVolume> {
  const db = tx ?? prisma;
  const rows = await db.posSettlementEntry.groupBy({
    by: ["mode"],
    where: { userId, status: "SETTLED", settledAt: { gte: start, lt: end } },
    _sum: { grossAmount: true, mdrAmount: true },
    _count: true,
  });
  let instant = zero();
  let t1 = zero();
  for (const r of rows) {
    const leg: RailVolume = {
      volume: dec(r._sum.grossAmount ?? 0),
      mdrPaid: dec(r._sum.mdrAmount ?? 0),
      count: r._count,
    };
    if (r.mode === "INSTANT") instant = leg;
    else t1 = leg;
  }
  return toSplit(instant, t1);
}

/** PG monthly volume + MDR paid (settled acquirer entries), split by mode. */
export async function measurePgVolume(
  userId: string,
  start: Date,
  end: Date,
  tx?: Prisma.TransactionClient
): Promise<SplitVolume> {
  const db = tx ?? prisma;
  const rows = await db.pgSettlementEntry.groupBy({
    by: ["mode"],
    where: { userId, status: "SETTLED", settledAt: { gte: start, lt: end } },
    _sum: { grossAmount: true, mdrAmount: true },
    _count: true,
  });
  let instant = zero();
  let t1 = zero();
  for (const r of rows) {
    const leg: RailVolume = {
      volume: dec(r._sum.grossAmount ?? 0),
      mdrPaid: dec(r._sum.mdrAmount ?? 0),
      count: r._count,
    };
    if (r.mode === "INSTANT") instant = leg;
    else t1 = leg;
  }
  return toSplit(instant, t1);
}

/**
 * Measure a user's monthly volume for a given rail, split by settlement leg.
 * COMBINED sums QR + POS + PG leg-by-leg.
 */
export async function measureRailVolume(
  userId: string,
  rail: IncentiveRail,
  start: Date,
  end: Date,
  tx?: Prisma.TransactionClient
): Promise<SplitVolume> {
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
      return addSplit(addSplit(qr, pos), pg);
    }
    default:
      return toSplit(zero(), zero());
  }
}
