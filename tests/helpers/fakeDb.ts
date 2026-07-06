import { Prisma } from "@prisma/client";

/**
 * Minimal in-memory Prisma stand-in for unit-testing the money paths
 * (ledger.ts, services/transaction.ts) without a real Postgres. Implements
 * only the exact calls those modules make. Transactions are executed
 * inline (single-threaded test runner), which preserves the code paths but
 * not real row locking — concurrency is covered by the separate
 * scripts/test-ledger-concurrency.ts stress script against a live DB.
 */

type Row = Record<string, unknown>;

let seq = 0;
const nextId = () => `fake_${++seq}`;

function decOf(v: unknown): Prisma.Decimal {
  if (v instanceof Prisma.Decimal) return v;
  return new Prisma.Decimal(typeof v === "number" ? v.toString() : String(v ?? 0));
}

export class FakeDb {
  users = new Map<string, Row>();
  walletTxns: Row[] = [];
  transactions: Row[] = [];
  auditLogs: Row[] = [];
  staticQrs: Row[] = [];
  qrClaims: Row[] = [];

  addUser(
    id: string,
    walletBalance: number | string = 0,
    heldBalance: number | string = 0,
    status: string = "ACTIVE"
  ) {
    this.users.set(id, {
      id,
      status,
      walletBalance: decOf(walletBalance),
      heldBalance: decOf(heldBalance),
    });
  }

  setUserStatus(id: string, status: string) {
    const row = this.users.get(id);
    if (row) row.status = status;
  }

  balanceOf(id: string): string {
    return decOf(this.users.get(id)?.walletBalance).toFixed(2);
  }

  heldOf(id: string): string {
    return decOf(this.users.get(id)?.heldBalance).toFixed(2);
  }

