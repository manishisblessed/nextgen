import { prisma } from "@/lib/db";
import { add, dec, toNumber, type Money } from "@/lib/money";

/**
 * Ledger aggregation layer — read-only rollups over user wallet balances.
 * Powers the admin dashboard (Cumulative Wallet Balances, User-wise Balances)
 * and the Ledger Explorer. Liability view: these are user funds the platform
 * holds, summed from the denormalized balance columns which the ledger keeps
 * authoritative (verified nightly by the recon integrity audit).
 */

/** Network tiers shown in the admin money views (staff roles excluded). */
export const BALANCE_TIERS = [
  "RETAILER",
  "DISTRIBUTOR",
  "MASTER_DISTRIBUTOR",
  "SUPER_DISTRIBUTOR",
] as const;

export type BalanceTier = (typeof BALANCE_TIERS)[number];

export type TierBalance = {
  role: BalanceTier;
  users: number;
  primary: number;
  aeps: number;
  held: number;
  lien: number;
  total: number;
};

export type CumulativeBalances = {
  systemTotal: number;
  primaryTotal: number;
  aepsTotal: number;
  heldTotal: number;
  lienTotal: number;
  walletCount: number;
  tiers: TierBalance[];
  asOf: string;
};

/** Platform-wide liability rollup, broken down by network tier. */
export async function getCumulativeBalances(): Promise<CumulativeBalances> {
  const groups = await prisma.user.groupBy({
    by: ["role"],
    where: { role: { in: [...BALANCE_TIERS] }, deletedAt: null },
    _count: true,
    _sum: { walletBalance: true, aepsBalance: true, heldBalance: true, lienBalance: true },
  });

  const byRole = new Map(groups.map((g) => [g.role, g]));
  let primaryTotal: Money = dec(0);
  let aepsTotal: Money = dec(0);
  let heldTotal: Money = dec(0);
  let lienTotal: Money = dec(0);
  let walletCount = 0;

  const tiers: TierBalance[] = BALANCE_TIERS.map((role) => {
    const g = byRole.get(role);
    const primary = dec(g?._sum.walletBalance ?? 0);
    const aeps = dec(g?._sum.aepsBalance ?? 0);
    const held = dec(g?._sum.heldBalance ?? 0);
    const lien = dec(g?._sum.lienBalance ?? 0);
    primaryTotal = add(primaryTotal, primary);
    aepsTotal = add(aepsTotal, aeps);
    heldTotal = add(heldTotal, held);
    lienTotal = add(lienTotal, lien);
    walletCount += g?._count ?? 0;
    return {
      role,
      users: g?._count ?? 0,
      primary: toNumber(primary),
      aeps: toNumber(aeps),
      held: toNumber(held),
      lien: toNumber(lien),
      total: toNumber(add(primary, aeps)),
    };
  });

  return {
    systemTotal: toNumber(add(primaryTotal, aepsTotal)),
    primaryTotal: toNumber(primaryTotal),
    aepsTotal: toNumber(aepsTotal),
    heldTotal: toNumber(heldTotal),
    lienTotal: toNumber(lienTotal),
    walletCount,
    tiers,
    asOf: new Date().toISOString(),
  };
}

export type UserBalanceRow = {
  id: string;
  userCode: string | null;
  name: string;
  email: string;
  shopName: string | null;
  role: string;
  status: string;
  primary: number;
  aeps: number;
  held: number;
  lien: number;
  total: number;
};

export type UserWiseBalances = {
  rows: UserBalanceRow[];
  total: number;
  page: number;
  pageSize: number;
  sums: { primary: number; aeps: number; total: number };
};

/** Per-user balance listing with tier filter + search, sorted richest-first. */
export async function getUserWiseBalances(params: {
  role?: BalanceTier | "ALL";
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<UserWiseBalances> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, params.pageSize ?? 50));

  const where = {
    deletedAt: null,
    role:
      params.role && params.role !== "ALL"
        ? params.role
        : { in: [...BALANCE_TIERS] },
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" as const } },
            { email: { contains: params.q, mode: "insensitive" as const } },
            { shopName: { contains: params.q, mode: "insensitive" as const } },
            { phone: { contains: params.q } },
            { id: { contains: params.q } },
          ],
        }
      : {}),
  };

  const [users, total, sums] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        userCode: true,
        name: true,
        email: true,
        shopName: true,
        role: true,
        status: true,
        walletBalance: true,
        aepsBalance: true,
        heldBalance: true,
        lienBalance: true,
      },
      orderBy: { walletBalance: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
    prisma.user.aggregate({
      where,
      _sum: { walletBalance: true, aepsBalance: true },
    }),
  ]);

  const primarySum = dec(sums._sum.walletBalance ?? 0);
  const aepsSum = dec(sums._sum.aepsBalance ?? 0);

  return {
    rows: users.map((u) => ({
      id: u.id,
      userCode: u.userCode,
      name: u.name,
      email: u.email,
      shopName: u.shopName,
      role: u.role,
      status: u.status,
      primary: toNumber(dec(u.walletBalance)),
      aeps: toNumber(dec(u.aepsBalance)),
      held: toNumber(dec(u.heldBalance)),
      lien: toNumber(dec(u.lienBalance)),
      total: toNumber(add(u.walletBalance, u.aepsBalance)),
    })),
    total,
    page,
    pageSize,
    sums: {
      primary: toNumber(primarySum),
      aeps: toNumber(aepsSum),
      total: toNumber(add(primarySum, aepsSum)),
    },
  };
}

/** Period bounds for the dashboard's Today / Week / Month / Year filter. */
export function periodStart(period: "today" | "week" | "month" | "year", now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  switch (period) {
    case "today":
      return start;
    case "week": {
      // Monday-based week.
      const day = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - day);
      return start;
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
  }
}
