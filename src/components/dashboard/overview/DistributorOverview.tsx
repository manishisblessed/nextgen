"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Users,
  IndianRupee,
  HandCoins,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Session } from "@/lib/auth";
import { formatINR } from "@/lib/utils";

type NetworkRow = {
  id: string;
  name: string;
  shop: string;
  city: string;
  state: string;
  status: string;
  walletBalance: number;
  monthlyTurnover: number;
};

type FundRow = {
  id: string;
  amount: number;
  mode: string;
  utr: string | null;
  status: string;
  requester: { name: string };
};

export function DistributorOverview({ session }: { session: Session }) {
  const [retailers, setRetailers] = useState<NetworkRow[]>([]);
  const [pending, setPending] = useState<FundRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [netRes, fundRes] = await Promise.all([
        fetch("/api/network"),
        fetch("/api/fund-request"),
      ]);
      const net = await netRes.json().catch(() => ({}));
      const funds = await fundRes.json().catch(() => ({}));
      if (Array.isArray(net.users)) setRetailers(net.users);
      if (Array.isArray(funds.requests)) {
        setPending(
          funds.requests.filter(
            (f: FundRow) => f.status === "PENDING" || f.status === "Pending"
          )
        );
      }
    } catch {
      // keep empty live state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mtdTurnover = retailers.reduce((s, r) => s + (r.monthlyTurnover ?? 0), 0);
  const firstName = session.name?.split(" ")[0] ?? "Your";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Distributor desk</p>
          <h1 className="heading-md mt-1">{firstName}&apos;s network</h1>
          <p className="mt-1 text-sm text-ink-600">
            {retailers.length} retailers · {formatINR(mtdTurnover)} this month
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
        <StatCard
          label="Active Retailers"
          value={loading ? "…" : `${retailers.length}`}
          icon={Users}
          accent="brand"
        />
        <StatCard
          label="Network Wallet"
          value={formatINR(session.walletBalance)}
          icon={HandCoins}
          accent="violet"
        />
        <StatCard
          label="Override Earnings"
          value={formatINR(0)}
          icon={IndianRupee}
          accent="emerald"
        />
        <StatCard
          label="Network Turnover (MTD)"
          value={formatINR(mtdTurnover)}
          icon={TrendingUp}
          accent="accent"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-ink-100 bg-white p-5 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
                Network turnover · last 14 days
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-ink-900">
                {formatINR(mtdTurnover)}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Sparkline
              values={Array.from({ length: 14 }, () => 0)}
              color="#7c3aed"
              height={80}
            />
          </div>
          {!loading && mtdTurnover === 0 && (
            <p className="mt-2 text-xs text-ink-500">
              No turnover yet — updates as retailers process live transactions.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
            Pending fund requests
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-ink-900">
            {loading ? "…" : pending.length}
          </p>
          {pending.length === 0 && !loading ? (
            <p className="mt-4 text-sm text-ink-500">No pending requests.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {pending.slice(0, 3).map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-xl border border-ink-100 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink-900">
                      {f.requester?.name ?? "Retailer"}
                    </p>
                    <p className="text-xs text-ink-500">
                      {f.mode}
                      {f.utr ? ` · ${f.utr}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-bold text-ink-900">
                      {formatINR(f.amount)}
                    </span>
                    <Link
                      href="/dashboard/funds-request"
                      className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                      aria-label="Review"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Link>
                    <Link
                      href="/dashboard/funds-request"
                      className="grid h-7 w-7 place-items-center rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white"
                      aria-label="Review"
                    >
                      <XCircle className="h-4 w-4" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
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
          <Link
            href="/dashboard/network"
            className="text-xs font-semibold text-brand-700 hover:underline"
          >
            Manage all
          </Link>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading retailers…
          </div>
        ) : retailers.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-ink-500">
            No retailers yet. Onboard a retailer to start live transactions.
          </div>
        ) : (
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
              {[...retailers]
                .sort((a, b) => b.monthlyTurnover - a.monthlyTurnover)
                .map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50/40">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-ink-900">{r.name}</div>
                      <div className="text-xs text-ink-500">
                        {r.shop} · {r.id.slice(0, 10)}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-600">
                      {r.city}, {r.state}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={
                          r.status === "Active"
                            ? "success"
                            : r.status === "Pending KYC"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {formatINR(r.walletBalance)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-700">
                      {formatINR(r.monthlyTurnover)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
