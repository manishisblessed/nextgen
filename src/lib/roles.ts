import {
  LayoutDashboard,
  Wallet,
  Send,
  Fingerprint,
  Smartphone,
  Receipt,
  Plane,
  History,
  User,
  Settings,
  LifeBuoy,
  QrCode,
  Users,
  Banknote,
  ShieldCheck,
  ServerCog,
  KeyRound,
  Megaphone,
  BarChart3,
  Building2,
  CircleDollarSign,
  ScrollText,
  PackagePlus,
  HandCoins,
  Boxes,
  Globe,
  UserCog,
  CreditCard,
  Monitor,
  Activity,
  Landmark,
  ListChecks,
  Power,
  Layers,
  Images,
  type LucideIcon
} from "lucide-react";
import type { Role } from "@/lib/auth";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

export type NavGroup = {
  heading: string;
  items: NavItem[];
};

const services: NavItem[] = [
  { href: "/dashboard/pg", label: "Payment Gateway", icon: CreditCard, badge: "New" },
  { href: "/dashboard/pos", label: "POS Terminals", icon: Monitor, badge: "New" },
  { href: "/dashboard/qr", label: "QR Payments", icon: QrCode, badge: "New" },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/money-transfer", label: "Money Transfer", icon: Send },
  { href: "/dashboard/payout", label: "Payout", icon: Landmark, badge: "New" },
  { href: "/dashboard/aadhaar-pay", label: "AePS / Aadhaar Pay", icon: Fingerprint },
  { href: "/dashboard/upi", label: "UPI Collect", icon: Send },
  { href: "/dashboard/recharge/mobile", label: "Recharges", icon: Smartphone },
  { href: "/dashboard/bill-pay/electricity", label: "Bill Payments", icon: Receipt },
  { href: "/dashboard/travel/flight", label: "Travel", icon: Plane },
  { href: "/dashboard/virtual-account", label: "Virtual Account", icon: Building2 }
];

const account: NavItem[] = [
  { href: "/dashboard/performance", label: "Performance", icon: Activity },
  { href: "/dashboard/transactions", label: "Transactions", icon: History },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/contact", label: "Help & Support", icon: LifeBuoy }
];

/** Canonical tab slugs (without role prefix) used for permission assignment */
export const ASSIGNABLE_ADMIN_TABS = [
  { href: "invites", label: "Onboarding Invites" },
  { href: "users", label: "Users" },
  { href: "sub-admins", label: "Sub-Admins" },
  { href: "pg", label: "Payment Gateway" },
  { href: "pos", label: "POS Fleet" },
  { href: "kyc", label: "KYC Approvals" },
  { href: "billers", label: "Billers / Routing" },
  { href: "commissions", label: "Commission Master" },
  { href: "schemes", label: "Scheme Manager" },
  { href: "settlements", label: "Settlements" },
  { href: "services", label: "On/Off Services" },
  { href: "audit", label: "Audit Log" },
  { href: "system", label: "System Health" },
] as const;

/** Returns the dashboard prefix for admin-type roles */
export function adminPrefix(role: Role): string {
  switch (role) {
    case "master-admin": return "/dashboard/master-admin";
    case "admin": return "/dashboard/admin";
    case "sub-admin": return "/dashboard/sub-admin";
    default: return "/dashboard/admin";
  }
}

