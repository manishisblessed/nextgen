/**
 * ServiceCode values usable in scheme slabs. Kept as a const tuple so it can
 * drive both a zod enum (API validation) and the admin UI service picker.
 * Must stay in sync with the Prisma `ServiceCode` enum.
 */
export const SERVICE_CODES = [
  "AEPS_BALANCE",
  "AEPS_WITHDRAW",
  "AEPS_MINI_STMT",
  "DMT_IMPS",
  "DMT_NEFT",
  "DMT_RTGS",
  "UPI_COLLECT",
  "UPI_PAYOUT",
  "WALLET_TOPUP",
  "WALLET_WITHDRAW",
  "RECHARGE_MOBILE",
  "RECHARGE_DTH",
  "RECHARGE_BROADBAND",
  "BILL_ELECTRICITY",
  "BILL_WATER",
  "BILL_GAS",
  "BILL_CREDIT_CARD",
  "BILL_EDUCATION",
  "BILL_INSURANCE",
  "TRAVEL_FLIGHT",
  "TRAVEL_HOTEL",
  "TRAVEL_BUS",
  "TRAVEL_TRAIN",
  "PAN_CARD",
  "INSURANCE",
] as const;

export type ServiceCodeValue = (typeof SERVICE_CODES)[number];

/** Human-friendly grouping label for a service code (for the UI). */
export function serviceGroup(code: string): string {
  if (code.startsWith("AEPS")) return "AePS";
  if (code.startsWith("DMT")) return "Money Transfer";
  if (code.startsWith("UPI")) return "UPI";
  if (code.startsWith("WALLET")) return "Wallet";
  if (code.startsWith("RECHARGE")) return "Recharge";
  if (code.startsWith("BILL")) return "Bill Payments";
  if (code.startsWith("TRAVEL")) return "Travel";
  return "Other";
}
