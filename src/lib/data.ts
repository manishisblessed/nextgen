import {
  Banknote,
  Smartphone,
  Wifi,
  Tv,
  Lightbulb,
  Droplets,
  Flame,
  CreditCard,
  Bus,
  Hotel,
  Plane,
  Wallet,
  QrCode,
  Building2,
  Receipt,
  GraduationCap,
  Send,
  Fingerprint,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";

export const company = {
  legalName: "Payprism Technology Private Limited",
  brand: "Payprism",
  tradeName: "payprismindia",
  domain: "payprismindia.com",
  email: "info@payprismindia.com",
  supportEmail: "support@payprismindia.com",
  phone: "8285082121",
  cin: "U74990DL2022PTC407681",
  address:
    "1797/18A, 2nd Floor, Bhagirath Palace, Chandni Chowk, Delhi 110006",
  shortAddress: "Bhagirath Palace, Chandni Chowk, Delhi"
};

export type ServiceItem = {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  category: "banking" | "recharge" | "bills" | "travel" | "other";
  badge?: string;
};

export const services: ServiceItem[] = [
  {
    slug: "aadhaar-pay",
    title: "Aadhaar Pay (AePS)",
    description:
      "Cash withdrawal, balance inquiry & mini statement using Aadhaar biometric.",
    icon: Fingerprint,
    href: "/dashboard/aadhaar-pay",
    category: "banking"
  },
  {
    slug: "money-transfer",
    title: "Money Transfer (DMT)",
    description: "Send money instantly to any Indian bank account 24x7.",
    icon: Send,
    href: "/dashboard/money-transfer",
    category: "banking"
  },
  {
    slug: "upi",
    title: "UPI Collect",
    description: "Generate UPI requests and accept payments without a POS.",
    icon: QrCode,
    href: "/dashboard/upi",
    category: "banking"
  },
  {
    slug: "wallet",
    title: "Wallet Pay",
    description: "Top-up your Payprism wallet and pay anywhere instantly.",
    icon: Wallet,
    href: "/dashboard/wallet",
    category: "banking"
  },
  {
    slug: "virtual-account",
    title: "Virtual Account",
    description: "Get a unique IFSC + account number to receive payments.",
    icon: Building2,
    href: "/dashboard/virtual-account",
    category: "banking",
    badge: "New"
  },
  {
    slug: "credit-card",
    title: "Credit Card Bill",
    description: "Pay any credit card bill across all major banks.",
    icon: CreditCard,
    href: "/dashboard/bill-pay/credit-card",
    category: "bills"
  },
  {
    slug: "mobile-recharge",
    title: "Mobile Recharge",
    description: "Prepaid recharge for Jio, Airtel, Vi, BSNL with cashback.",
    icon: Smartphone,
    href: "/dashboard/recharge/mobile",
    category: "recharge"
  },
  {
    slug: "dth",
    title: "DTH Recharge",
    description: "Recharge Tata Play, Dish TV, d2h, Sun Direct & Airtel DTH.",
    icon: Tv,
    href: "/dashboard/recharge/dth",
    category: "recharge"
  },
  {
    slug: "broadband",
    title: "Broadband / OTT",
    description: "Postpaid broadband, landline & OTT subscriptions.",
    icon: Wifi,
    href: "/dashboard/recharge/broadband",
    category: "recharge"
  },
  {
    slug: "electricity",
    title: "Electricity",
    description: "Pay state & private electricity bills across India.",
    icon: Lightbulb,
    href: "/dashboard/bill-pay/electricity",
    category: "bills"
  },
  {
    slug: "water",
    title: "Water",
    description: "Pay municipal water bills with instant confirmation.",
    icon: Droplets,
    href: "/dashboard/bill-pay/water",
    category: "bills"
  },
  {
    slug: "gas",
    title: "Gas (Piped & LPG)",
    description: "Book LPG cylinders or pay piped gas bills in seconds.",
    icon: Flame,
    href: "/dashboard/bill-pay/gas",
    category: "bills"
  },
  {
    slug: "flight",
    title: "Flight Booking",
    description: "Search and book domestic flights with best fares.",
    icon: Plane,
    href: "/dashboard/travel/flight",
    category: "travel"
  },
  {
    slug: "hotel",
    title: "Hotel Booking",
    description: "Browse 50,000+ hotels across India at agent rates.",
    icon: Hotel,
    href: "/dashboard/travel/hotel",
    category: "travel"
  },
  {
    slug: "bus",
    title: "Bus Booking",
    description: "Book AC sleeper, semi-sleeper & seater buses pan-India.",
    icon: Bus,
    href: "/dashboard/travel/bus",
    category: "travel"
  },
  {
    slug: "education",
    title: "Education Fees",
    description: "Pay school & college fees with auto reminders.",
    icon: GraduationCap,
    href: "/dashboard/bill-pay/education",
    category: "bills"
  }
];

export type FaqItem = { q: string; a: string };

export const faqs: FaqItem[] = [
  {
    q: "What is Payprism?",
    a: "Payprism (operated by Payprism Technology Private Limited) is a digital banking & utility fintech platform that helps retailers and consumers access 60+ services — money transfer, AePS, recharges, bill payments, travel bookings — all from a single dashboard, with zero hidden fees."
  },
  {
    q: "Is it safe to use the platform?",
    a: "Yes. We use bank-grade 256-bit TLS encryption, RBI-licensed payment partners, and 2-factor authentication on every login & high-value transaction. Your data is never sold or shared."
  },
  {
    q: "Which utility services can I pay for?",
    a: "Electricity, water, piped gas & LPG, broadband, DTH, postpaid mobile, landline, credit-card bills, education fees, insurance premiums, FASTag, municipal taxes and more — across 1,200+ billers."
  },
  {
    q: "How do I become a Payprism agent?",
    a: "Sign up with your PAN, Aadhaar and shop details, complete KYC in under 5 minutes, and start earning commissions on every transaction. There is no joining fee."
  },
  {
    q: "How are commissions paid?",
    a: "Commissions are credited to your Payprism wallet in real-time on every successful transaction. You can withdraw to your bank account 24x7 with instant IMPS settlement."
  },
  {
    q: "Do you charge any hidden fees?",
    a: "No. Our pricing is fully transparent — every service shows the exact convenience fee (if any) before you confirm. There are zero hidden charges, ever."
  }
];

export type Testimonial = {
  name: string;
  role: string;
  quote: string;
  rating: number;
};

export const testimonials: Testimonial[] = [
  {
    name: "Kasendar Prasad",
    role: "Owner, Rishabh Telecom & Money Transfer",
    quote:
      "Working with Payprism has transformed my business. The platform is fast, the commissions are great, and the support team is always there when I need them.",
    rating: 5
  },
  {
    name: "Mukesh Kumar",
    role: "Founder, Satkartar Telecom",
    quote:
      "Every service works flawlessly — AePS settlement is instant and the dashboard is the cleanest I've used. Highly recommended for any retail outlet.",
    rating: 5
  },
  {
    name: "Priya Sharma",
    role: "Owner, Sharma Mobile World",
    quote:
      "I doubled my monthly income within 3 months of joining Payprism. The training and onboarding is top-notch.",
    rating: 5
  },
  {
    name: "Rohit Verma",
    role: "Distributor, Verma Enterprises",
    quote:
      "The wallet top-up is instant and the commission structure is the best in the industry. A genuine partner for retailers.",
    rating: 5
  }
];

export type Stat = { value: string; label: string };

export const heroStats: Stat[] = [
  { value: "38M+", label: "Businesses joined" },
  { value: "1,200+", label: "Live billers" },
  { value: "60+", label: "Digital services" },
  { value: "99.9%", label: "Uptime SLA" }
];

export type PricingPlan = {
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
};

export const pricingPlans: PricingPlan[] = [
  {
    name: "Starter",
    price: "₹0",
    cadence: "forever free",
    description: "Perfect for individuals starting their fintech journey.",
    features: [
      "Access to 30+ services",
      "Standard commission rates",
      "UPI & wallet payments",
      "Email support",
      "Basic transaction reports"
    ],
    cta: "Get started"
  },
  {
    name: "Retailer",
    price: "₹499",
    cadence: "/year",
    description: "Best for shops & local retail outlets.",
    features: [
      "All Starter features",
      "AePS & money transfer enabled",
      "Higher commission slabs",
      "Priority WhatsApp support",
      "Advanced reports & exports",
      "Free RuPay card"
    ],
    highlighted: true,
    cta: "Become a retailer"
  },
  {
    name: "Distributor",
    price: "₹2,499",
    cadence: "/year",
    description: "For distributors managing multiple retailers.",
    features: [
      "All Retailer features",
      "Multi-retailer management",
      "Commission overrides",
      "Dedicated account manager",
      "API access",
      "Co-branded white-label"
    ],
    cta: "Talk to sales"
  }
];

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  category: string;
};

