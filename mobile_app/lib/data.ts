export type Service = {
  slug: string;
  title: string;
  short: string;
  icon: string; // Ionicons name
  color: [string, string]; // gradient pair
  category: "banking" | "recharge" | "bills" | "travel";
  href: string;
};

export const services: Service[] = [
  { slug: "aeps", title: "Aadhaar Pay (AePS)", short: "Cash withdrawal & balance", icon: "finger-print-outline", color: ["#185df5", "#7c3aed"], category: "banking", href: "/services/aeps" },
  { slug: "dmt", title: "Money Transfer", short: "Send to any bank account", icon: "send-outline", color: ["#185df5", "#0ea5e9"], category: "banking", href: "/services/dmt" },
  { slug: "upi", title: "UPI Collect", short: "Generate QR / UPI link", icon: "qr-code-outline", color: ["#10b981", "#059669"], category: "banking", href: "/services/upi" },
  { slug: "wallet", title: "Wallet", short: "Top up & withdraw", icon: "wallet-outline", color: ["#f97606", "#dd5602"], category: "banking", href: "/services/wallet" },
  { slug: "virtual-account", title: "Virtual Account", short: "Personal IFSC + acct", icon: "business-outline", color: ["#7c3aed", "#a855f7"], category: "banking", href: "/services/virtual-account" },
  { slug: "mobile-recharge", title: "Mobile Recharge", short: "Jio / Airtel / Vi / BSNL", icon: "phone-portrait-outline", color: ["#10b981", "#16a34a"], category: "recharge", href: "/services/recharge" },
  { slug: "dth", title: "DTH Recharge", short: "Tata Play, Dish, d2h", icon: "tv-outline", color: ["#0ea5e9", "#2563eb"], category: "recharge", href: "/services/recharge?type=dth" },
  { slug: "broadband", title: "Broadband / OTT", short: "Postpaid & subscriptions", icon: "wifi-outline", color: ["#7c3aed", "#6366f1"], category: "recharge", href: "/services/recharge?type=broadband" },
  { slug: "electricity", title: "Electricity", short: "All state + private DISCOMs", icon: "bulb-outline", color: ["#f59e0b", "#f97606"], category: "bills", href: "/services/bills?type=electricity" },
  { slug: "water", title: "Water", short: "Municipal water bills", icon: "water-outline", color: ["#0ea5e9", "#0284c7"], category: "bills", href: "/services/bills?type=water" },
  { slug: "gas", title: "Gas (LPG / Piped)", short: "Book LPG, pay piped gas", icon: "flame-outline", color: ["#f97606", "#dc2626"], category: "bills", href: "/services/bills?type=gas" },
  { slug: "credit-card", title: "Credit Card", short: "Pay any card bill", icon: "card-outline", color: ["#185df5", "#1e40af"], category: "bills", href: "/services/bills?type=credit-card" },
  { slug: "education", title: "Education Fees", short: "School & college fees", icon: "school-outline", color: ["#7c3aed", "#9333ea"], category: "bills", href: "/services/bills?type=education" },
  { slug: "flight", title: "Flight Booking", short: "Domestic flights", icon: "airplane-outline", color: ["#0ea5e9", "#0369a1"], category: "travel", href: "/services/travel?type=flight" },
  { slug: "hotel", title: "Hotel Booking", short: "50,000+ hotels", icon: "bed-outline", color: ["#f59e0b", "#dd5602"], category: "travel", href: "/services/travel?type=hotel" },
  { slug: "bus", title: "Bus Booking", short: "AC sleeper & seater", icon: "bus-outline", color: ["#10b981", "#047857"], category: "travel", href: "/services/travel?type=bus" }
];

export type Txn = {
  id: string;
  service: string;
  amount: number;
  status: "Success" | "Pending" | "Failed";
  date: string;
  customer: string;
  commission: number;
  icon: string;
  color: string;
};

export const transactions: Txn[] = [
  { id: "TXN8K2X9P", service: "Mobile Recharge - Jio", amount: 299, status: "Success", date: "Today · 10:42 AM", customer: "98765 43210", commission: 8.97, icon: "phone-portrait-outline", color: "#10b981" },
  { id: "TXN8K2X8H", service: "Electricity - BSES", amount: 1840, status: "Success", date: "Today · 10:18 AM", customer: "Cons. 1023445", commission: 14.7, icon: "bulb-outline", color: "#f59e0b" },
  { id: "TXN8K2X6Y", service: "DMT - SBI", amount: 5000, status: "Success", date: "Today · 09:51 AM", customer: "Rohit Verma", commission: 25, icon: "send-outline", color: "#185df5" },
  { id: "TXN8K2X5R", service: "DTH - Tata Play", amount: 449, status: "Pending", date: "Today · 09:30 AM", customer: "10293847566", commission: 9.43, icon: "tv-outline", color: "#0ea5e9" },
  { id: "TXN8K2X4M", service: "AePS - Withdrawal", amount: 2000, status: "Success", date: "Today · 09:12 AM", customer: "Kavita Devi", commission: 12, icon: "finger-print-outline", color: "#7c3aed" },
  { id: "TXN8K2X3J", service: "LPG - HP Gas", amount: 950, status: "Failed", date: "Today · 08:55 AM", customer: "Booking 778899", commission: 0, icon: "flame-outline", color: "#dc2626" },
  { id: "TXN8K2X1A", service: "Bus - IRCTC", amount: 720, status: "Success", date: "Yest · 07:21 PM", customer: "Sanjay K.", commission: 18, icon: "bus-outline", color: "#10b981" }
];

export const operators = {
  mobile: ["Jio", "Airtel", "Vi", "BSNL"],
  dth: ["Tata Play", "Dish TV", "d2h", "Sun Direct", "Airtel DTH"],
  broadband: ["Jio Fiber", "Airtel Xstream", "ACT", "BSNL", "Hathway"],
  electricity: ["BSES Rajdhani", "BSES Yamuna", "Tata Power Delhi", "Adani Mumbai", "MSEB", "TANGEDCO", "PSPCL"],
  gas: ["Indane", "HP Gas", "Bharat Gas", "MGL (Piped)", "IGL (Piped)"]
};
