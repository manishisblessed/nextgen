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

/**
 * Icon-wise service families for the scheme-management UI (Same Day style):
 * each family gets an icon button on the scheme card that opens a slab modal
 * scoped to its services, plus an expandable slab-table section.
 * `routeKind` maps the family to ServiceRoute.kind for the provider dropdown.
 */
export const SERVICE_FAMILIES = [
  {
    key: "BBPS",
    label: "BBPS Bills",
    routeKind: "BBPS",
    services: [
      "BILL_ELECTRICITY",
      "BILL_WATER",
      "BILL_GAS",
      "BILL_CREDIT_CARD",
      "BILL_EDUCATION",
      "BILL_INSURANCE",
    ],
  },
  {
    key: "RECHARGE",
    label: "Recharge",
    routeKind: "RECHARGE",
    services: ["RECHARGE_MOBILE", "RECHARGE_DTH", "RECHARGE_BROADBAND"],
  },
  {
    key: "DMT",
    label: "Money Transfer / Settlement",
    routeKind: "DMT",
    services: ["DMT_IMPS", "DMT_NEFT", "DMT_RTGS"],
  },
  {
    key: "UPI",
    label: "UPI / Payout",
    routeKind: "PAYOUT",
    services: ["UPI_PAYOUT", "UPI_COLLECT"],
  },
  {
    key: "AEPS",
    label: "AePS",
    routeKind: "AEPS",
    services: ["AEPS_BALANCE", "AEPS_WITHDRAW", "AEPS_MINI_STMT"],
  },
  {
    key: "WALLET",
    label: "Wallet",
    routeKind: "OTHER",
    services: ["WALLET_TOPUP", "WALLET_WITHDRAW"],
  },
  {
    key: "TRAVEL",
    label: "Travel",
    routeKind: "TRAVEL",
    services: ["TRAVEL_FLIGHT", "TRAVEL_HOTEL", "TRAVEL_BUS", "TRAVEL_TRAIN"],
  },
  {
    key: "OTHER",
    label: "Other Services",
    routeKind: "OTHER",
    services: ["PAN_CARD", "INSURANCE"],
  },
] as const;

export type ServiceFamily = (typeof SERVICE_FAMILIES)[number];

/** Family a service code belongs to (falls back to OTHER). */
export function familyOf(code: string): ServiceFamily {
  return (
    SERVICE_FAMILIES.find((f) => (f.services as readonly string[]).includes(code)) ??
    SERVICE_FAMILIES[SERVICE_FAMILIES.length - 1]
  );
}
