import type { MdrServiceKind, RateType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dec, gte, lte, mul, round, type Money } from "@/lib/money";

/**
 * Company MDR floor engine — enforces platform-wide minimum MDR rates for
 * acquiring rails (POS / PG / QR). No scheme MDR slab, brand rate, or derived
 * scheme may set an MDR below the company floor for a matching
 * (serviceKind, paymentMode, amount band).
 *
 * Floor matching uses the same wildcard convention as MDR slabs: a floor row
 * with paymentMode "*" applies to all modes; an exact-match floor beats a
 * wildcard when both cover the amount band.
 */

export type FloorCheckInput = {
  serviceKind: MdrServiceKind;
  paymentMode: string;
  mdrType: RateType;
  mdrValue: number;
  mdrValueT0?: number;
  /** Representative amount to compare FLAT vs PERCENT across rate types. */
  amount?: number;
};

export type FloorViolation = {
  field: "mdrValue" | "mdrValueT0";
  actual: string;
  floor: string;
  floorId: string;
  serviceKind: string;
  paymentMode: string;
  message: string;
};

const norm = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();
const isWildcard = (v: string) => v === "" || v === "*";

/**
 * Resolve the effective absolute MDR amount for a given rate type and value,
 * evaluated at `amount`. For PERCENT rates the value is stored as a fraction
 * (0.0100 = 1%). For FLAT it's the absolute ₹ amount.
 */
function effectiveAbsolute(
  rateType: RateType,
  rateValue: number | Money,
  amount: number
): Money {
  if (rateType === "FLAT") return round(rateValue);
  return round(mul(amount, rateValue));
}

/**
 * Check a candidate MDR value against the company floor for a specific
 * serviceKind and paymentMode. Returns an array of violations (empty = OK).
 *
 * When the candidate and floor use the same RateType, values are compared
 * directly. When they differ (one FLAT, one PERCENT), both are evaluated at
 * the floor row's minAmount as a conservative comparison point.
 */
export async function checkMdrFloor(
  input: FloorCheckInput
): Promise<FloorViolation[]> {
  const floors = await prisma.companyMdrFloor.findMany({
    where: { serviceKind: input.serviceKind, active: true },
    orderBy: { minAmount: "asc" },
  });
  if (floors.length === 0) return [];

  const violations: FloorViolation[] = [];
  const candidateMode = norm(input.paymentMode);

  for (const floor of floors) {
    const floorMode = norm(floor.paymentMode);

    // Skip if the floor is pinned to a different payment mode.
    if (!isWildcard(floorMode) && !isWildcard(candidateMode) && floorMode !== candidateMode) {
      continue;
    }

    const refAmount = input.amount ?? Number(floor.minAmount);

    // --- T+1 check ---
    const candidateAbs = effectiveAbsolute(input.mdrType, input.mdrValue, refAmount);
    const floorAbs = effectiveAbsolute(floor.mdrType, Number(floor.mdrValue), refAmount);

    if (!gte(candidateAbs, floorAbs)) {
      const fmtCandidate = input.mdrType === "PERCENT"
        ? `${(input.mdrValue * 100).toFixed(2)}%`
        : `₹${round(input.mdrValue)}`;
      const fmtFloor = floor.mdrType === "PERCENT"
        ? `${(Number(floor.mdrValue) * 100).toFixed(2)}%`
        : `₹${round(floor.mdrValue)}`;
      violations.push({
        field: "mdrValue",
        actual: fmtCandidate,
        floor: fmtFloor,
        floorId: floor.id,
        serviceKind: input.serviceKind,
        paymentMode: isWildcard(floorMode) ? "*" : floorMode,
        message: `MDR ${fmtCandidate} is below the company minimum of ${fmtFloor} for ${input.serviceKind}${isWildcard(floorMode) ? "" : `/${floorMode}`}`,
      });
    }

    // --- T+0 check (only when both candidate and floor have a T+0 value) ---
    const candidateT0 = input.mdrValueT0 ?? 0;
    const floorT0 = Number(floor.mdrValueT0);
    if (candidateT0 > 0 && floorT0 > 0) {
      const candidateT0Abs = effectiveAbsolute(input.mdrType, candidateT0, refAmount);
      const floorT0Abs = effectiveAbsolute(floor.mdrType, floorT0, refAmount);

      if (!gte(candidateT0Abs, floorT0Abs)) {
        const fmtCandidate = input.mdrType === "PERCENT"
          ? `${(candidateT0 * 100).toFixed(2)}%`
          : `₹${round(candidateT0)}`;
        const fmtFloor = floor.mdrType === "PERCENT"
          ? `${(floorT0 * 100).toFixed(2)}%`
          : `₹${round(floorT0)}`;
        violations.push({
          field: "mdrValueT0",
          actual: fmtCandidate,
          floor: fmtFloor,
          floorId: floor.id,
          serviceKind: input.serviceKind,
          paymentMode: isWildcard(floorMode) ? "*" : floorMode,
          message: `T+0 MDR ${fmtCandidate} is below the company minimum of ${fmtFloor} for ${input.serviceKind}${isWildcard(floorMode) ? "" : `/${floorMode}`}`,
        });
      }
    }
  }

  return violations;
}

/**
 * Convenience wrapper that returns a single error string (first violation)
 * or null when the candidate passes all floors.
 */
export async function validateMdrAgainstFloor(
  input: FloorCheckInput
): Promise<string | null> {
  const violations = await checkMdrFloor(input);
  return violations.length > 0 ? violations[0].message : null;
}

/**
 * Runtime check: given a resolved absolute MDR amount (₹) for a specific
 * serviceKind, verify it meets the company floor. Used by the settlement
 * engine as a final safety net.
 */
export async function isAboveMdrFloor(
  serviceKind: MdrServiceKind,
  paymentMode: string,
  absoluteMdr: Money | number,
  grossAmount: Money | number,
  settlementType: "T0" | "T1" = "T1"
): Promise<boolean> {
  const floors = await prisma.companyMdrFloor.findMany({
    where: { serviceKind, active: true },
    orderBy: { minAmount: "asc" },
  });
  if (floors.length === 0) return true;

  const amt = dec(grossAmount);
  const mdr = dec(absoluteMdr);
  const mode = norm(paymentMode);

  for (const floor of floors) {
    const floorMode = norm(floor.paymentMode);
    if (!isWildcard(floorMode) && !isWildcard(mode) && floorMode !== mode) continue;
    if (!gte(amt, floor.minAmount) || !lte(amt, floor.maxAmount)) continue;

    const floorRateValue = settlementType === "T0" && Number(floor.mdrValueT0) > 0
      ? Number(floor.mdrValueT0)
      : Number(floor.mdrValue);
    const floorAbs = effectiveAbsolute(floor.mdrType, floorRateValue, Number(amt));
    if (!gte(mdr, floorAbs)) return false;
  }

  return true;
}