export const blogPosts: BlogPost[] = [
  {
    slug: "how-aeps-is-changing-rural-banking",
    title: "How AePS is changing rural banking in Bharat",
    excerpt:
      "Aadhaar-enabled Payment System has brought formal banking to villages where ATMs never reached. Here's how retailers can ride the wave.",
    date: "Apr 02, 2026",
    readTime: "5 min read",
    category: "Banking"
  },
  {
    slug: "ten-tips-to-grow-your-csp",
    title: "10 tips to grow your customer service point in 2026",
    excerpt:
      "Practical, retailer-tested strategies to bring more footfall and increase per-customer revenue at your CSP.",
    date: "Mar 18, 2026",
    readTime: "7 min read",
    category: "Growth"
  },
  {
    slug: "upi-vs-cards-which-wins",
    title: "UPI vs cards — which wins in 2026?",
    excerpt:
      "We crunch the numbers across 12M transactions to see how UPI and cards stack up on cost, speed and customer love.",
    date: "Feb 28, 2026",
    readTime: "6 min read",
    category: "Insights"
  }
];

export type NavLink = {
  label: string;
  href: string;
  children?: NavLink[];
};

export const mainNav: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  {
    label: "Services",
    href: "/services",
    children: [
      { label: "Aadhaar Pay (AePS)", href: "/services#aadhaar-pay" },
      { label: "Money Transfer", href: "/services#money-transfer" },
      { label: "UPI & Wallet", href: "/services#upi" },
      { label: "Recharges & Bills", href: "/services#bills" },
      { label: "Travel Bookings", href: "/services#travel" }
    ]
  },
  { label: "Products", href: "/products" },
  { label: "Career", href: "/career" },
  { label: "Team", href: "/team" },
  { label: "Contact", href: "/contact" }
];

