/**
 * Re-KYC date math, anchored to the server's operating timezone: Asia/Kolkata
 * (IST, a fixed UTC+5:30 with no DST). The monthly gate is "due on the 1st of
 * the month, IST", so we compute the UTC instant that corresponds to midnight
 * IST on the 1st. Keeping this in one place avoids off-by-a-day bugs from naive
 * `setDate(1)` on a server that may run in UTC.
 */

/** Asia/Kolkata is a fixed offset (no daylight saving) — safe to hardcode. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function istYearMonth(d: Date): { year: number; month: number } {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() };
}

/** UTC instant for 00:00 IST on the 1st of the current (IST) month. */
export function firstOfMonthIST(now: Date = new Date()): Date {
  const { year, month } = istYearMonth(now);
  return new Date(Date.UTC(year, month, 1, 0, 0, 0) - IST_OFFSET_MS);
}

/** UTC instant for 00:00 IST on the 1st of the NEXT (IST) month. */
export function firstOfNextMonthIST(now: Date = new Date()): Date {
  const { year, month } = istYearMonth(now);
  return new Date(Date.UTC(year, month + 1, 1, 0, 0, 0) - IST_OFFSET_MS);
}
