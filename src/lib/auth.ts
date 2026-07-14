"use client";

/**
 * Client-side auth utilities. Wraps NextAuth's useSession for the dashboard UI.
 * Keeps role metadata, types, and formatting helpers that components need.
 */

/** Display-friendly role used throughout the UI */
export type Role =
  | "master-admin"
  | "admin"
  | "sub-admin"
  | "finance"
  | "super-distributor"
  | "master-distributor"
  | "distributor"
  | "retailer";

/** Same as Role — kept for clarity in new code */
export type RoleDisplay = Role;

/** Database enum role values */
export type DbRole =
  | "MASTER_ADMIN"
  | "ADMIN"
  | "SUPPORT"
  | "FINANCE"
  | "SUPER_DISTRIBUTOR"
  | "MASTER_DISTRIBUTOR"
  | "DISTRIBUTOR"
  | "RETAILER";

export type Session = {
  name: string;
  email: string;
  phone: string;
  role: Role;
  walletBalance: number;
  monthlyTurnover?: number;
  loggedInAt: number;
  mustChangePassword?: boolean;
  userCode?: string;
};

/** Map DB role to display-friendly role used in UI */
export function toDisplayRole(role: DbRole | string): Role {
  switch (role) {
    case "MASTER_ADMIN": return "master-admin";
    case "ADMIN": return "admin";
    case "SUPPORT": return "sub-admin";
    case "FINANCE": return "finance";
    case "SUPER_DISTRIBUTOR": return "super-distributor";
    case "MASTER_DISTRIBUTOR": return "master-distributor";
    case "DISTRIBUTOR": return "distributor";
    case "RETAILER": return "retailer";
    default: return "retailer";
  }
}

/** Map display role to DB role */
export function toDbRole(displayRole: Role): DbRole {
  switch (displayRole) {
    case "master-admin": return "MASTER_ADMIN";
    case "admin": return "ADMIN";
    case "sub-admin": return "SUPPORT";
    case "finance": return "FINANCE";
    case "super-distributor": return "SUPER_DISTRIBUTOR";
    case "master-distributor": return "MASTER_DISTRIBUTOR";
    case "distributor": return "DISTRIBUTOR";
    case "retailer": return "RETAILER";
    default: return "RETAILER";
  }
}

/**
 * @deprecated Use `useAuth()` hook or NextAuth's `useSession()` instead.
 * Kept for backward compatibility during migration.
 */
export function getSession(): Session | null {
  return null;
}

/**
 * @deprecated Use NextAuth's `signIn()` instead.
 */
export function saveSession(_session: any) {
  // No-op — NextAuth handles session persistence via cookies
}

/**
 * @deprecated Use NextAuth's `signOut()` instead.
 */
export function clearSession() {
  // No-op — use signOut() from next-auth/react
}

export const roleMeta: Record<
  Role,
  { label: string; tagline: string; accent: string; pillar: string }
> = {
  "master-admin": {
    label: "Master Admin",
    tagline: "Full platform control, manage admins & all operations",
    accent: "from-violet-800 to-brand-600",
    pillar: "platform-owner"
  },
  retailer: {
    label: "Retailer",
    tagline: "Run all 16 services from your shop",
    accent: "from-emerald-500 to-brand-500",
    pillar: "store"
  },
  distributor: {
    label: "Distributor",
    tagline: "Manage retailers, slabs and fund requests",
    accent: "from-brand-500 to-violet-500",
    pillar: "network"
  },
  "super-distributor": {
    label: "Super Distributor",
    tagline: "Regional network head — onboard & manage master distributors",
    accent: "from-rose-500 to-orange-500",
    pillar: "enterprise"
  },
  "master-distributor": {
    label: "Master Distributor",
    tagline: "White-label, API access & override commissions",
    accent: "from-accent-500 to-rose-500",
    pillar: "wholesale"
  },
  admin: {
    label: "Admin",
    tagline: "KYC, billers, audit, system & risk",
    accent: "from-ink-700 to-brand-600",
    pillar: "platform"
  },
  "sub-admin": {
    label: "Sub-Admin",
    tagline: "Operations & approvals delegated by Admin",
    accent: "from-slate-700 to-brand-500",
    pillar: "operations"
  },
  finance: {
    label: "Finance",
    tagline: "Read-only money oversight — balances, ledger & reports",
    accent: "from-emerald-700 to-brand-600",
    pillar: "finance"
  }
};
