"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  IndianRupee,
  TrendingUp,
  Users,
  Wallet,
  ArrowRight,
  Monitor,
  CreditCard,
  QrCode,
  Receipt,
  Truck,
  ArrowUpRight,
  Star,
  ShieldCheck,
  Activity,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { TransactionsTable } from "@/components/dashboard/TransactionsTable";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { StatSkeleton } from "@/components/ui/Skeleton";
import { services } from "@/lib/data";
import type { Transaction } from "@/lib/data";
import type { Session } from "@/lib/auth";
import { formatINR, cn } from "@/lib/utils";
import { hrefToServiceKey, SERVICE_KEYS } from "@/lib/services/catalog";
import { useEffectiveServices } from "@/hooks/useEffectiveServices";
import type { PosMachineLimitsResponse } from "@/lib/partners/sameday-pos.types";
import type { PosVolumeSummaryResponse } from "@/app/api/pos/volume-summary/route";

/** Primary service cards shown on the retailer dashboard. */
const SERVICE_CARDS: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  gradient: string;
  glow: string;
  badge?: string;
}[] = [
  {
    title: "POS Terminal",
    description: "Manage POS terminals & settlements",
    href: "/dashboard/pos",
    icon: Monitor,
    gradient: "from-blue-500 via-blue-600 to-indigo-700",
    glow: "shadow-blue-500/30",
    badge: "Live",
  },
  {
    title: "Payment Gateway",
    description: "Collect payments & top up wallet",
    href: "/dashboard/wallet",
    icon: CreditCard,
    gradient: "from-violet-500 via-purple-600 to-fuchsia-700",
    glow: "shadow-violet-500/30",
    badge: "Popular",
  },
  {
    title: "QR Payments",
    description: "Static & dynamic UPI QR collections",
    href: "/dashboard/qr",
    icon: QrCode,
    gradient: "from-emerald-400 via-teal-500 to-cyan-600",
    glow: "shadow-emerald-500/30",
    badge: "UPI",
  },
  {
    title: "BBPS",
    description: "Credit card & utility bill payments",
    href: "/dashboard/bill-pay",
    icon: Receipt,
    gradient: "from-orange-400 via-amber-500 to-yellow-500",
    glow: "shadow-amber-500/30",
    badge: "Bills",
  },
];

// ─── POS Machine Limit Widget ──────────────────────────────────────────────────
// Compact alert shown on the main dashboard whenever any POS machine has
// exceeded its monthly transaction limit (red) or is ≥ 80 % (amber).
// Hidden when the user does not have POS service enabled.