export const footerLinks = {
  legal: [
    { label: "Privacy Policy", href: "/legal/privacy" },
    { label: "Terms & Conditions", href: "/legal/terms" },
    { label: "Refunds", href: "/legal/refunds" },
    { label: "Charges", href: "/legal/charges" }
  ],
  services: [
    { label: "Flight Bookings", href: "/services#travel" },
    { label: "Bus Booking", href: "/services#travel" },
    { label: "Hotel Booking", href: "/services#travel" },
    { label: "AePS", href: "/services#aadhaar-pay" },
    { label: "Money Transfer", href: "/services#money-transfer" }
  ],
  company: [
    { label: "About Us", href: "/about" },
    { label: "Career", href: "/career" },
    { label: "Team", href: "/team" },
    { label: "Contact", href: "/contact" }
  ]
};

export const trustBadges = [
  { label: "RBI Licensed Partners", icon: ShieldCheck },
  { label: "256-bit Encryption", icon: ShieldCheck },
  { label: "PCI-DSS Compliant", icon: ShieldCheck },
  { label: "ISO 27001 Certified", icon: ShieldCheck }
];

export type Transaction = {
  id: string;
  service: string;
  amount: number;
  status: "Success" | "Pending" | "Failed";
  date: string;
  customer: string;
  commission: number;
};

export type NetworkUser = {
  id: string;
  name: string;
  shop: string;
  role: "retailer" | "distributor" | "master-distributor";
  parentId?: string;
  city: string;
  state: string;
  joined: string;
  status: "Active" | "Pending KYC" | "Suspended";
  walletBalance: number;
  monthlyTurnover: number;
  retailers?: number;
};

