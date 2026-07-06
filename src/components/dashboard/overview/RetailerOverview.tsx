"use client";

import Link from "next/link";
import {
  IndianRupee,
  TrendingUp,
  Users,
  Wallet,
  ArrowRight,
  Plus,
  Sparkles
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { TransactionsTable } from "@/components/dashboard/TransactionsTable";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { services } from "@/lib/data";
import { Button } from "@/components/ui/Button";
import type { Session } from "@/lib/auth";
import { formatINR, cn } from "@/lib/utils";
import { hrefToServiceKey } from "@/lib/services/catalog";
import { useEffectiveServices } from "@/hooks/useEffectiveServices";

export function RetailerOverview({ session }: { session: Session }) {
  // Show only services enabled globally AND for this user (default-disabled).
  const effectiveServices = useEffectiveServices();
  const quickServices = services
    .filter((s) => {
      const key = hrefToServiceKey(s.href);
      if (!key) return true;
      return (effectiveServices ?? new Set<string>()).has(key);
    })
    .slice(0, 8);
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">{greeting},</p>
          <h1 className="heading-md mt-1">
            {session.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Here&apos;s a snapshot of your shop today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/funds-request">
            <Button variant="outline">
              <Plus className="h-4 w-4" />
              Request funds
            </Button>
          </Link>
          <Link href="/dashboard/money-transfer">
            <Button>
              Send money
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <WalletCard balance={session.walletBalance} />
        <StatCard
          label="Today's Earnings"
          value={formatINR(2184)}
          delta="+12.4%"
          trend="up"
          icon={IndianRupee}
          accent="emerald"
        />
        <StatCard
          label="Transactions Today"
          value="74"
          delta="+8"
          trend="up"
          icon={TrendingUp}
          accent="brand"
        />
        <StatCard
          label="Customers Served"
          value="1,248"
          delta="+34"
          trend="up"
          icon={Users}
          accent="violet"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-ink-100 bg-white p-5 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
                Earnings · last 14 days
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-ink-900">
                {formatINR(31482)}
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              +18.2%
            </span>
          </div>
          <div className="mt-4">
            <Sparkline
              values={[820, 1140, 980, 1320, 1480, 1280, 1620, 1580, 2120, 2284, 2450, 2840, 3120, 3210]}
              color="#185df5"
              height={80}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-dashed border-brand-200 bg-gradient-to-br from-brand-50 to-accent-50 p-5">
          <div className="flex items-center gap-2 text-brand-700">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">
              Daily challenge
            </span>
          </div>
          <p className="mt-3 font-display text-lg font-semibold text-ink-900">
            Run 10 AePS withdrawals before 6 PM
          </p>
          <p className="mt-1 text-sm text-ink-600">
            Hit the streak and unlock <strong>2× cashback</strong> on tomorrow&apos;s commissions.
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/60">
            <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500" />
          </div>
          <p className="mt-2 text-xs text-ink-600">6 / 10 completed</p>
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">
              Quick services
            </h2>
            <p className="text-sm text-ink-500">
              Most-used services for fast access
            </p>
          </div>
          <Link
            href="/services"
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            View all
          </Link>
        </div>
        {quickServices.length === 0 && (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/50 p-6 text-center text-sm text-ink-500">
            No services are enabled for your account yet. Contact your admin to
            get services activated.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {quickServices.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.slug}
                href={s.href}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft"
                )}
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-sm font-semibold text-ink-900">
                    {s.title}
                  </p>
                  <p className="text-xs text-ink-500">{s.description.slice(0, 36)}...</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <TransactionsTable />
    </div>
  );
}

function WalletCard({ balance }: { balance: number }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 p-5 text-white shadow-glow">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="flex items-start justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
          <Wallet className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest">
          NextGenPay Wallet
        </span>
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-white/80">
        Available balance
      </p>
      <p className="mt-1 font-display text-2xl font-bold">{formatINR(balance)}</p>
      <Link
        href="/dashboard/wallet"
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white/90 hover:text-white"
      >
        Manage wallet <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