function formatLimitINR(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function PosMachineLimitWidget({ hasPosService }: { hasPosService: boolean }) {
  const [data, setData] = useState<PosMachineLimitsResponse | null>(null);

  useEffect(() => {
    if (!hasPosService) return;
    fetch("/api/pos/machine-limits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d as PosMachineLimitsResponse); })
      .catch(() => {});
  }, [hasPosService]);

  if (!hasPosService || !data) return null;
  if (data.exceeded.length === 0 && data.warning.length === 0) return null;

  const isExceeded = data.exceeded.length > 0;
  const allItems = [...data.exceeded, ...data.warning];

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        isExceeded
          ? "border-rose-300 bg-rose-50"
          : "border-amber-200 bg-amber-50"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            isExceeded ? "bg-rose-100" : "bg-amber-100"
          )}
        >
          <ShieldAlert
            className={cn("h-5 w-5", isExceeded ? "text-rose-600" : "text-amber-600")}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className={cn("text-sm font-bold", isExceeded ? "text-rose-800" : "text-amber-800")}>
                {isExceeded
                  ? `${data.exceeded.length} POS machine${data.exceeded.length > 1 ? "s have" : " has"} exceeded the monthly limit`
                  : `${data.warning.length} POS machine${data.warning.length > 1 ? "s are" : " is"} near the monthly limit`}
              </p>
              <p className={cn("text-xs", isExceeded ? "text-rose-700" : "text-amber-700")}>
                {isExceeded
                  ? "Monthly transaction cap breached — contact your admin to adjust the limit."
                  : "80 % or more of the monthly cap used. Monitor usage carefully."}
              </p>
            </div>
            <Link
              href="/dashboard/pos?tab=machines"
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                isExceeded
                  ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                  : "bg-amber-100 text-amber-700 hover:bg-amber-200"
              )}
            >
              View machines →
            </Link>
          </div>

          {/* Machine pills */}
          <div className="mt-3 flex flex-wrap gap-2">
            {allItems.map((m) => (
              <div
                key={m.machineId}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-1.5",
                  m.limitExceeded
                    ? "border-rose-200 bg-white"
                    : "border-amber-200 bg-white"
                )}
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs font-bold text-ink-900">
                    {m.tid ?? m.serial ?? "TID —"}
                  </span>
                  {m.model && (
                    <span className="ml-1 text-[10px] text-ink-400">{m.model}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    m.limitExceeded
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700"
                  )}
                >
                  {m.limitUsedPct}% of {formatLimitINR(m.effectiveLimit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── POS Volume Widget ────────────────────────────────────────────────────────
// Shows today's and this month's POS transaction volumes side by side.
// Rendered only when the user has POS service enabled.

function PosVolumeWidget({ hasPosService }: { hasPosService: boolean }) {
  const [data, setData] = useState<PosVolumeSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasPosService) { setLoading(false); return; }
    fetch("/api/pos/volume-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d as PosVolumeSummaryResponse); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hasPosService]);

  if (!hasPosService) return null;
  if (loading) return null;
  if (!data) return null;

  return (
    <div className="relative rounded-2xl border border-ink-100 bg-white shadow-sm overflow-hidden">
      {/* Header strip */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-700" />
      <div className="relative px-5 pt-4 pb-3 flex items-center justify-between gap-2 border-b border-ink-100">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-700 text-white shadow-sm">
            <Monitor className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-ink-500">POS Terminals</p>
            <p className="text-[11px] text-ink-400">{data.machineCount} machine{data.machineCount !== 1 ? "s" : ""} assigned</p>
          </div>
        </div>
        <Link
          href="/dashboard/pos"
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
        >
          View <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 divide-x divide-ink-100">
        {/* Daily */}
        <div className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Today</p>
          <p className="mt-1 font-display text-xl font-bold text-ink-900">{formatINR(data.dailyTotal)}</p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {data.dailyCount} txn{data.dailyCount !== 1 ? "s" : ""}
          </p>
        </div>
        {/* Monthly */}
        <div className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400">This Month</p>
          <p className="mt-1 font-display text-xl font-bold text-ink-900">{formatINR(data.monthlyTotal)}</p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {data.monthlyCount} txn{data.monthlyCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

export function RetailerOverview({ session }: { session: Session }) {
  const effectiveServices = useEffectiveServices();
  const quickServices = services
    .filter((s) => {
      const key = hrefToServiceKey(s.href);
      if (!key) return true;
      return (effectiveServices ?? new Set<string>()).has(key);
    })
    .slice(0, 8);

  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(true);

  const loadTxns = useCallback(async () => {
    setLoadingTxns(true);
    try {
      const res = await fetch("/api/transactions?limit=20");
      const json = await res.json();
      if (Array.isArray(json.data)) setTxns(json.data);
    } catch {
      setTxns([]);
    } finally {
      setLoadingTxns(false);
    }
  }, []);

  useEffect(() => {
    loadTxns();
  }, [loadTxns]);

  const todays = txns.filter((t) => t.status === "Success");
  const todayVolume = todays.reduce((s, t) => s + t.amount, 0);
  const todayCount = todays.length;
  const volume14d = txns
    .filter((t) => t.status === "Success")
    .reduce((s, t) => s + t.amount, 0);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = session.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8 animate-fade-up">
      {/* ── Hero greeting banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-accent-600 p-6 text-white shadow-glow">
        {/* decorative blobs */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-1/3 h-40 w-40 rounded-full bg-accent-400/20 blur-2xl" />
        <div className="pointer-events-none absolute right-1/4 top-0 h-28 w-28 rounded-full bg-violet-400/20 blur-2xl" />

        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              NextGenPay Retailer
            </div>
            <p className="text-sm text-white/75">{greeting},</p>
            <h1 className="font-display text-3xl font-bold md:text-4xl">
              {firstName} 👋
            </h1>
            <p className="mt-1 text-sm text-white/70">
              Here&apos;s a snapshot of your shop today.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 px-4 py-2.5 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                Wallet Balance
              </p>
              <p className="font-display text-xl font-bold">
                {formatINR(session.walletBalance)}
              </p>
            </div>
            <Link
              href="/dashboard/wallet"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 transition hover:bg-white/25"
            >
              <Wallet className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loadingTxns ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <FintechStatCard
              label="Wallet Balance"
              value={formatINR(session.walletBalance)}
              icon={Wallet}
              gradient="from-brand-500 via-brand-600 to-indigo-700"
              bgLight="bg-brand-50"
              textAccent="text-brand-700"
              href="/dashboard/wallet"
              badge="Live"
            />
            <FintechStatCard
              label="Today's Volume"
              value={formatINR(todayVolume)}
              icon={IndianRupee}
              gradient="from-emerald-400 via-teal-500 to-cyan-600"
              bgLight="bg-emerald-50"
              textAccent="text-emerald-700"
            />
            <FintechStatCard
              label="Transactions Today"
              value={`${todayCount}`}
              icon={TrendingUp}
              gradient="from-violet-500 via-purple-600 to-fuchsia-600"
              bgLight="bg-violet-50"
              textAccent="text-violet-700"
            />
            <FintechStatCard
              label="Customers Served"
              value={`${txns.filter((t) => t.status === "Success").length}`}
              icon={Users}
              gradient="from-orange-400 via-amber-500 to-yellow-500"
              bgLight="bg-amber-50"
              textAccent="text-amber-700"
            />
          </>
        )}
      </div>

      {/* ── POS daily / monthly volume ── */}
      <PosVolumeWidget
        hasPosService={(effectiveServices ?? new Set<string>()).has(SERVICE_KEYS.POS)}
      />

      {/* ── POS machine transaction limit alert ── */}
      <PosMachineLimitWidget
        hasPosService={(effectiveServices ?? new Set<string>()).has(SERVICE_KEYS.POS)}
      />

      {/* ── POS Booking strip ── */}
      <PosBookingStrip />

      {/* ── Services ── */}
      <div>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-ink-900">
              Services
            </h2>
            <p className="mt-0.5 text-sm text-ink-500">
              Jump straight into a payment rail
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            RBI Compliant
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className={cn(
                  "group relative overflow-hidden rounded-2xl p-5 text-white shadow-lg transition-all duration-300",
                  "hover:-translate-y-1 hover:shadow-xl",
                  `bg-gradient-to-br ${card.gradient} ${card.glow}`
                )}
              >
                {/* bg blob */}
                <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute bottom-0 left-0 h-16 w-16 rounded-full bg-black/10 blur-xl" />

                <div className="relative flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/20 backdrop-blur-sm">
                    <Icon className="h-5 w-5" />
                  </span>
                  {card.badge && (
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm">
                      {card.badge}
                    </span>
                  )}
                </div>
                <h3 className="relative mt-4 font-display text-base font-bold">
                  {card.title}
                </h3>
                <p className="relative mt-1 text-xs leading-relaxed text-white/75">
                  {card.description}
                </p>
                <div className="relative mt-3 flex items-center gap-1 text-xs font-semibold text-white/90">
                  Open
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Volume + Get Started ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Volume chart */}
        <div className="relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-brand-50/80 blur-3xl" />
          <div className="relative flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-500" />
                <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
                  Volume · Recent
                </p>
              </div>
              <p className="mt-1 font-display text-2xl font-bold text-ink-900">
                {formatINR(volume14d)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-700">Live</span>
            </div>
          </div>
          <div className="relative mt-4">
            <Sparkline
              values={Array.from({ length: 14 }, () => 0)}
              color="#4263c7"
              height={80}
            />
          </div>
          {!loadingTxns && volume14d === 0 && (
            <p className="mt-2 text-xs text-ink-400">
              No transactions yet — your volume appears after successful live transactions.
            </p>
          )}
        </div>

        {/* Get started CTA */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-700 p-5 text-white shadow-lg">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-4 left-4 h-20 w-20 rounded-full bg-fuchsia-300/20 blur-xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm">
              <Star className="h-3 w-3 fill-yellow-300 text-yellow-300" />
              Get started
            </span>
            <p className="mt-3 font-display text-lg font-bold leading-snug">
              Run your first live transaction
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/75">
              Top up your wallet, then use Quick services below to process real payments.
            </p>
            <Link
              href="/dashboard/wallet"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur-sm transition hover:bg-white/30"
            >
              <Wallet className="h-4 w-4" />
              Open wallet
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Quick services ── */}
      <div>
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-ink-900">
              Quick Services
            </h2>
            <p className="mt-0.5 text-sm text-ink-500">
              Most-used services for fast access
            </p>
          </div>
          <Link
            href="/services"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {quickServices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/50 p-6 text-center text-sm text-ink-500">
            No services are enabled for your account yet. Contact your admin to
            get services activated.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {quickServices.map((s, idx) => {
              const Icon = s.icon;
              // cycle through vibrant accent colors
              const palette = [
                { bg: "bg-brand-50", hover: "group-hover:bg-brand-600", icon: "text-brand-700", hoverIcon: "group-hover:text-white", ring: "group-hover:border-brand-200" },
                { bg: "bg-violet-50", hover: "group-hover:bg-violet-600", icon: "text-violet-700", hoverIcon: "group-hover:text-white", ring: "group-hover:border-violet-200" },
                { bg: "bg-emerald-50", hover: "group-hover:bg-emerald-500", icon: "text-emerald-700", hoverIcon: "group-hover:text-white", ring: "group-hover:border-emerald-200" },
                { bg: "bg-amber-50", hover: "group-hover:bg-amber-500", icon: "text-amber-700", hoverIcon: "group-hover:text-white", ring: "group-hover:border-amber-200" },
                { bg: "bg-cyan-50", hover: "group-hover:bg-cyan-500", icon: "text-cyan-700", hoverIcon: "group-hover:text-white", ring: "group-hover:border-cyan-200" },
                { bg: "bg-rose-50", hover: "group-hover:bg-rose-500", icon: "text-rose-700", hoverIcon: "group-hover:text-white", ring: "group-hover:border-rose-200" },
                { bg: "bg-orange-50", hover: "group-hover:bg-orange-500", icon: "text-orange-700", hoverIcon: "group-hover:text-white", ring: "group-hover:border-orange-200" },
                { bg: "bg-indigo-50", hover: "group-hover:bg-indigo-600", icon: "text-indigo-700", hoverIcon: "group-hover:text-white", ring: "group-hover:border-indigo-200" },
              ];
              const p = palette[idx % palette.length];
              return (
                <Link
                  key={s.slug}
                  href={s.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4",
                    "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                    p.ring
                  )}
                >
                  <span
                    className={cn(
                      "grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl transition-colors duration-200",
                      p.bg,
                      p.icon,
                      p.hover,
                      p.hoverIcon
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold text-ink-900">
                      {s.title}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {s.description.slice(0, 34)}…
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Transactions ── */}
      <TransactionsTable data={txns} loading={loadingTxns} showCommission={false} />
    </div>
  );
}

/* ─────────────────────────────── Fintech Stat Card ─────────────────────────── */

function FintechStatCard({
  label,
  value,
  icon: Icon,
  gradient,
  bgLight,
  textAccent,
  href,
  badge,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  gradient: string;
  bgLight: string;
  textAccent: string;
  href?: string;
  badge?: string;
}) {
  const inner = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-4 shadow-sm",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md",
        href && "cursor-pointer"
      )}
    >
      {/* subtle top gradient strip */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r",
          gradient
        )}
      />
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            gradient
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {badge && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              bgLight,
              textAccent
            )}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-ink-500">
        {label}
      </p>
      <p className="mt-0.5 font-display text-2xl font-bold text-ink-900">{value}</p>
      {href && (
        <div className={cn("mt-2 flex items-center gap-0.5 text-[11px] font-semibold", textAccent)}>
          Manage <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      )}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

/* ─────────────────────────────── POS Booking Strip ─────────────────────────── */

type StripBooking = {
  id: string;
  status: "APPLIED" | "ASSIGNED" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
  statusLabel: string;
  stepIndex: number;
  plan: { name: string };
  machine: { tid: string | null; serial: string | null } | null;
};

const STRIP_STEPS = ["Applied", "Assigned", "Dispatched", "Delivered"];

function PosBookingStrip() {
  const [booking, setBooking] = useState<StripBooking | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/pos/booking")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.bookings) return;
        const list = d.bookings as StripBooking[];
        const active = list.find(
          (b) => b.status !== "DELIVERED" && b.status !== "CANCELLED"
        );
        setBooking(active ?? list[0] ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!booking || booking.status === "CANCELLED") return null;

  const machineLabel =
    booking.machine?.tid ?? booking.machine?.serial ?? null;
  const delivered = booking.status === "DELIVERED";

  return (
    <Link
      href="/dashboard/pos-booking"
      className="group flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow-soft sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-11 w-11 place-items-center rounded-xl text-white shadow-soft",
            delivered
              ? "bg-gradient-to-br from-emerald-400 to-emerald-600"
              : "bg-gradient-to-br from-brand-600 to-accent-500"
          )}
        >
          <Truck className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
            POS Booking
          </p>
          <p className="font-display text-sm font-semibold text-ink-900">
            {booking.plan.name} · {booking.statusLabel}
            {machineLabel && (
              <span className="ml-1 font-mono text-xs text-ink-500">
                ({machineLabel})
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {STRIP_STEPS.map((label, i) => {
            const done = i <= booking.stepIndex;
            return (
              <div key={label} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    done
                      ? delivered
                        ? "bg-emerald-500"
                        : "bg-brand-500"
                      : "bg-ink-200"
                  )}
                />
                {i < STRIP_STEPS.length - 1 && (
                  <span
                    className={cn(
                      "h-0.5 w-6 rounded-full",
                      i < booking.stepIndex
                        ? delivered
                          ? "bg-emerald-500"
                          : "bg-brand-500"
                        : "bg-ink-200"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
        <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-1 group-hover:text-brand-600" />
      </div>
    </Link>
  );
}
