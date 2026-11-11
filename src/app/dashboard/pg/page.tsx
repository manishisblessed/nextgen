"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  IndianRupee,
  ArrowLeftRight,
  Percent,
  Banknote,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/utils";

type PgStats = {
  todayCollections: number;
  todayVolume: number;
  todayFees: number;
  successRate: number;
  pendingSettlement: number;
  pendingCount: number;
};

type PgTxn = {
  id: string;
  txnId: string;
  orderId: string;
  mode: string;
  amount: number;
  fee: number;
  net: number;
  status: string;
  settlement: string;
  gateway: string;
  date: string;
  settledAt: string | null;
};

type PgOverview = {
  stats: PgStats;
  transactions: PgTxn[];
  total: number;
  page: number;
  pageSize: number;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "brand"> = {
  SETTLED: "success",
  PENDING: "warning",
  FAILED: "danger",
};

const GATEWAY_LABELS: Record<string, string> = {
  CHAGANS_COMET: "Comet",
  CHAGANS_STAR: "Star",
  RAZORPAY: "Razorpay",
  VIABLE_PG: "Viable",
  BULKPE_PG: "BulkPe",
};

export default function PgPage() {
  const [data, setData] = useState<PgOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async (p = 1) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/pg/overview?page=${p}`);
      if (res.ok) {
        const d = (await res.json()) as PgOverview;
        setData(d);
        setPage(d.page);
      }
    } catch {
      /* silently fail — stats just stay stale */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = data?.stats;
  const transactions = data?.transactions ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payment Gateway"
        title="PG Collections"
        description="Track your wallet top-ups and PG collections with real-time status, fees and settlement."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's Collections"
          value={stats ? formatINR(stats.todayVolume) : "—"}
          icon={IndianRupee}
          accent="brand"
        />
        <StatCard
          label="Success Rate"
          value={stats ? `${stats.successRate}%` : "—"}
          icon={Percent}
          accent="emerald"
        />
        <StatCard
          label="Transactions Today"
          value={stats ? String(stats.todayCollections) : "—"}
          icon={ArrowLeftRight}
          accent="violet"
        />
        <StatCard
          label="Pending Settlement"
          value={stats ? formatINR(stats.pendingSettlement) : "—"}
          icon={Banknote}
          accent="accent"
        />
      </div>

      {/* Recent PG transactions — real data from PgSettlementEntry */}
      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">
              Recent PG transactions
            </h3>
            <p className="text-xs text-ink-500">
              {total > 0
                ? `${total} total collection${total === 1 ? "" : "s"}`
                : "No PG collections yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchData(page)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <CreditCard className="mx-auto h-10 w-10 text-ink-300" />
            <p className="mt-3 text-sm font-medium text-ink-700">No collections yet</p>
            <p className="mt-1 text-xs text-ink-500">
              Top up your wallet via the Payment Gateway to see your collections here.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Txn ID</th>
                    <th className="px-5 py-3 font-semibold">Gateway</th>
                    <th className="px-5 py-3 font-semibold">Mode</th>
                    <th className="px-5 py-3 font-semibold text-right">Amount</th>
                    <th className="px-5 py-3 font-semibold text-right">Fee</th>
                    <th className="px-5 py-3 font-semibold text-right">Net</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 text-ink-800">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-ink-50/40">
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-ink-500">
                        {new Date(t.date).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">{t.txnId}</td>
                      <td className="px-5 py-3 text-xs">
                        {GATEWAY_LABELS[t.gateway] ?? t.gateway}
                      </td>
                      <td className="px-5 py-3 text-xs">{t.mode}</td>
                      <td className="px-5 py-3 text-right font-semibold">
                        {formatINR(t.amount)}
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-rose-600">
                        {t.fee > 0 ? `−${formatINR(t.fee)}` : "—"}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-700">
                        {formatINR(t.net)}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={STATUS_VARIANT[t.status] ?? "brand"}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-ink-500">{t.settlement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-ink-100 px-5 py-3">
                <p className="text-xs text-ink-500">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => fetchData(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => fetchData(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