export const networkUsers: NetworkUser[] = [
  {
    id: "MD-1001",
    name: "Neha Kapoor",
    shop: "Kapoor Capital",
    role: "master-distributor",
    city: "New Delhi",
    state: "Delhi",
    joined: "Jan 12, 2024",
    status: "Active",
    walletBalance: 2148000,
    monthlyTurnover: 38400000,
    retailers: 482
  },
  {
    id: "DT-2003",
    name: "Rohit Verma",
    shop: "Verma Enterprises",
    role: "distributor",
    parentId: "MD-1001",
    city: "Lucknow",
    state: "Uttar Pradesh",
    joined: "Mar 04, 2024",
    status: "Active",
    walletBalance: 482300,
    monthlyTurnover: 7250000,
    retailers: 86
  },
  {
    id: "DT-2017",
    name: "Sandeep Kulkarni",
    shop: "SK Distributors",
    role: "distributor",
    parentId: "MD-1001",
    city: "Pune",
    state: "Maharashtra",
    joined: "Apr 22, 2024",
    status: "Active",
    walletBalance: 318900,
    monthlyTurnover: 5840000,
    retailers: 61
  },
  {
    id: "DT-2024",
    name: "Anita Bose",
    shop: "Bose Tradelink",
    role: "distributor",
    parentId: "MD-1001",
    city: "Kolkata",
    state: "West Bengal",
    joined: "Jun 17, 2024",
    status: "Pending KYC",
    walletBalance: 12000,
    monthlyTurnover: 0,
    retailers: 4
  },
  {
    id: "RT-3091",
    name: "Aman Sharma",
    shop: "Sharma Mobile World",
    role: "retailer",
    parentId: "DT-2003",
    city: "Lucknow",
    state: "Uttar Pradesh",
    joined: "Aug 10, 2024",
    status: "Active",
    walletBalance: 28450,
    monthlyTurnover: 184500
  },
  {
    id: "RT-3104",
    name: "Mukesh Kumar",
    shop: "Satkartar Telecom",
    role: "retailer",
    parentId: "DT-2003",
    city: "Kanpur",
    state: "Uttar Pradesh",
    joined: "Sep 02, 2024",
    status: "Active",
    walletBalance: 41280,
    monthlyTurnover: 312700
  },
  {
    id: "RT-3140",
    name: "Priya Sharma",
    shop: "Sharma Recharge Hub",
    role: "retailer",
    parentId: "DT-2003",
    city: "Varanasi",
    state: "Uttar Pradesh",
    joined: "Oct 19, 2024",
    status: "Active",
    walletBalance: 19340,
    monthlyTurnover: 145200
  },
  {
    id: "RT-3201",
    name: "Kavita Devi",
    shop: "Devi Sewa Kendra",
    role: "retailer",
    parentId: "DT-2017",
    city: "Nashik",
    state: "Maharashtra",
    joined: "Nov 11, 2024",
    status: "Pending KYC",
    walletBalance: 5400,
    monthlyTurnover: 8200
  },
  {
    id: "RT-3217",
    name: "Sanjay Patil",
    shop: "Patil Enterprises",
    role: "retailer",
    parentId: "DT-2017",
    city: "Solapur",
    state: "Maharashtra",
    joined: "Dec 04, 2024",
    status: "Suspended",
    walletBalance: 0,
    monthlyTurnover: 0
  }
];

export type FundRequest = {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  amount: number;
  mode: "IMPS" | "NEFT" | "UPI" | "RTGS" | "Cash Deposit";
  reference: string;
  date: string;
  status: "Pending" | "Approved" | "Rejected";
  remarks?: string;
};