export const navByRole: Record<Role, NavGroup[]> = {
  "master-admin": [
    {
      heading: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/master-admin/admins", label: "Manage Admins", icon: ShieldCheck, badge: "New" },
        { href: "/dashboard/master-admin/invites", label: "Onboarding Invites", icon: PackagePlus, badge: "New" },
        { href: "/dashboard/master-admin/users", label: "Users", icon: Users },
        { href: "/dashboard/master-admin/pg", label: "Payment Gateway", icon: CreditCard, badge: "New" },
        { href: "/dashboard/master-admin/pos", label: "POS Fleet", icon: Monitor, badge: "New" },
        { href: "/dashboard/master-admin/kyc", label: "KYC Approvals", icon: ShieldCheck, badge: "8" },
        { href: "/dashboard/master-admin/billers", label: "Billers / Routing", icon: Boxes },
        { href: "/dashboard/master-admin/commissions", label: "Commission Master", icon: CircleDollarSign },
        { href: "/dashboard/admin/schemes", label: "Scheme Manager", icon: Layers, badge: "New" },
        { href: "/dashboard/master-admin/settlements", label: "Settlements", icon: Banknote },
        { href: "/dashboard/payout-approvals", label: "Payout Approvals", icon: ListChecks },
        { href: "/dashboard/admin/services", label: "On/Off Services", icon: Power, badge: "New" },
        { href: "/dashboard/admin/slider", label: "Slider & Pop-ups", icon: Images, badge: "New" },
        { href: "/dashboard/master-admin/audit", label: "Audit Log", icon: ScrollText },
        { href: "/dashboard/master-admin/system", label: "System Health", icon: ServerCog },
        { href: "/dashboard/reports", label: "Reports", icon: BarChart3 }
      ]
    },
    { heading: "Account", items: account }
  ],

  retailer: [
    {
      heading: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/funds-request", label: "Funds Request", icon: HandCoins, badge: "New" },
        { href: "/dashboard/reports", label: "Reports", icon: BarChart3 }
      ]
    },
    { heading: "Services", items: services },
    { heading: "Account", items: account }
  ],

  distributor: [
    {
      heading: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/network/onboard", label: "Invite Retailer", icon: PackagePlus },
        { href: "/dashboard/funds-request", label: "Fund Requests", icon: HandCoins, badge: "12" },
        { href: "/dashboard/payout-approvals", label: "Payout Approvals", icon: ListChecks },
        { href: "/dashboard/commissions", label: "Commission Slabs", icon: CircleDollarSign },
        { href: "/dashboard/reports", label: "Reports", icon: BarChart3 }
      ]
    },
    { heading: "Run Services", items: services },
    { heading: "Account", items: account }
  ],

  "super-distributor": [
    {
      heading: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/network/onboard", label: "Invite Master Distributor", icon: PackagePlus },
        { href: "/dashboard/funds-request", label: "Fund Requests", icon: HandCoins },
        { href: "/dashboard/payout-approvals", label: "Payout Approvals", icon: ListChecks },
        { href: "/dashboard/commissions", label: "Commission Master", icon: CircleDollarSign },
        { href: "/dashboard/reports", label: "Reports", icon: BarChart3 }
      ]
    },
    {
      heading: "Platform",
      items: [
        { href: "/dashboard/api", label: "API Keys", icon: KeyRound },
        { href: "/dashboard/whitelabel", label: "White Label", icon: Globe },
        { href: "/dashboard/marketing", label: "Marketing Tools", icon: Megaphone }
      ]
    },
    { heading: "Run Services", items: services },
    { heading: "Account", items: account }
  ],

  "master-distributor": [
    {
      heading: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/network/onboard", label: "Invite Distributor", icon: PackagePlus },
        { href: "/dashboard/funds-request", label: "Fund Requests", icon: HandCoins, badge: "47" },
        { href: "/dashboard/payout-approvals", label: "Payout Approvals", icon: ListChecks },
        { href: "/dashboard/commissions", label: "Commission Master", icon: CircleDollarSign },
        { href: "/dashboard/reports", label: "Reports", icon: BarChart3 }
      ]
    },
    {
      heading: "Platform",
      items: [
        { href: "/dashboard/api", label: "API Keys", icon: KeyRound },
        { href: "/dashboard/whitelabel", label: "White Label", icon: Globe },
        { href: "/dashboard/marketing", label: "Marketing Tools", icon: Megaphone }
      ]
    },
    { heading: "Run Services", items: services },
    { heading: "Account", items: account }
  ],

  admin: [
    {
      heading: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/admin/invites", label: "Onboarding Invites", icon: PackagePlus, badge: "New" },
        { href: "/dashboard/admin/users", label: "Users", icon: Users },
        { href: "/dashboard/admin/sub-admins", label: "Sub-Admins", icon: UserCog },
        { href: "/dashboard/admin/pg", label: "Payment Gateway", icon: CreditCard, badge: "New" },
        { href: "/dashboard/admin/pos", label: "POS Fleet", icon: Monitor, badge: "New" },
        { href: "/dashboard/admin/kyc", label: "KYC Approvals", icon: ShieldCheck, badge: "8" },
        { href: "/dashboard/admin/billers", label: "Billers / Routing", icon: Boxes },
        { href: "/dashboard/admin/commissions", label: "Commission Master", icon: CircleDollarSign },
        { href: "/dashboard/admin/schemes", label: "Scheme Manager", icon: Layers, badge: "New" },
        { href: "/dashboard/admin/settlements", label: "Settlements", icon: Banknote },
        { href: "/dashboard/payout-approvals", label: "Payout Approvals", icon: ListChecks },
        { href: "/dashboard/admin/services", label: "On/Off Services", icon: Power, badge: "New" },
        { href: "/dashboard/admin/slider", label: "Slider & Pop-ups", icon: Images, badge: "New" },
        { href: "/dashboard/admin/audit", label: "Audit Log", icon: ScrollText },
        { href: "/dashboard/admin/system", label: "System Health", icon: ServerCog },
        { href: "/dashboard/reports", label: "Reports", icon: BarChart3 }
      ]
    },
    { heading: "Account", items: account }
  ],

  "sub-admin": [
    {
      heading: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/sub-admin/users", label: "Users", icon: Users },
        { href: "/dashboard/sub-admin/pg", label: "Payment Gateway", icon: CreditCard },
        { href: "/dashboard/sub-admin/pos", label: "POS Fleet", icon: Monitor },
        { href: "/dashboard/sub-admin/kyc", label: "KYC Approvals", icon: ShieldCheck, badge: "8" },
        { href: "/dashboard/sub-admin/billers", label: "Billers / Routing", icon: Boxes },
        { href: "/dashboard/sub-admin/settlements", label: "Settlements", icon: Banknote },
        { href: "/dashboard/payout-approvals", label: "Payout Approvals", icon: ListChecks },
        { href: "/dashboard/admin/services", label: "On/Off Services", icon: Power, badge: "New" },
        { href: "/dashboard/admin/slider", label: "Slider & Pop-ups", icon: Images, badge: "New" }
      ]
    },
    { heading: "Account", items: account }
  ]
};
