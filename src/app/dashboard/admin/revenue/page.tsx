"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatSkeleton } from "@/components/ui/Skeleton";
import { PageSpinner } from "@/components/ui/Spinner";
import { formatINR, formatNumber } from "@/lib/utils";
import { RefreshCw, Download } from "lucide-react";
import { downloadCSV, type ReportColumn } from "@/lib/reports";

type ServiceRow = {
  service: string;
  txnCount: number;
  totalVolume: number;
  totalCharge: number;
  grossCommission: number;
  tdsCollected: number;
  netCommission: number;
  platformRevenue: number;
};

type TierRow = {
  tier: string;
  gross: number;
  tds: number;
  net: number;
  creditCount: number;
};

type DailyRow = {
  date: string;
  txnCount: number;
  totalVolume: number;
  totalCharge: number;
  grossCommission: number;
  tdsCollected: number;
  netCommission: number;
  platformRevenue: number;
};

type RevenueData = {
  from: string;
  to: string;
  byService: ServiceRow[];
  byTier: TierRow[];
  byDay: DailyRow[];
  totals: {
    txnCount: number;
    totalVolume: number;
    totalCharge: number;
    grossCommission: number;
    tdsCollected: number;
    netCommission: number;
    platformRevenue: number;
  };
};

const inputCls =
  "rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p
        className={`mt-1 text-xl font-bold ${
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-ink-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const TIER_LABELS: Record<string, string> = {
  RETAILER: "Retailer",
  DISTRIBUTOR: "Distributor",
  MASTER: "Master Distributor",
  SUPER: "Super Distributor",
};

function todayIST(): string {
  const d = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
  return d.toISOString().slice(0, 10);
}

export default function RevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(todayIST);
  const [to, setTo] = useState(todayIST);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }, [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/revenue?${buildParams()}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Failed to load report");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const serviceColumns: Column<ServiceRow>[] = [
    {
      key: "service",
      header: "Service",
      render: (r) => <span className="font-semibold">{r.service.replace(/_/g, " ")}</span>,
    },
    { key: "txnCount", header: "Txns", render: (r) => <span>{formatNumber(r.txnCount)}</span> },
    {
      key: "totalVolume",
      header: "Volume",
      render: (r) => <span className="font-semibold">{formatINR(r.totalVolume)}</span>,
    },
    { key: "totalCharge", header: "Charges", render: (r) => <span>{formatINR(r.totalCharge)}</span> },
    {
      key: "grossCommission",
      header: "Gross Commission",
      render: (r) => <span>{formatINR(r.grossCommission)}</span>,
    },
    {
      key: "tdsCollected",
      header: "TDS (2%)",
      render: (r) => <span className="text-ink-500">{formatINR(r.tdsCollected)}</span>,
    },
    {
      key: "netCommission",
      header: "Net Commission",
      render: (r) => <span>{formatINR(r.netCommission)}</span>,
    },
    {
      key: "platformRevenue",
      header: "Platform Revenue",
      render: (r) => (
        <span className={`font-bold ${r.platformRevenue >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {formatINR(r.platformRevenue)}
        </span>
      ),
    },
  ];

  const tierColumns: Column<TierRow>[] = [
    {
      key: "tier",
      header: "Tier",
      render: (r) => (
        <Badge variant="default">{TIER_LABELS[r.tier] ?? r.tier}</Badge>
      ),
    },
    { key: "creditCount", header: "Credits", render: (r) => <span>{formatNumber(r.creditCount)}</span> },
    {
      key: "gross",
      header: "Gross",
      render: (r) => <span className="font-semibold">{formatINR(r.gross)}</span>,
    },
    {
      key: "tds",
      header: "TDS Deducted",
      render: (r) => <span className="text-ink-500">{formatINR(r.tds)}</span>,
    },
    {
      key: "net",
      header: "Net Credited",
      render: (r) => <span className="font-bold text-emerald-600">{formatINR(r.net)}</span>,
    },
  ];

  const dailyColumns: Column<DailyRow>[] = [
    { key: "date", header: "Date", render: (r) => <span className="font-medium">{r.date}</span> },
    { key: "txnCount", header: "Txns", render: (r) => <span>{formatNumber(r.txnCount)}</span> },
    {
      key: "totalVolume",
      header: "Volume",
      render: (r) => <span className="font-semibold">{formatINR(r.totalVolume)}</span>,
    },
    { key: "totalCharge", header: "Charges", render: (r) => <span>{formatINR(r.totalCharge)}</span> },
    { key: "grossCommission", header: "Gross Comm.", render: (r) => <span>{formatINR(r.grossCommission)}</span> },
    {
      key: "tdsCollected",
      header: "TDS",
      render: (r) => <span className="text-ink-500">{formatINR(r.tdsCollected)}</span>,
    },
    { key: "netCommission", header: "Net Comm.", render: (r) => <span>{formatINR(r.netCommission)}</span> },
    {
      key: "platformRevenue",
      header: "Platform Revenue",
      render: (r) => (
        <span className={`font-bold ${r.platformRevenue >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {formatINR(r.platformRevenue)}
        </span>
      ),
    },
  ];

  const csvServiceCols: ReportColumn<ServiceRow>[] = [
    { key: "service", header: "Service" },
    { key: "txnCount", header: "Transactions", format: "int" },
    { key: "totalVolume", header: "Volume", format: "money" },
    { key: "totalCharge", header: "Charges Collected", format: "money" },
    { key: "grossCommission", header: "Gross Commission", format: "money" },
    { key: "tdsCollected", header: "TDS (2%)", format: "money" },
    { key: "netCommission", header: "Net Commission", format: "money" },
    { key: "platformRevenue", header: "Platform Revenue", format: "money" },
  ];

  const maxRevenue = Math.max(1, ...(data?.byDay ?? []).map((d) => Math.abs(d.platformRevenue)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue & Commission Report"
        description="Platform revenue, commission distribution by service and tier, and daily trend — admin-only view."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-ink-500">
              From
              <input
                type="date"
                className={`${inputCls} mt-1 block`}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-xs text-ink-500">
              To
              <input
                type="date"
                className={`${inputCls} mt-1 block`}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <Button onClick={load} isLoading={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Apply
            </Button>
            {data && (
              <Button
                variant="outline"
                onClick={() =>
                  downloadCSV(
                    `revenue-report-${data.from}-to-${data.to}.csv`,
                    data.byService,
                    csvServiceCols
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
      )}

      {loading && !data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatSkeleton key={i} />
            ))}
          </div>
          <PageSpinner label="Loading revenue report…" />
        </div>
      )}

      {data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Transactions" value={formatNumber(data.totals.txnCount)} />
            <Stat label="Total Volume" value={formatINR(data.totals.totalVolume)} />
            <Stat label="Charges Collected" value={formatINR(data.totals.totalCharge)} />
            <Stat
              label="Platform Revenue"
              value={formatINR(data.totals.platformRevenue)}
              tone={data.totals.platformRevenue >= 0 ? "good" : "bad"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Gross Commission" value={formatINR(data.totals.grossCommission)} />
            <Stat label="TDS Collected (2%)" value={formatINR(data.totals.tdsCollected)} />
            <Stat label="Net Commission Paid" value={formatINR(data.totals.netCommission)} />
            <Stat
              label="Revenue = Charges − Gross Comm."
              value={formatINR(data.totals.platformRevenue)}
              tone="good"
            />
          </div>

          {/* Daily revenue trend */}
          {data.byDay.length > 1 && (
            <div className="rounded-2xl border border-ink-100 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-ink-800">Daily platform revenue</p>
              <div className="flex h-40 items-end gap-1 overflow-x-auto">
                {data.byDay.map((d) => (
                  <div
                    key={d.date}
                    className="group relative flex min-w-[14px] flex-1 flex-col items-center justify-end"
                  >
                    <div
                      className={`w-full rounded-t transition ${
                        d.platformRevenue >= 0
                          ? "bg-emerald-500 group-hover:bg-emerald-600"
                          : "bg-rose-400 group-hover:bg-rose-500"
                      }`}
                      style={{
                        height: `${Math.max(3, (Math.abs(d.platformRevenue) / maxRevenue) * 100)}%`,
                      }}
                    />
                    <div className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-lg bg-ink-900 px-2 py-1 text-[10px] text-white group-hover:block">
                      {d.date} · Revenue {formatINR(d.platformRevenue)} · {d.txnCount} txns
                    </div>
                  </div>
                ))}
              </div>
              {data.byDay.length > 0 && (
                <div className="mt-2 flex justify-between text-[10px] text-ink-400">
                  <span>{data.byDay[0].date}</span>
                  <span>{data.byDay[data.byDay.length - 1].date}</span>
                </div>
              )}
            </div>
          )}

          {/* Service-wise breakdown */}
          <div>
            <p className="mb-3 text-sm font-semibold text-ink-800">
              Revenue by service
            </p>
            <DataTable columns={serviceColumns} data={data.byService} loading={loading} />
          </div>

          {/* Commission by tier */}
          <div>
            <p className="mb-3 text-sm font-semibold text-ink-800">
              Commission by tier
            </p>
            <DataTable columns={tierColumns} data={data.byTier} loading={loading} />
          </div>

          {/* Daily breakdown table */}
          {data.byDay.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-ink-800">
                Daily breakdown
              </p>
              <DataTable columns={dailyColumns} data={data.byDay} loading={loading} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