export const fundRequests: FundRequest[] = [
  {
    id: "FR-9001",
    fromId: "RT-3091",
    fromName: "Aman Sharma",
    toId: "DT-2003",
    amount: 25000,
    mode: "IMPS",
    reference: "P2A8765",
    date: "Apr 19, 2026 · 10:42 AM",
    status: "Pending"
  },
  {
    id: "FR-9002",
    fromId: "RT-3104",
    fromName: "Mukesh Kumar",
    toId: "DT-2003",
    amount: 50000,
    mode: "NEFT",
    reference: "N2A65541",
    date: "Apr 19, 2026 · 09:18 AM",
    status: "Pending"
  },
  {
    id: "FR-9003",
    fromId: "RT-3140",
    fromName: "Priya Sharma",
    toId: "DT-2003",
    amount: 15000,
    mode: "UPI",
    reference: "UPI/9982",
    date: "Apr 18, 2026 · 06:24 PM",
    status: "Approved"
  },
  {
    id: "FR-9004",
    fromId: "RT-3201",
    fromName: "Kavita Devi",
    toId: "DT-2017",
    amount: 3000,
    mode: "Cash Deposit",
    reference: "CDM-NASIK-78112",
    date: "Apr 18, 2026 · 11:12 AM",
    status: "Rejected",
    remarks: "Slip illegible, please re-upload."
  }
];

export type KycRequest = {
  id: string;
  name: string;
  shop: string;
  city: string;
  role: "retailer" | "distributor" | "master-distributor";
  pan: string;
  aadhaar: string;
  submittedOn: string;
  status: "Awaiting Review" | "Verified" | "Rejected";
};

export const kycRequests: KycRequest[] = [
  {
    id: "KYC-001",
    name: "Anita Bose",
    shop: "Bose Tradelink",
    city: "Kolkata",
    role: "distributor",
    pan: "BNPLM4571F",
    aadhaar: "XXXX-XXXX-7891",
    submittedOn: "Apr 18, 2026",
    status: "Awaiting Review"
  },
  {
    id: "KYC-002",
    name: "Kavita Devi",
    shop: "Devi Sewa Kendra",
    city: "Nashik",
    role: "retailer",
    pan: "DKVPS1212K",
    aadhaar: "XXXX-XXXX-1245",
    submittedOn: "Apr 18, 2026",
    status: "Awaiting Review"
  },
  {
    id: "KYC-003",
    name: "Iqbal Khan",
    shop: "Khan Mobile Centre",
    city: "Hyderabad",
    role: "retailer",
    pan: "IKKAJ5621Z",
    aadhaar: "XXXX-XXXX-8910",
    submittedOn: "Apr 17, 2026",
    status: "Awaiting Review"
  },
  {
    id: "KYC-004",
    name: "Vivek Joshi",
    shop: "Joshi Travels",
    city: "Indore",
    role: "retailer",
    pan: "VKJOS9912R",
    aadhaar: "XXXX-XXXX-3344",
    submittedOn: "Apr 16, 2026",
    status: "Verified"
  },
  {
    id: "KYC-005",
    name: "Rashida Begum",
    shop: "RB Sewa Kendra",
    city: "Patna",
    role: "retailer",
    pan: "RBPSK0921L",
    aadhaar: "XXXX-XXXX-5566",
    submittedOn: "Apr 15, 2026",
    status: "Rejected"
  }
];

export type CommissionSlab = {
  service: string;
  retailer: string;
  distributor: string;
  master: string;
};

export const commissionSlabs: CommissionSlab[] = [
  { service: "AePS Withdrawal", retailer: "0.40%", distributor: "0.10%", master: "0.05%" },
  { service: "DMT (IMPS)", retailer: "₹6 / txn", distributor: "₹2 / txn", master: "₹1 / txn" },
  { service: "Mobile Recharge", retailer: "3.00%", distributor: "0.40%", master: "0.20%" },
  { service: "DTH Recharge", retailer: "3.50%", distributor: "0.50%", master: "0.20%" },
  { service: "Electricity Bill", retailer: "0.80%", distributor: "0.20%", master: "0.10%" },
  { service: "LPG Booking", retailer: "₹4 / txn", distributor: "₹1 / txn", master: "₹0.50 / txn" },
  { service: "UPI Collect", retailer: "0.20%", distributor: "0.05%", master: "0.025%" },
  { service: "Travel - Bus", retailer: "5.00%", distributor: "0.80%", master: "0.40%" }
];

export type Biller = {
  category: string;
  count: number;
  routing: string;
  uptime: string;
  status: "Live" | "Degraded" | "Down";
};

