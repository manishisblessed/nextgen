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
  ShieldAlert,
  FileSignature,
  BookOpenCheck,
  Timer,
  Undo2,
  ReceiptText,
  LineChart,
  ScanSearch,
  SlidersHorizontal,
  Tag,
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
  { href: "/dashboard/disputes", label: "Support Tickets", icon: LifeBuoy, badge: "New" }
];

/** Canonical tab slugs (without role prefix) used for permission assignment */
export const ASSIGNABLE_ADMIN_TABS = [
  { href: "invites", label: "Onboarding Invites" },
  { href: "users", label: "Users" },
  { href: "network", label: "Network Manager" },
  { href: "sub-admins", label: "Sub-Admins" },
  { href: "wallet-ops", label: "Wallet Operations" },
  { href: "ledger", label: "Ledger Explorer" },
  { href: "pg", label: "Payment Gateway" },
  { href: "pos", label: "POS Fleet" },
  { href: "pos-rental", label: "POS Rental & Billing" },
  { href: "kyc", label: "KYC Approvals" },
  { href: "billers", label: "Billers / Routing" },
  { href: "commissions", label: "Commission Master" },
  { href: "schemes", label: "Scheme Manager" },
  { href: "settlements", label: "Settlements" },
  { href: "settlement-ops", label: "Settlement Ops" },
  { href: "reversals", label: "Reversal Desk" },
  { href: "aeps", label: "AEPS Centre" },
  { href: "qr", label: "QR Collections" },
  { href: "disputes", label: "Disputes & Support" },
  { href: "aml", label: "AML Monitoring" },
  { href: "analytics", label: "Business Analytics" },
  { href: "agreements", label: "Agreements Vault" },
  { href: "verify", label: "Identity Toolkit" },
  { href: "services", label: "On/Off Services" },
  { href: "controls", label: "Platform Controls" },
  { href: "slider", label: "Slider & Pop-ups" },
  { href: "audit", label: "Audit Log" },
  { href: "system", label: "System Health" },
] as const;

/** Tabs a master-admin creator can assign to another master-admin.
 *  Includes everything from ASSIGNABLE_ADMIN_TABS + the "admins" tab. */
export const ASSIGNABLE_MASTER_ADMIN_TABS = [
  { href: "admins", label: "Manage Admins" },
  ...ASSIGNABLE_ADMIN_TABS,
] as const;

/** Tab slugs an admin (or master-admin) can grant to a sub-admin. Matches the
 *  sub-admin nav below — all links live under /dashboard/admin/. */
export const ASSIGNABLE_SUB_ADMIN_TABS = [
  { href: "users", label: "Users" },
  { href: "pg", label: "Payment Gateway" },
  { href: "pos", label: "POS Fleet" },
  { href: "kyc", label: "KYC Approvals" },
  { href: "billers", label: "Billers / Routing" },
  { href: "settlements", label: "Settlements" },
  { href: "qr", label: "QR Collections" },
  { href: "disputes", label: "Disputes & Support" },
  { href: "services", label: "On/Off Services" },
  { href: "slider", label: "Slider & Pop-ups" },
] as const;

/** Money / operations tabs shared by master-admin and admin. */
const adminMoneyOps: NavItem[] = [
  { href: "/dashboard/admin/wallet-ops", label: "Wallet Operations", icon: Wallet, badge: "New" },
  { href: "/dashboard/admin/ledger", label: "Ledger Explorer", icon: BookOpenCheck, badge: "New" },
  { href: "/dashboard/admin/brands", label: "Brands & MDR", icon: Tag, badge: "New" },
  { href: "/dashboard/admin/settlement-ops", label: "Settlement Ops", icon: Timer, badge: "New" },
  { href: "/dashboard/admin/reversals", label: "Reversal Desk", icon: Undo2, badge: "New" },
  { href: "/dashboard/admin/aeps", label: "AEPS Centre", icon: Fingerprint, badge: "New" },
  { href: "/dashboard/admin/pos-rental", label: "POS Rental & Billing", icon: ReceiptText, badge: "New" },
  { href: "/dashboard/admin/analytics", label: "Business Analytics", icon: LineChart, badge: "New" },
  { href: "/dashboard/admin/agreements", label: "Agreements Vault", icon: FileSignature, badge: "New" },
  { href: "/dashboard/admin/verify", label: "Identity Toolkit", icon: ScanSearch, badge: "New" },
  { href: "/dashboard/admin/controls", label: "Platform Controls", icon: SlidersHorizontal, badge: "New" },
];