  // ── prisma.user ───────────────────────────────────────────────────────────
  user = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = this.users.get(where.id);
      return row ? { ...row } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.users.get(where.id);
      if (!row) throw new Error(`FakeDb: user ${where.id} not found`);
      if (data.walletBalance !== undefined) row.walletBalance = decOf(data.walletBalance);
      if (data.heldBalance !== undefined) row.heldBalance = decOf(data.heldBalance);
      return { ...row };
    },
  };

  // ── prisma.walletTxn ──────────────────────────────────────────────────────
  walletTxn = {
    findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
      const row = this.walletTxns.find((t) => t.idempotencyKey === where.idempotencyKey);
      return row ? { ...row } : null;
    },
    create: async ({ data }: { data: Row }) => {
      const row = { id: nextId(), createdAt: new Date(), ...data };
      this.walletTxns.push(row);
      return { ...row };
    },
  };

  // ── prisma.transaction ────────────────────────────────────────────────────
  transaction = {
    create: async ({ data }: { data: Row }) => {
      const row = { id: nextId(), createdAt: new Date(), ...data };
      this.transactions.push(row);
      return { ...row };
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = this.transactions.find((t) => t.id === where.id);
      if (!row) throw new Error(`FakeDb: transaction ${where.id} not found`);
      Object.assign(row, data);
      return { ...row };
    },
    findUnique: async ({ where }: { where: { id?: string; refId?: string } }) => {
      const row = this.transactions.find((t) =>
        where.id !== undefined ? t.id === where.id : t.refId === where.refId
      );
      return row ? { ...row } : null;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; status?: { in: string[] } };
      data: Row;
    }) => {
      const rows = this.transactions.filter(
        (t) =>
          (where.id === undefined || t.id === where.id) &&
          (where.status === undefined || where.status.in.includes(t.status as string))
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    },
    aggregate: async () => ({ _sum: { amount: null, fee: null } }),
    count: async () => 0,
  };

  // ── prisma.payoutRequest (risk-engine reads only) ─────────────────────────
  payoutRequest = {
    aggregate: async () => ({ _sum: { totalDebit: null } }),
    count: async () => 0,
    findFirst: async () => null,
  };

  // ── prisma.webhookEndpoint (Phase 4) — no subscribers in unit tests, so
  //    emitWebhookEvent fan-out is a clean no-op instead of a logged error. ──
  webhookEndpoint = {
    findMany: async () => [] as Row[],
  };

  // ── prisma.staticQr (QR collections) ──────────────────────────────────────
  addStaticQr(id: string, opts?: { active?: boolean; disabledAt?: Date | null }) {
    this.staticQrs.push({
      id,
      label: `QR ${id}`,
      upiVpa: "merchant@upi",
      active: opts?.active ?? true,
      disabledAt: opts?.disabledAt ?? null,
      createdAt: new Date(),
    });
  }

  staticQr = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = this.staticQrs.find((q) => q.id === where.id);
      return row ? { ...row } : null;
    },
    findFirst: async ({ where }: { where?: { active?: boolean } } = {}) => {
      const row = this.staticQrs.find((q) => where?.active === undefined || q.active === where.active);
      return row ? { ...row } : null;
    },
  };

  // ── prisma.qrClaim (QR collections) — enforces the utr/screenshotHash
  //    unique indexes with a Prisma-style P2002 error. ───────────────────────
  qrClaim = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = this.qrClaims.find((c) => c.id === where.id);
      return row ? { ...row } : null;
    },
    findFirst: async ({ where }: { where: { utr?: string; screenshotHash?: string } }) => {
      const row = this.qrClaims.find(
        (c) =>
          (where.utr === undefined || c.utr === where.utr) &&
          (where.screenshotHash === undefined || c.screenshotHash === where.screenshotHash)
      );
      return row ? { ...row } : null;
    },
    create: async ({ data }: { data: Row }) => {
      if (this.qrClaims.some((c) => c.utr === data.utr || c.screenshotHash === data.screenshotHash)) {
        const err = new Error("Unique constraint failed") as Error & { code: string };
        err.code = "P2002";
        throw err;
      }
      const row = { id: nextId(), status: "PENDING", createdAt: new Date(), ...data };
      this.qrClaims.push(row);
      return { ...row };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; status?: string | { in: string[] } };
      data: Row;
    }) => {
      const statusOk = (s: unknown) =>
        where.status === undefined ||
        (typeof where.status === "string" ? s === where.status : where.status.in.includes(s as string));
      const rows = this.qrClaims.filter(
        (c) => (where.id === undefined || c.id === where.id) && statusOk(c.status)
      );
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    },
    count: async ({ where }: { where?: { userId?: string; createdAt?: { gte: Date } } } = {}) =>
      this.qrClaims.filter(
        (c) =>
          (where?.userId === undefined || c.userId === where.userId) &&
          (where?.createdAt === undefined || (c.createdAt as Date) >= where.createdAt.gte)
      ).length,
    aggregate: async ({
      where,
    }: {
      _sum?: unknown;
      _count?: unknown;
      where?: { userId?: string; createdAt?: { gte: Date }; status?: string; reconciledAt?: null };
    } = {}) => {
      const rows = this.qrClaims.filter(
        (c) =>
          (where?.userId === undefined || c.userId === where.userId) &&
          (where?.createdAt === undefined || (c.createdAt as Date) >= where.createdAt.gte) &&
          (where?.status === undefined || c.status === where.status) &&
          (where?.reconciledAt === undefined || (c.reconciledAt ?? null) === where.reconciledAt)
      );
      const sum = rows.reduce((acc, c) => acc.plus(decOf(c.amount)), new Prisma.Decimal(0));
      return { _sum: { amount: rows.length ? sum : null }, _count: rows.length };
    },
  };

  // ── prisma.auditLog ───────────────────────────────────────────────────────
  auditLog = {
    create: async ({ data }: { data: Row }) => {
      const row = { id: nextId(), createdAt: new Date(), ...data };
      this.auditLogs.push(row);
      return { ...row };
    },
  };

  // ── client-level ──────────────────────────────────────────────────────────
  $queryRaw = async () => [] as unknown[];

  $transaction = async <T>(fn: (tx: FakeDb) => Promise<T>): Promise<T> => {
    // Inline execution: adequate for single-threaded unit tests.
    return fn(this);
  };
}