export const billers: Biller[] = [
  { category: "Electricity", count: 84, routing: "BBPS · NPCI", uptime: "99.92%", status: "Live" },
  { category: "Water", count: 36, routing: "BBPS · NPCI", uptime: "99.81%", status: "Live" },
  { category: "Gas (Piped + LPG)", count: 24, routing: "BBPS + Direct", uptime: "99.97%", status: "Live" },
  { category: "Telecom", count: 12, routing: "Direct API", uptime: "99.99%", status: "Live" },
  { category: "DTH", count: 6, routing: "Direct API", uptime: "98.42%", status: "Degraded" },
  { category: "Credit Card", count: 41, routing: "BBPS", uptime: "99.95%", status: "Live" },
  { category: "Education", count: 312, routing: "Eduvanz / Direct", uptime: "99.74%", status: "Live" },
  { category: "Insurance", count: 28, routing: "BBPS", uptime: "99.90%", status: "Live" },
  { category: "FASTag", count: 23, routing: "NPCI · NETC", uptime: "99.99%", status: "Live" },
  { category: "Municipal Tax", count: 162, routing: "BBPS", uptime: "98.10%", status: "Degraded" }
];

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  ts: string;
  severity: "info" | "warn" | "danger";
};

export const auditEvents: AuditEvent[] = [
  { id: "AU-94221", actor: "admin@payprismindia.com", action: "Approved KYC", target: "Vivek Joshi (KYC-004)", ip: "10.18.4.21", ts: "Apr 19, 10:22 AM", severity: "info" },
  { id: "AU-94220", actor: "neha.k@payprismindia.com", action: "Override commission", target: "DMT IMPS · DT-2017", ip: "49.207.211.4", ts: "Apr 19, 09:51 AM", severity: "warn" },
  { id: "AU-94219", actor: "admin@payprismindia.com", action: "Suspended retailer", target: "RT-3217 (Patil Enterprises)", ip: "10.18.4.21", ts: "Apr 19, 09:14 AM", severity: "danger" },
  { id: "AU-94218", actor: "system", action: "Biller routing failover", target: "DTH · Tata Play → fallback", ip: "n/a", ts: "Apr 19, 08:42 AM", severity: "warn" },
  { id: "AU-94217", actor: "rohit.v@payprismindia.com", action: "Approved fund request", target: "FR-9003 · ₹15,000", ip: "182.65.21.99", ts: "Apr 18, 06:30 PM", severity: "info" },
  { id: "AU-94216", actor: "system", action: "Settlement run", target: "T+1 · ₹8.42 Cr · 12,481 txns", ip: "n/a", ts: "Apr 18, 11:05 PM", severity: "info" }
];

export type Settlement = {
  id: string;
  cycle: string;
  counterparty: string;
  amount: number;
  status: "Settled" | "In Bank" | "Reconciling";
  date: string;
};

export const settlements: Settlement[] = [
  { id: "STL-2026-04-18", cycle: "T+1", counterparty: "ICICI Nodal", amount: 84272340, status: "Settled", date: "Apr 18, 2026" },
  { id: "STL-2026-04-17", cycle: "T+1", counterparty: "ICICI Nodal", amount: 79914000, status: "Settled", date: "Apr 17, 2026" },
  { id: "STL-2026-04-16", cycle: "T+1", counterparty: "ICICI Nodal", amount: 68142890, status: "Settled", date: "Apr 16, 2026" },
  { id: "STL-2026-04-15", cycle: "T+1", counterparty: "Yes Bank Nodal", amount: 14820000, status: "In Bank", date: "Apr 15, 2026" },
  { id: "STL-2026-04-14", cycle: "T+1", counterparty: "Yes Bank Nodal", amount: 12482111, status: "Reconciling", date: "Apr 14, 2026" }
];

export type SystemMetric = {
  service: string;
  uptime: string;
  p95ms: number;
  txnsToday: number;
  errorRate: string;
};

