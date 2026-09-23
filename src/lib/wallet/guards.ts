/**
 * Money-safety guards shared by the payin settle layer (settleTopup /
 * settlePgCollect). Kept pure + dependency-free so the rules are unit-testable
 * in isolation — these decide whether real money moves, so they must be simple
 * and obviously correct.
 */

/** Tolerance when comparing rupee amounts: differences of ≤1 paisa are noise. */
export const AMOUNT_TOLERANCE_PAISE = 1;

/**
 * True when the provider-VERIFIED amount contradicts what we initiated and the
 * payin must therefore be HELD (never auto-credited).
 *
 * Rules:
 *  - If the provider did not report a verifiable amount (`undefined`/NaN), we
 *    cannot contradict it → NOT a mismatch (other money-safety rails still hold).
 *  - Otherwise compare in integer paise so binary-float noise can never flip a
 *    genuine match into a false HOLD; a mismatch is any difference > 1 paisa.
 */
export function isAmountMismatch(verified: number | undefined, initiated: number): boolean {
  if (typeof verified !== "number" || !Number.isFinite(verified)) return false;
  const diffPaise = Math.abs(Math.round(verified * 100) - Math.round(initiated * 100));
  return diffPaise > AMOUNT_TOLERANCE_PAISE;
}
