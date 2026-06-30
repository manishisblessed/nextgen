"use client";

import { useEffect, useState } from "react";
import {
  User,
  MapPin,
  Phone,
  Mail,
  Store,
  Shield,
  Activity,
  TrendingUp,
  Clock,
  Users,
  Wallet,
  CheckCircle2,
  XCircle,
  Globe,
  CalendarDays,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { formatINR } from "@/lib/utils";

type PerformanceData = {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    status: string;
    shopName: string | null;
    shopAddress: string | null;
    pincode: string | null;
    state: string | null;
    city: string | null;
    walletBalance: number;
    lastLoginLat: number | null;
    lastLoginLng: number | null;
    lastLoginAt: string | null;
    twoFactorEnabled: boolean;
    createdAt: string;
    _count: { transactions: number; wallet: number; children: number };
  };
  parentInfo: { name: string; email: string; phone: string; role: string } | null;
  loginHistory: {
    id: string;
    meta: { lat?: number; lng?: number; accuracy?: number } | null;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
  }[];
  stats: {
    totalTransactions30d: number;
    totalAmount30d: number;
    successfulTxns: number;
    failedTxns: number;
    successRate: number;
    networkSize: number;
    walletTransactions: number;
  };
};

function roleBadgeColor(role: string) {
  switch (role) {
    case "MASTER_ADMIN": return "bg-violet-100 text-violet-800";
    case "ADMIN": return "bg-ink-100 text-ink-800";
    case "SUPPORT": return "bg-slate-100 text-slate-800";
    case "SUPER_DISTRIBUTOR": return "bg-rose-100 text-rose-800";
    case "MASTER_DISTRIBUTOR": return "bg-emerald-100 text-emerald-800";
    case "DISTRIBUTOR": return "bg-blue-100 text-blue-800";
    default: return "bg-brand-100 text-brand-800";
  }
}

function statusBadgeColor(status: string) {
  switch (status) {
    case "ACTIVE": return "bg-green-100 text-green-800";
    case "SUSPENDED": return "bg-red-100 text-red-800";
    case "PENDING_KYC": return "bg-amber-100 text-amber-800";
    default: return "bg-ink-100 text-ink-800";
  }
}

