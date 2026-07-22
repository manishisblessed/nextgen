import { describe, expect, it, vi } from "vitest";

// The rental module imports the Prisma client and ledger at load time. The
// billing-cycle helpers under test are pure (no DB), so stub the DB module to
// avoid instantiating a real client.
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { posRentalBillingWindow, posRentalCurrentCycle } from "@/lib/pos/rental";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** UTC instant of IST-midnight on (year, 0-indexed month, day). */
function istMidnight(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m, day) - IST_OFFSET_MS);
}

/**
 * The rent-waiver window math is what decides whether a machine's monthly rent
 * is charged. A wrong boundary would waive (or charge) the wrong month, so
 * these lock the cycle boundaries in IST across the tricky cases.
 */
describe("posRentalBillingWindow — cycle just completed at billing time", () => {
  it("bills on the 1st → measures the previous calendar month", () => {
    // Jul 10 2026, 11:30 IST (billing already ran on Jul 1 for this period).
    const now = new Date("2026-07-10T06:00:00Z");
    const { windowStart, windowEnd } = posRentalBillingWindow(1, now);
    expect(windowStart.toISOString()).toBe(istMidnight(2026, 5, 1).toISOString()); // Jun 1 IST
    expect(windowEnd.toISOString()).toBe(istMidnight(2026, 6, 1).toISOString()); // Jul 1 IST
  });

  it("uses the most recent anchor when today is before the billing day", () => {
    // billingDay 15, today Jul 10 → last billing was Jun 15.
    const now = new Date("2026-07-10T06:00:00Z");
    const { windowStart, windowEnd } = posRentalBillingWindow(15, now);
    expect(windowStart.toISOString()).toBe(istMidnight(2026, 4, 15).toISOString()); // May 15
    expect(windowEnd.toISOString()).toBe(istMidnight(2026, 5, 15).toISOString()); // Jun 15
  });

  it("uses this month's anchor once the billing day has passed", () => {
    // billingDay 15, today Jul 20 → billing ran Jul 15, measures Jun 15 → Jul 15.
    const now = new Date("2026-07-20T06:00:00Z");
    const { windowStart, windowEnd } = posRentalBillingWindow(15, now);
    expect(windowStart.toISOString()).toBe(istMidnight(2026, 5, 15).toISOString()); // Jun 15
    expect(windowEnd.toISOString()).toBe(istMidnight(2026, 6, 15).toISOString()); // Jul 15
  });

  it("crosses the year boundary in January", () => {
    const now = new Date("2026-01-10T06:00:00Z");
    const { windowStart, windowEnd } = posRentalBillingWindow(1, now);
    expect(windowStart.toISOString()).toBe(istMidnight(2025, 11, 1).toISOString()); // Dec 1 2025
    expect(windowEnd.toISOString()).toBe(istMidnight(2026, 0, 1).toISOString()); // Jan 1 2026
  });

  it("clamps the window start to a subscription created mid-cycle", () => {
    const now = new Date("2026-07-10T06:00:00Z");
    const startedAt = new Date("2026-06-20T00:00:00Z"); // after the Jun 1 cycle start
    const { windowStart } = posRentalBillingWindow(1, now, startedAt);
    expect(windowStart.toISOString()).toBe(startedAt.toISOString());
  });
});

describe("posRentalCurrentCycle — in-progress cycle for the dashboard", () => {
  it("counts toward the upcoming billing day mid-cycle", () => {
    // billingDay 15, today Jul 10 → current cycle Jun 15 → Jul 15.
    const now = new Date("2026-07-10T06:00:00Z");
    const { cycleStart, nextBilling } = posRentalCurrentCycle(15, now);
    expect(cycleStart.toISOString()).toBe(istMidnight(2026, 5, 15).toISOString()); // Jun 15
    expect(nextBilling.toISOString()).toBe(istMidnight(2026, 6, 15).toISOString()); // Jul 15
  });

  it("rolls to the next cycle once the billing day has passed", () => {
    const now = new Date("2026-07-20T06:00:00Z");
    const { cycleStart, nextBilling } = posRentalCurrentCycle(15, now);
    expect(cycleStart.toISOString()).toBe(istMidnight(2026, 6, 15).toISOString()); // Jul 15
    expect(nextBilling.toISOString()).toBe(istMidnight(2026, 7, 15).toISOString()); // Aug 15
  });

  it("is consistent with the billing window evaluated at the next billing run", () => {
    // What the retailer sees accruing now must be exactly the window the billing
    // job measures when it next runs (at nextBilling).
    const now = new Date("2026-07-10T06:00:00Z");
    const { cycleStart, nextBilling } = posRentalCurrentCycle(15, now);
    // At the next billing run (a moment after nextBilling), the completed-cycle
    // window must match [cycleStart, nextBilling].
    const atBilling = new Date(nextBilling.getTime() + 60 * 60 * 1000);
    const { windowStart, windowEnd } = posRentalBillingWindow(15, atBilling);
    expect(windowStart.toISOString()).toBe(cycleStart.toISOString());
    expect(windowEnd.toISOString()).toBe(nextBilling.toISOString());
  });
});
