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
  Network,
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
  { href: "/dashboard/aadhaar-pay", label: "AePS / Aadhaar Pay", icon: Fingerprint },
  { href: "/dashboard/upi", label: "UPI Collect", icon: Send },
  { href: "/dashboard/recharge/mobile", label: "Recharges", icon: Smartphone },
  { href: "/dashboard/bill-pay/electricity", label: "Bill Payments", icon: Receipt },
  { href: "/dashboard/travel/flight", label: "Travel", icon: Plane },
  { href: "/dashboard/virtual-account", label: "Virtual Account", icon: Building2 }
];

const account: NavItem[] = [
  { href: "/dashboard/transactions", label: "Transactions", icon: History },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/contact", label: "Help & Support", icon: LifeBuoy }
];

export const navByRole: Record<Role, NavGroup[]> = {
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
        { href: "/dashboard/network", label: "My Retailers", icon: Users },
        { href: "/dashboard/network/onboard", label: "Onboard Retailer", icon: PackagePlus },
        { href: "/dashboard/funds-request", label: "Fund Requests", icon: HandCoins, badge: "12" },
        { href: "/dashboard/commissions", label: "Commission Slabs", icon: CircleDollarSign },
        { href: "/dashboard/reports", label: "Reports", icon: BarChart3 }
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
        { href: "/dashboard/network", label: "Network Tree", icon: Network },
        { href: "/dashboard/network/onboard", label: "Onboard Distributor", icon: PackagePlus },
        { href: "/dashboard/funds-request", label: "Fund Requests", icon: HandCoins, badge: "47" },
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
        { href: "/dashboard/admin/users", label: "Users", icon: Users },
        { href: "/dashboard/admin/sub-admins", label: "Sub-Admins", icon: UserCog },
        { href: "/dashboard/admin/pg", label: "Payment Gateway", icon: CreditCard, badge: "New" },
        { href: "/dashboard/admin/pos", label: "POS Fleet", icon: Monitor, badge: "New" },
        { href: "/dashboard/admin/kyc", label: "KYC Approvals", icon: ShieldCheck, badge: "8" },
        { href: "/dashboard/admin/billers", label: "Billers / Routing", icon: Boxes },
        { href: "/dashboard/admin/commissions", label: "Commission Master", icon: CircleDollarSign },
        { href: "/dashboard/admin/settlements", label: "Settlements", icon: Banknote },
        { href: "/dashboard/admin/audit", label: "Audit Log", icon: ScrollText },
        { href: "/dashboard/admin/system", label: "System Health", icon: ServerCog }
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
        { href: "/dashboard/admin/settlements", label: "Settlements", icon: Banknote }
      ]
    },
    { heading: "Account", items: account }
  ]
};