export const navByRole: Record<Role, NavGroup[]> = {
  "master-admin": [
    {
      heading: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/admin/admins", label: "Manage Admins", icon: ShieldCheck, badge: "New" },
        { href: "/dashboard/admin/invites", label: "Onboarding Invites", icon: PackagePlus, badge: "New" },
        { href: "/dashboard/admin/users", label: "Users", icon: Users },
        { href: "/dashboard/admin/network", label: "Network Manager", icon: Users, badge: "New" },
        { href: "/dashboard/admin/sub-admins", label: "Sub-Admins", icon: UserCog },
        { href: "/dashboard/admin/pg", label: "Payment Gateway", icon: CreditCard, badge: "New" },
        { href: "/dashboard/admin/pos", label: "POS Fleet", icon: Monitor, badge: "New" },
        { href: "/dashboard/admin/kyc", label: "KYC Approvals", icon: ShieldCheck, badge: "8" },
        { href: "/dashboard/admin/billers", label: "Billers / Routing", icon: Boxes },
        { href: "/dashboard/admin/commissions", label: "Commission Master", icon: CircleDollarSign },
        { href: "/dashboard/admin/schemes", label: "Scheme Manager", icon: Layers, badge: "New" },
        { href: "/dashboard/admin/settlements", label: "Settlements", icon: Banknote },
        { href: "/dashboard/admin/qr", label: "QR Collections", icon: QrCode, badge: "New" },
        { href: "/dashboard/admin/disputes", label: "Disputes & Support", icon: LifeBuoy, badge: "New" },
        { href: "/dashboard/admin/aml", label: "AML Monitoring", icon: ShieldAlert, badge: "New" },
        { href: "/dashboard/payout-approvals", label: "Payout Approvals", icon: ListChecks },
        { href: "/dashboard/admin/services", label: "On/Off Services", icon: Power, badge: "New" },
        { href: "/dashboard/admin/slider", label: "Slider & Pop-ups", icon: Images, badge: "New" },
        { href: "/dashboard/admin/audit", label: "Audit Log", icon: ScrollText },
        { href: "/dashboard/admin/system", label: "System Health", icon: ServerCog },
        { href: "/dashboard/reports", label: "Reports", icon: BarChart3 }
      ]
    },
    { heading: "Money & Ops", items: adminMoneyOps },
    { heading: "Account", items: account }
  ],

  retailer: [
    {
      heading: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/earnings", label: "My Earnings", icon: CircleDollarSign, badge: "New" },
        { href: "/dashboard/funds-request", label: "Funds Request", icon: HandCoins },
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
        { href: "/dashboard/network", label: "My Retailers", icon: Users },
        { href: "/dashboard/network/onboard", label: "Invite Retailer", icon: PackagePlus },
        { href: "/dashboard/network/schemes", label: "My Schemes", icon: Layers, badge: "New" },
        { href: "/dashboard/pos-rental", label: "POS Rental", icon: ReceiptText, badge: "New" },
        { href: "/dashboard/earnings", label: "My Earnings", icon: CircleDollarSign, badge: "New" },
        { href: "/dashboard/approvals", label: "Declaration Approvals", icon: FileSignature },
        { href: "/dashboard/funds-request", label: "Fund Requests", icon: HandCoins },
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
        { href: "/dashboard/network", label: "My Network", icon: Users },
        { href: "/dashboard/network/onboard", label: "Invite Master Distributor", icon: PackagePlus },
        { href: "/dashboard/network/schemes", label: "My Schemes", icon: Layers, badge: "New" },
        { href: "/dashboard/pos-rental", label: "POS Rental", icon: ReceiptText, badge: "New" },
        { href: "/dashboard/earnings", label: "My Earnings", icon: CircleDollarSign, badge: "New" },
        { href: "/dashboard/approvals", label: "Declaration Approvals", icon: FileSignature },
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
        { href: "/dashboard/network", label: "My Distributors", icon: Users },
        { href: "/dashboard/network/onboard", label: "Invite Distributor", icon: PackagePlus },
        { href: "/dashboard/network/schemes", label: "My Schemes", icon: Layers, badge: "New" },
        { href: "/dashboard/pos-rental", label: "POS Rental", icon: ReceiptText, badge: "New" },
        { href: "/dashboard/earnings", label: "My Earnings", icon: CircleDollarSign, badge: "New" },
        { href: "/dashboard/approvals", label: "Declaration Approvals", icon: FileSignature },
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

  admin: [
    {
      heading: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/admin/invites", label: "Onboarding Invites", icon: PackagePlus, badge: "New" },
        { href: "/dashboard/admin/users", label: "Users", icon: Users },
        { href: "/dashboard/admin/network", label: "Network Manager", icon: Users, badge: "New" },
        { href: "/dashboard/admin/sub-admins", label: "Sub-Admins", icon: UserCog },
        { href: "/dashboard/admin/pg", label: "Payment Gateway", icon: CreditCard, badge: "New" },
        { href: "/dashboard/admin/pos", label: "POS Fleet", icon: Monitor, badge: "New" },
        { href: "/dashboard/admin/kyc", label: "KYC Approvals", icon: ShieldCheck, badge: "8" },
        { href: "/dashboard/admin/billers", label: "Billers / Routing", icon: Boxes },
        { href: "/dashboard/admin/commissions", label: "Commission Master", icon: CircleDollarSign },
        { href: "/dashboard/admin/schemes", label: "Scheme Manager", icon: Layers, badge: "New" },
        { href: "/dashboard/admin/settlements", label: "Settlements", icon: Banknote },
        { href: "/dashboard/admin/qr", label: "QR Collections", icon: QrCode, badge: "New" },
        { href: "/dashboard/admin/disputes", label: "Disputes & Support", icon: LifeBuoy, badge: "New" },
        { href: "/dashboard/admin/aml", label: "AML Monitoring", icon: ShieldAlert, badge: "New" },
        { href: "/dashboard/payout-approvals", label: "Payout Approvals", icon: ListChecks },
        { href: "/dashboard/admin/services", label: "On/Off Services", icon: Power, badge: "New" },
        { href: "/dashboard/admin/slider", label: "Slider & Pop-ups", icon: Images, badge: "New" },
        { href: "/dashboard/admin/audit", label: "Audit Log", icon: ScrollText },
        { href: "/dashboard/admin/system", label: "System Health", icon: ServerCog },
        { href: "/dashboard/reports", label: "Reports", icon: BarChart3 }
      ]
    },
    { heading: "Money & Ops", items: adminMoneyOps },
    { heading: "Account", items: account }
  ],

  finance: [
    {
      heading: "Finance",
      items: [
        { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/admin/wallet-ops", label: "Wallet Balances", icon: Wallet },
        { href: "/dashboard/admin/ledger", label: "Ledger Explorer", icon: BookOpenCheck },
        { href: "/dashboard/admin/analytics", label: "Business Analytics", icon: LineChart },
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
        { href: "/dashboard/admin/users", label: "Users", icon: Users },
        { href: "/dashboard/admin/pg", label: "Payment Gateway", icon: CreditCard },
        { href: "/dashboard/admin/pos", label: "POS Fleet", icon: Monitor },
        { href: "/dashboard/admin/kyc", label: "KYC Approvals", icon: ShieldCheck, badge: "8" },
        { href: "/dashboard/admin/billers", label: "Billers / Routing", icon: Boxes },
        { href: "/dashboard/admin/settlements", label: "Settlements", icon: Banknote },
        { href: "/dashboard/admin/qr", label: "QR Collections", icon: QrCode, badge: "New" },
        { href: "/dashboard/admin/disputes", label: "Disputes & Support", icon: LifeBuoy, badge: "New" },
        { href: "/dashboard/payout-approvals", label: "Payout Approvals", icon: ListChecks },
        { href: "/dashboard/admin/services", label: "On/Off Services", icon: Power, badge: "New" },
        { href: "/dashboard/admin/slider", label: "Slider & Pop-ups", icon: Images, badge: "New" }
      ]
    },
    { heading: "Account", items: account }
  ]
};
