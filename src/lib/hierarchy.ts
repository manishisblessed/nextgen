/**
 * Role hierarchy — the single source of truth for role ordering, onboarding
 * permissions, and default child roles in the network tree.
 *
 * Network roles: RETAILER < DISTRIBUTOR < MASTER_DISTRIBUTOR < SUPER_DISTRIBUTOR
 * Staff roles:   SUPPORT < ADMIN < MASTER_ADMIN
 *
 * Network roles onboard their immediate subordinate by default.
 * Staff roles (ADMIN, MASTER_ADMIN) can create any network role.
 */

export type DbRole =
  | "RETAILER"
  | "DISTRIBUTOR"
  | "MASTER_DISTRIBUTOR"
  | "SUPER_DISTRIBUTOR"
  | "ADMIN"
  | "SUPPORT"
  | "MASTER_ADMIN";

/** Numeric rank — higher number = more authority. */
export const ROLE_RANK: Record<DbRole, number> = {
  RETAILER: 10,
  DISTRIBUTOR: 20,
  MASTER_DISTRIBUTOR: 30,
  SUPER_DISTRIBUTOR: 40,
  SUPPORT: 50,
  ADMIN: 60,
  MASTER_ADMIN: 70,
};

/** Ordered network tiers from lowest to highest. */
export const NETWORK_TIERS: DbRole[] = [
  "RETAILER",
  "DISTRIBUTOR",
  "MASTER_DISTRIBUTOR",
  "SUPER_DISTRIBUTOR",
];

/** Staff/admin roles (not part of the onboarding chain). */
export const STAFF_ROLES: DbRole[] = ["SUPPORT", "ADMIN", "MASTER_ADMIN"];

/** Roles that can perform onboarding (network + staff-creators). */
export const ONBOARD_CAPABLE_ROLES: DbRole[] = [
  "DISTRIBUTOR",
  "MASTER_DISTRIBUTOR",
  "SUPER_DISTRIBUTOR",
  "ADMIN",
  "MASTER_ADMIN",
];

/**
 * Can `creatorRole` onboard a user with `targetRole`?
 *
 * - MASTER_ADMIN / ADMIN can create ANY network role.
 * - SUPER_DISTRIBUTOR can ONLY create MASTER_DISTRIBUTOR.
 * - MASTER_DISTRIBUTOR can ONLY create DISTRIBUTOR.
 * - DISTRIBUTOR can ONLY create RETAILER.
 */
export function canOnboard(creatorRole: string, targetRole: string): boolean {
  const cRank = ROLE_RANK[creatorRole as DbRole];
  const tRank = ROLE_RANK[targetRole as DbRole];
  if (cRank === undefined || tRank === undefined) return false;

  if (STAFF_ROLES.includes(creatorRole as DbRole)) {
    return NETWORK_TIERS.includes(targetRole as DbRole);
  }

  const cIdx = NETWORK_TIERS.indexOf(creatorRole as DbRole);
  const tIdx = NETWORK_TIERS.indexOf(targetRole as DbRole);
  return cIdx > 0 && tIdx >= 0 && cIdx === tIdx + 1;
}

/**
 * Default child role when a creator doesn't specify one explicitly.
 * Each role defaults to their immediate subordinate.
 */
export function defaultChildRole(creatorRole: string): DbRole {
  switch (creatorRole) {
    case "MASTER_ADMIN":
    case "ADMIN":
      return "SUPER_DISTRIBUTOR";
    case "SUPER_DISTRIBUTOR":
      return "MASTER_DISTRIBUTOR";
    case "MASTER_DISTRIBUTOR":
      return "DISTRIBUTOR";
    case "DISTRIBUTOR":
      return "RETAILER";
    default:
      return "RETAILER";
  }
}

/** Whether a role is a staff/admin role (not a network role). */
export function isStaffRole(role: string): boolean {
  return STAFF_ROLES.includes(role as DbRole);
}
