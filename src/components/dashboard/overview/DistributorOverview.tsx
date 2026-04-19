"use client";

import Link from "next/link";
import {
  ArrowRight,
  Users,
  IndianRupee,
  HandCoins,
  TrendingUp,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { fundRequests, networkUsers } from "@/lib/data";
import type { Session } from "@/lib/auth";
import { formatINR } from "@/lib/utils";

export function DistributorOverview({ session }: { session: Session }) {
  const myRetailers = networkUsers.filter(
    (u) => u.role === "retailer" && u.parentId === "PPID2003"
  );
  const pending = fundRequests.filter((f) => f.status === "Pending");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Distributor desk</p>
          <h1 className="heading-md mt-1">{session.name?.split(" ")[0]}&apos;s network</h1>
          <p className="mt-1 text-sm text-ink-600">
            {myRetailers.length} retailers · ₹{(session.monthlyTurnover ?? 0).toLocaleString("en-IN")} this month
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/network/onboard">
            <Button variant="outline">
              <Users className="h-4 w-4" />
              Onboard retailer
            </Button>
          </Link>
          <Link href="/dashboard/funds-request">
            <Button>
              Approve funds
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Retailers" value={`${myRetailers.length}`} delta="+4" trend="up" icon={Users} accent="brand" />
        <StatCard label="Network Wallet" value={formatINR(session.walletBalance)} delta="+8.1%" trend="up" icon={HandCoins} accent="violet" />
        <StatCard label="Override Earnings" value={formatINR(184250)} delta="+22.4%" trend="up" icon={IndianRupee} accent="emerald" />
        <StatCard label="Network Turnover (MTD)" value={formatINR(session.monthlyTurnover ?? 0)} delta="+14.6%" trend="up" icon={TrendingUp} accent="accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-ink-100 bg-white p-5 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
                Network turnover · last 14 days
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-ink-900">
                {formatINR(7250000)}
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              +14.6%
            </span>
          </div>
          <div className="mt-4">
            <Sparkline
              values={[420000, 462000, 510000, 488000, 540000, 612000, 580000, 620000, 645000, 690000, 712000, 705000, 740000, 760000]}
              color="#7c3aed"
              height={80}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
            Pending fund requests
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-ink-900">
            {pending.length}
          </p>
          <ul className="mt-4 space-y-3">
            {pending.slice(0, 3).map((f) => (
              <li key={f.id} className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{f.fromName}</p>
                  <p className="text-xs text-ink-500">{f.mode} · {f.reference}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-bold text-ink-900">
                    {formatINR(f.amount)}
                  </span>
                  <button className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white" aria-label="Approve">
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  <button className="grid h-7 w-7 place-items-center rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white" aria-label="Reject">
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/funds-request"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">
              Top retailers
            </h3>
            <p className="text-xs text-ink-500">Sorted by monthly turnover</p>
          </div>
          <Link href="/dashboard/network" className="text-xs font-semibold text-brand-700 hover:underline">
            Manage all
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Retailer</th>
              <th className="px-5 py-3 font-semibold">City</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold text-right">Wallet</th>
              <th className="px-5 py-3 font-semibold text-right">MTD Turnover</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 text-ink-800">
            {myRetailers
              .sort((a, b) => b.monthlyTurnover - a.monthlyTurnover)
              .map((r) => (
                <tr key={r.id} className="hover:bg-ink-50/40">
                  <td className="px-5 py-3">
                    <div className="font-semibold text-ink-900">{r.name}</div>
                    <div className="text-xs text-ink-500">{r.shop} · {r.id}</div>
                  </td>
                  <td className="px-5 py-3 text-ink-600">{r.city}, {r.state}</td>
                  <td className="px-5 py-3">
                    <Badge variant={r.status === "Active" ? "success" : r.status === "Pending KYC" ? "warning" : "danger"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold">{formatINR(r.walletBalance)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-emerald-700">{formatINR(r.monthlyTurnover)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
