import { SERVICE_KEYS } from "./catalog";

/**
 * Resolve a BBPS bill category to the granular service key that gates it.
 * CREDIT_CARD routes through Same Day (BBPS-1 / Credit Card tab); everything
 * else routes through BulkPe (BBPS-2). Returns null for unknown categories so
 * the caller still sees the master BBPS gate.
 */
export function bbpsServiceKey(category: string | null | undefined): string | null {
  switch ((category || "").toUpperCase()) {
    case "CREDIT_CARD":
      return SERVICE_KEYS.BBPS_CREDIT_CARD;
    case "ELECTRICITY":
    case "WATER":
    case "GAS":
    case "EDUCATION":
    case "INSURANCE":
    case "BROADBAND":
      return SERVICE_KEYS.BBPS_BULKPE;
    default:
      return null;
  }
}