export const systemMetrics: SystemMetric[] = [
  { service: "AePS Switch", uptime: "99.98%", p95ms: 412, txnsToday: 184221, errorRate: "0.04%" },
  { service: "DMT - IMPS", uptime: "99.99%", p95ms: 286, txnsToday: 98412, errorRate: "0.02%" },
  { service: "UPI Collect", uptime: "99.99%", p95ms: 212, txnsToday: 482011, errorRate: "0.01%" },
  { service: "BBPS Gateway", uptime: "99.92%", p95ms: 642, txnsToday: 121088, errorRate: "0.18%" },
  { service: "Recharge Aggregator", uptime: "99.86%", p95ms: 521, txnsToday: 312441, errorRate: "0.12%" },
  { service: "Travel Aggregator", uptime: "99.74%", p95ms: 1421, txnsToday: 8421, errorRate: "0.34%" }
];

export type Integration = {
  name: string;
  category: string;
  href?: string;
  initials: string;
  color: string;
};

export const integrations: Integration[] = [
  { name: "NPCI", category: "Switch", initials: "NPCI", color: "from-brand-500 to-brand-700" },
  { name: "NPCI Bharat BillPay", category: "BBPS", initials: "BBPS", color: "from-brand-600 to-violet-600" },
  { name: "RBI Sandbox", category: "Regulatory", initials: "RBI", color: "from-ink-700 to-ink-900" },
  { name: "ICICI Nodal", category: "Nodal Bank", initials: "ICICI", color: "from-orange-500 to-rose-500" },
  { name: "Yes Bank Nodal", category: "Nodal Bank", initials: "YES", color: "from-blue-500 to-indigo-600" },
  { name: "Axis Bank", category: "DMT Partner", initials: "AXIS", color: "from-rose-500 to-pink-600" },
  { name: "Visa", category: "Card Network", initials: "VISA", color: "from-blue-700 to-blue-900" },
  { name: "Mastercard", category: "Card Network", initials: "MC", color: "from-amber-500 to-rose-500" },
  { name: "RuPay", category: "Card Network", initials: "RUPAY", color: "from-emerald-500 to-brand-500" },
  { name: "Aadhaar / UIDAI", category: "Identity", initials: "UIDAI", color: "from-amber-500 to-orange-600" },
  { name: "Mantra MFS100", category: "Biometric", initials: "MFS", color: "from-violet-500 to-fuchsia-600" },
  { name: "Morpho MSO 1300", category: "Biometric", initials: "MORPH", color: "from-cyan-500 to-blue-600" }
];

export const recentTransactions: Transaction[] = [
  {
    id: "TXN8K2X9P",
    service: "Mobile Recharge - Jio",
    amount: 299,
    status: "Success",
    date: "Apr 19, 2026 · 10:42 AM",
    customer: "98765 43210",
    commission: 8.97
  },
  {
    id: "TXN8K2X8H",
    service: "Electricity - BSES Rajdhani",
    amount: 1840,
    status: "Success",
    date: "Apr 19, 2026 · 10:18 AM",
    customer: "Consumer 1023445",
    commission: 14.7
  },
  {
    id: "TXN8K2X6Y",
    service: "Money Transfer - SBI",
    amount: 5000,
    status: "Success",
    date: "Apr 19, 2026 · 09:51 AM",
    customer: "Rohit Verma",
    commission: 25
  },
  {
    id: "TXN8K2X5R",
    service: "DTH - Tata Play",
    amount: 449,
    status: "Pending",
    date: "Apr 19, 2026 · 09:30 AM",
    customer: "10293847566",
    commission: 9.43
  },
  {
    id: "TXN8K2X4M",
    service: "AePS - Withdrawal",
    amount: 2000,
    status: "Success",
    date: "Apr 19, 2026 · 09:12 AM",
    customer: "Kavita Devi",
    commission: 12
  },
  {
    id: "TXN8K2X3J",
    service: "LPG - HP Gas",
    amount: 950,
    status: "Failed",
    date: "Apr 19, 2026 · 08:55 AM",
    customer: "Booking 778899",
    commission: 0
  },
  {
    id: "TXN8K2X1A",
    service: "Bus - Booking IRCTC",
    amount: 720,
    status: "Success",
    date: "Apr 18, 2026 · 07:21 PM",
    customer: "Sanjay K.",
    commission: 18
  }
];
