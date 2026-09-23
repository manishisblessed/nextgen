/**
 * Server-side helper to recover a bank / credit-card issuer *display name* from a
 * stored Transaction — for logo resolution on the transactions feed and wallet
 * ledger.
 *
 * Why this exists: BBPS credit-card / bill transactions (CC-1) store the card's
 * last-4 in `Transaction.operator` (e.g. "4004"), while the real issuer name
 * ("ICICI CREDIT CARD", "SBI CARD") lives inside the `Transaction.request` JSON
 * bag. This mirrors how the Bill-Payment / Credit-Card reports resolve the bank,
 * so every surface shows the same logo.
 */
import type { Prisma } from "@prisma/client";

/**
 * Flatten a `Transaction.request` JSON blob (including nested `customerParams`)
 * into a lower-cased string bag for tolerant field lookups.
 */
export function requestBag(
  request: Prisma.JsonValue | null | undefined
): Record<string, string> {
  if (!request || typeof request !== "object" || Array.isArray(request)) return {};
  const base = request as Record<string, unknown>;
  const params =
    base.customerParams &&
    typeof base.customerParams === "object" &&
    !Array.isArray(base.customerParams)
      ? (base.customerParams as Record<string, unknown>)
      : {};
  const bag: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...params, ...base })) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number") bag[k.toLowerCase()] = String(v);
  }
  return bag;
}

/**
 * Best bank / issuer display name for logo resolution, in priority order:
 *   1. request bag (bankName / biller / billerName)
 *   2. biller-code → name (pass a map resolved from the biller table)
 *   3. the raw operator value
 * Returns `null` when nothing usable is found.
 */
export function resolveTxnBankName(
  operator: string | null | undefined,
  request: Prisma.JsonValue | null | undefined,
  billerName?: Map<string, string>
): string | null {
  const bag = requestBag(request);
  for (const k of ["bankname", "biller", "billername"]) {
    const v = bag[k];
    if (v && v.trim()) return v.trim();
  }
  if (operator && billerName?.get(operator)) return billerName.get(operator)!.trim();
  return operator?.trim() || null;
}
