"use client";

import Link from "next/link";
import {
  ArrowRight,
  Network,
  Users,
  IndianRupee,
  TrendingUp,
  Globe,
  KeyRound
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { networkUsers } from "@/lib/data";
import type { Session } from "@/lib/auth";
import { formatINR } from "@/lib/utils";

export function MasterOverview({ session }: { session: Session }) {
  const isSuper = session.role === "super-distributor";
  const childLabel = isSuper ? "master distributors" : "distributors";
  const distributors = networkUsers.filter((u) => u.role === "distributor");
  const totalRetailers = distributors.reduce((s, d) => s + (d.retailers ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">
            {isSuper ? "Super distributor desk" : "Master distributor desk"}
          </p>
          <h1 className="heading-md mt-1">{session.name}</h1>
          <p className="mt-1 text-sm text-ink-600">
            {distributors.length} {childLabel} · {totalRetailers}+ retailers · API + white-label active
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/api">
            <Button variant="outline">
              <KeyRound className="h-4 w-4" />
              API keys
            </Button>
          </Link>
          <Link href="/dashboard/network/onboard">
            <Button>
              Onboard {isSuper ? "master distributor" : "distributor"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={isSuper ? "Master Distributors" : "Distributors"} value={`${distributors.length}`} delta="+1" trend="up" icon={Network} accent="brand" />
        <StatCard label="Retailers (network)" value={`${totalRetailers.toLocaleString("en-IN")}`} delta="+128" trend="up" icon={Users} accent="violet" />
        <StatCard label="Override Earnings (MTD)" value={formatINR(1842500)} delta="+19.4%" trend="up" icon={IndianRupee} accent="emerald" />
        <StatCard label="Network Turnover (MTD)" value={formatINR(session.monthlyTurnover ?? 0)} delta="+11.8%" trend="up" icon={TrendingUp} accent="accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-ink-100 bg-white p-5 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
                Network turnover · last 14 days
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-ink-900">
                {formatINR(38400000)}
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              +11.8%
            </span>
          </div>
          <div className="mt-4">
            <Sparkline
              values={[2400000, 2510000, 2620000, 2580000, 2710000, 2820000, 2780000, 2940000, 3100000, 3050000, 3210000, 3280000, 3380000, 3450000]}
              color="#f97606"
              height={80}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <div className="flex items-center gap-2 text-brand-700">
            <Globe className="h-4 w-4" />
            <p className="text-xs font-bold uppercase tracking-widest">
              White-label portal
            </p>
          </div>
          <p className="mt-3 font-display text-lg font-semibold text-ink-900">
            kapoorpay.in
          </p>
          <p className="mt-1 text-sm text-ink-600">
            Co-branded portal live for your distributors. SSL valid till Mar 2027.
          </p>
          <Link
            href="/dashboard/whitelabel"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            Manage branding <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">
              My {childLabel}
            </h3>
            <p className="text-xs text-ink-500">Direct child {childLabel} with override earnings</p>
          </div>
          <Link href="/dashboard/network" className="text-xs font-semibold text-brand-700 hover:underline">
            View tree
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Distributor</th>
              <th className="px-5 py-3 font-semibold">Region</th>
              <th className="px-5 py-3 font-semibold">Retailers</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold text-right">Wallet</th>
              <th className="px-5 py-3 font-semibold text-right">MTD Turnover</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 text-ink-800">
            {distributors.map((d) => (
              <tr key={d.id} className="hover:bg-ink-50/40">
                <td className="px-5 py-3">
                  <div className="font-semibold text-ink-900">{d.name}</div>
                  <div className="text-xs text-ink-500">{d.shop} · {d.id}</div>
                </td>
                <td className="px-5 py-3 text-ink-600">{d.city}, {d.state}</td>
                <td className="px-5 py-3 font-semibold">{d.retailers}</td>
                <td className="px-5 py-3">
                  <Badge variant={d.status === "Active" ? "success" : d.status === "Pending KYC" ? "warning" : "danger"}>
                    {d.status}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-right font-semibold">{formatINR(d.walletBalance)}</td>
                <td className="px-5 py-3 text-right font-semibold text-emerald-700">{formatINR(d.monthlyTurnover)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
