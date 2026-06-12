"use client";

const SESSION_KEY = "ngp_session";
const COOKIE_NAME = "ngp_logged_in";

export type Role =
  | "admin"
  | "sub-admin"
  | "master-distributor"
  | "distributor"
  | "retailer";

export type Session = {
  name: string;
  email: string;
  phone: string;
  role: Role;
  walletBalance: number;
  /** Higher tiers see hierarchy turnover instead of personal commission */
  monthlyTurnover?: number;
  loggedInAt: number;
  /**
   * Set true on a freshly-issued sub-admin account. The dashboard layout
   * will force-redirect such users to /sub-admin/change-password until
   * they pick their own password.
   */
  mustChangePassword?: boolean;
  /** Network code (JNPR.../JNPD.../JNPM.../JNPS...) when applicable. */
  userCode?: string;
};

export const demoSessions: Record<Role, Session> = {
  retailer: {
    name: "Aman Sharma",
    email: "retailer@jmpnextgenpay.com",
    phone: "+91 98980 00000",
    role: "retailer",
    walletBalance: 28450,
    monthlyTurnover: 184500,
    loggedInAt: Date.now()
  },
  distributor: {
    name: "Rohit Verma",
    email: "distributor@jmpnextgenpay.com",
    phone: "+91 90000 00021",
    role: "distributor",
    walletBalance: 482300,
    monthlyTurnover: 7250000,
    loggedInAt: Date.now()
  },
  "master-distributor": {
    name: "Neha Kapoor",
    email: "master@jmpnextgenpay.com",
    phone: "+91 90000 00031",
    role: "master-distributor",
    walletBalance: 2148000,
    monthlyTurnover: 38400000,
    loggedInAt: Date.now()
  },
  admin: {
    name: "NextGenPay Admin",
    email: "admin@jmpnextgenpay.com",
    phone: "+91 90000 00041",
    role: "admin",
    walletBalance: 0,
    monthlyTurnover: 184000000,
    loggedInAt: Date.now()
  },
  "sub-admin": {
    name: "NextGenPay Sub-Admin",
    email: "subadmin@jmpnextgenpay.com",
    phone: "+91 90000 00042",
    role: "sub-admin",
    walletBalance: 0,
    monthlyTurnover: 96000000,
    loggedInAt: Date.now()
  }
};

export const demoSession: Session = demoSessions.retailer;

export function saveSession(session: Session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${60 * 60 * 24 * 7}`;
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}

export const roleMeta: Record<
  Role,
  { label: string; tagline: string; accent: string; pillar: string }
> = {
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
  }
};