function formatRole(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard/performance")
      .then((res) => res.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load performance data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
        {error || "Something went wrong"}
      </div>
    );
  }

  const { user, parentInfo, loginHistory, stats } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Performance"
        title="User Details & Activity"
        description="Your account information, login history, and transaction performance at a glance."
      />

      {/* User Identity Card */}
      <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start gap-6">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
            <User className="h-8 w-8" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-bold text-ink-900">{user.name}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadgeColor(user.role)}`}>
                {formatRole(user.role)}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeColor(user.status)}`}>
                {user.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-ink-600">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {user.email}
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {user.phone}
              </span>
              {user.city && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {user.city}, {user.state}
                </span>
              )}
            </div>
            {user.shopName && (
              <div className="flex items-center gap-1.5 text-sm text-ink-500">
                <Store className="h-3.5 w-3.5" />
                {user.shopName} {user.shopAddress && `· ${user.shopAddress}`} {user.pincode && `· ${user.pincode}`}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-ink-400">
              <CalendarDays className="h-3.5 w-3.5" />
              Member since {new Date(user.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-500">Wallet Balance</p>
            <p className="font-display text-2xl font-bold text-ink-900">{formatINR(user.walletBalance)}</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Activity}
          label="Transactions (30d)"
          value={stats.totalTransactions30d.toLocaleString("en-IN")}
          color="brand"
        />
        <StatCard
          icon={TrendingUp}
          label="Turnover (30d)"
          value={formatINR(stats.totalAmount30d)}
          color="emerald"
        />
        <StatCard
          icon={CheckCircle2}
          label="Success Rate"
          value={`${stats.successRate}%`}
          sub={`${stats.successfulTxns} passed · ${stats.failedTxns} failed`}
          color="green"
        />
        <StatCard
          icon={Users}
          label="Network Size"
          value={stats.networkSize.toLocaleString("en-IN")}
          sub={`${stats.walletTransactions} wallet txns`}
          color="blue"
        />
      </div>

      {/* Security & 2FA Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
            <Shield className="h-4 w-4 text-brand-600" />
            Security Status
          </h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-2.5">
              <span className="text-sm text-ink-700">Two-Factor Auth</span>
              <span className={`flex items-center gap-1 text-xs font-semibold ${user.twoFactorEnabled ? "text-green-700" : "text-red-600"}`}>
                {user.twoFactorEnabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {user.twoFactorEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-2.5">
              <span className="text-sm text-ink-700">Last Login Location</span>
              <span className="flex items-center gap-1 text-xs font-medium text-ink-600">
                <Globe className="h-3.5 w-3.5" />
                {user.lastLoginLat && user.lastLoginLng
                  ? `${user.lastLoginLat.toFixed(4)}, ${user.lastLoginLng.toFixed(4)}`
                  : "Not available"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-2.5">
              <span className="text-sm text-ink-700">Last Login Time</span>
              <span className="flex items-center gap-1 text-xs font-medium text-ink-600">
                <Clock className="h-3.5 w-3.5" />
                {user.lastLoginAt
                  ? new Date(user.lastLoginAt).toLocaleString("en-IN")
                  : "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* Parent/Upline Info */}
        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
            <Users className="h-4 w-4 text-brand-600" />
            {parentInfo ? "Upline / Parent" : "Account Hierarchy"}
          </h3>
          <div className="mt-4 space-y-3">
            {parentInfo ? (
              <>
                <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-2.5">
                  <span className="text-sm text-ink-700">Name</span>
                  <span className="text-xs font-medium text-ink-800">{parentInfo.name}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-2.5">
                  <span className="text-sm text-ink-700">Role</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadgeColor(parentInfo.role)}`}>
                    {formatRole(parentInfo.role)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-2.5">
                  <span className="text-sm text-ink-700">Contact</span>
                  <span className="text-xs font-medium text-ink-600">{parentInfo.phone}</span>
                </div>
              </>
            ) : (
              <div className="flex h-24 items-center justify-center rounded-lg bg-ink-50 text-sm text-ink-500">
                You are a top-level account — no upline assigned.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Login History */}
      <div className="rounded-2xl border border-ink-100 bg-white p-5">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
          <Clock className="h-4 w-4 text-brand-600" />
          Recent Login Activity
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-[10px] font-bold uppercase tracking-widest text-ink-500">
                <th className="px-3 py-2">Date & Time</th>
                <th className="px-3 py-2">IP Address</th>
                <th className="px-3 py-2">Location (Lat, Lng)</th>
                <th className="px-3 py-2">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {loginHistory.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-ink-400">
                    No login history available yet.
                  </td>
                </tr>
              ) : (
                loginHistory.map((entry) => {
                  const meta = entry.meta as { lat?: number; lng?: number } | null;
                  const ua = entry.userAgent || "Unknown";
                  const shortDevice = ua.length > 50 ? ua.slice(0, 50) + "..." : ua;
                  return (
                    <tr key={entry.id} className="hover:bg-ink-25">
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-800">
                        {new Date(entry.createdAt).toLocaleString("en-IN")}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-ink-600">
                        {entry.ip || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-ink-600">
                        {meta?.lat && meta?.lng
                          ? `${meta.lat.toFixed(4)}, ${meta.lng.toFixed(4)}`
                          : "—"}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-ink-500">
                        {shortDevice}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  const bgMap: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    green: "bg-green-50 text-green-600",
    blue: "bg-blue-50 text-blue-600",
  };

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${bgMap[color] || bgMap.brand}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-500">{label}</p>
      </div>
      <p className="mt-2 font-display text-xl font-bold text-ink-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}
