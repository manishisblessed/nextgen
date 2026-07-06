import crypto from "crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendOpsAlert } from "@/lib/monitoring/alerts";
import { istDateKey, istDayStartUtc } from "@/lib/aml/engine";

/**
 * Append-only audit anchoring (Phase 5 — compliance maturity).
 *
 * Two independent tamper defenses on AuditLog:
 *   1. Prevention — a DB trigger rejects UPDATE/DELETE on AuditLog and
 *      AuditAnchor (see migration 20260702070000).
 *   2. Detection — this module. A daily job hashes the day's audit rows in
 *      canonical order into a root hash and chains it onto the previous
 *      anchor (blockchain-style). Rewriting history — even by someone who
 *      dropped the trigger — breaks every subsequent chain hash, and
 *      `verifyAuditDay` exposes exactly which day no longer matches.
 */

type AuditRowForHash = {
  id: string;
  userId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  createdAt: Date;
};

/** Canonical digest of one audit row (stable field order, ISO timestamps). */
export function hashAuditRow(row: AuditRowForHash): string {
  const canonical = [
    row.id,
    row.userId ?? "",
    row.action,
    row.entity ?? "",
    row.entityId ?? "",
    row.createdAt.toISOString(),
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/** Root hash over an ordered stream of row digests. */
export function computeRootHash(rowHashes: string[]): string {
  const h = crypto.createHash("sha256");
  for (const rh of rowHashes) h.update(rh);
  return h.digest("hex");
}

export function chainHashOf(prevHash: string, rootHash: string): string {
  return crypto.createHash("sha256").update(prevHash + rootHash).digest("hex");
}

async function dayRows(dateKey: string): Promise<AuditRowForHash[]> {
  const start = istDayStartUtc(dateKey);
  const end = new Date(start.getTime() + 86_400_000);
  return prisma.auditLog.findMany({
    where: { createdAt: { gte: start, lt: end } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, userId: true, action: true, entity: true, entityId: true, createdAt: true },
  });
}

/**
 * Anchor one IST day (defaults to yesterday). Idempotent — an existing anchor
 * is left untouched (the table is append-only anyway).
 */
export async function anchorAuditDay(dateKey?: string): Promise<{ dateKey: string; anchored: boolean }> {
  const key = dateKey ?? istDateKey(new Date(Date.now() - 86_400_000));

  const existing = await prisma.auditAnchor.findUnique({ where: { dateKey: key } });
  if (existing) return { dateKey: key, anchored: false };

  const rows = await dayRows(key);
  const rootHash = computeRootHash(rows.map(hashAuditRow));

  const prev = await prisma.auditAnchor.findFirst({
    where: { dateKey: { lt: key } },
    orderBy: { dateKey: "desc" },
    select: { chainHash: true },
  });
  const prevHash = prev?.chainHash ?? "";

  await prisma.auditAnchor.create({
    data: {
      dateKey: key,
      rowCount: rows.length,
      firstRowId: rows[0]?.id ?? null,
      lastRowId: rows[rows.length - 1]?.id ?? null,
      rootHash,
      prevHash,
      chainHash: chainHashOf(prevHash, rootHash),
    },
  });

  logger.info({ action: "audit.anchored", dateKey: key, rowCount: rows.length });
  return { dateKey: key, anchored: true };
}

export type AnchorVerification = {
  dateKey: string;
  ok: boolean;
  reason?: string;
  rowCount?: { anchored: number; current: number };
};

/** Re-hash a day's rows and compare against its anchor. */
export async function verifyAuditDay(dateKey: string): Promise<AnchorVerification> {
  const anchor = await prisma.auditAnchor.findUnique({ where: { dateKey } });
  if (!anchor) return { dateKey, ok: false, reason: "NO_ANCHOR" };

  const rows = await dayRows(dateKey);
  if (rows.length !== anchor.rowCount) {
    return {
      dateKey,
      ok: false,
      reason: "ROW_COUNT_MISMATCH",
      rowCount: { anchored: anchor.rowCount, current: rows.length },
    };
  }

  const rootHash = computeRootHash(rows.map(hashAuditRow));
  if (rootHash !== anchor.rootHash) {
    return { dateKey, ok: false, reason: "ROOT_HASH_MISMATCH" };
  }
  if (chainHashOf(anchor.prevHash, rootHash) !== anchor.chainHash) {
    return { dateKey, ok: false, reason: "CHAIN_HASH_MISMATCH" };
  }
  return { dateKey, ok: true };
}

/**
 * Daily worker job: anchor yesterday, then spot-verify the previous anchor so
 * silent tampering is detected within a day. Alerts ops on any failure.
 */
export async function runAuditAnchorJob(): Promise<void> {
  const yesterday = istDateKey(new Date(Date.now() - 86_400_000));
  await anchorAuditDay(yesterday);

  const dayBefore = istDateKey(new Date(Date.now() - 2 * 86_400_000));
  const check = await verifyAuditDay(dayBefore);
  if (!check.ok && check.reason !== "NO_ANCHOR") {
    await sendOpsAlert({
      title: "AUDIT INTEGRITY FAILURE — anchor verification failed",
      severity: "critical",
      details: { dateKey: check.dateKey, reason: check.reason, ...check.rowCount },
    });
  }
}
