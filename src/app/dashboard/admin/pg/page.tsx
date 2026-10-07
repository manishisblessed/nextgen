"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Store, IndianRupee, Percent, RefreshCw, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/utils";

type Period = "today" | "week" | "month" | "year";

type PgTxn = {
  ref: string;
  orderId: string | null;
  userCode: string | null;
  name: string;
  shopName: string | null;
  gross: number;
  mdr: number;
  vendor: number;
  margin: number;
  net: number;
  paymentMode: string | null;
  provider: string | null;
  mode: string;
  status: string;
  settledAt: string | null;
  createdAt: string;
};

type PgRetailer = {
  userId: string;
  userCode: string | null;
  name: string;
  shopName: string | null;
  role: string;
  count: number;
  gross: number;
  net: number;
  margin: number;
  lastAt: string | null;
};

type TopupRow = {
  refId: string;
  userCode: string | null;
  name: string;
  shopName: string | null;
  amount: number;
  partner: string | null;
  createdAt: string;
};

type PgReport = {
  period: Period;
  since: string;
  asOf: string;
  stats: {
    count: number;
    gmv: number;
    mdrTotal: number;
    vendorTotal: number;
    mdrRevenue: number;
    netSettled: number;
    settledCount: number;
    pendingCount: number;
    failedCount: number;
    successRate: number | null;
    activeRetailers: number;
  };
  transactions: PgTxn[];
  byRetailer: PgRetailer[];
  topups: { totalCount: number; totalAmount: number; rows: TopupRow[] };
};

const PERIOD_LABEL: Record<Period, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
};

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

function statusBadge(status: string) {
  const v =
    status === "SETTLED" ? "success" : status === "PENDING" ? "warning" : status === "FAILED" ? "danger" : "brand";
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <Badge variant={v}>{label}</Badge>;
}

type Tab = "settlements" | "retailers" | "topups";

export default function AdminPgPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [tab, setTab] = useState<Tab>("settlements");
  const [data, setData] = useState<PgReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pg?period=${period}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load PG data");
      setData(json as PgReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats;

  const txnCols: Column<PgTxn>[] = [
    {
      key: "ref",
      header: "Reference",
      render: (r) => (
        <div className="leading-tight">
          <span className="font-mono text-xs text-ink-900">{r.ref}</span>
          {r.orderId && <p className="font-mono text-[10px] text-ink-400">{r.orderId}</p>}
        </div>
      ),
    },
    {
      key: "name",
      header: "Retailer",
      render: (r) => (
        <div className="leading-tight">
          <p className="font-semibold text-ink-900">{r.name}</p>
          <p className="text-xs text-ink-500">
            {r.userCode ?? "—"}
            {r.shopName ? ` · ${r.shopName}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "paymentMode",
      header: "Mode",
      render: (r) => (
        <div className="leading-tight text-xs">
          <span className="font-medium text-ink-800">{r.paymentMode ?? "—"}</span>
          <p className="text-[10px] text-ink-400">{r.provider ?? ""}</p>
        </div>
      ),
    },
    { key: "gross", header: "Gross", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.gross)}</span> },
    {
      key: "mdr",
      header: "MDR",
      align: "right",
      render: (r) => (
        <div className="leading-tight">
          <span className="text-ink-800">{formatINR(r.mdr)}</span>
          <p className="text-[10px] text-emerald-600">+{formatINR(r.margin)} rev</p>
        </div>
      ),
    },
    { key: "net", header: "Net credited", align: "right", render: (r) => <span className="font-semibold text-brand-700">{formatINR(r.net)}</span> },
    { key: "status", header: "Status", render: (r) => statusBadge(r.status) },
    { key: "createdAt", header: "When", render: (r) => <span className="text-xs text-ink-500">{fmtDateTime(r.createdAt)}</span> },
  ];

  const retailerCols: Column<PgRetailer>[] = [
    {
      key: "name",
      header: "Retailer",
      render: (r) => (
        <div className="leading-tight">
          <p className="font-semibold text-ink-900">{r.name}</p>
          <p className="text-xs text-ink-500">
            {r.userCode ?? "—"}
            {r.shopName ? ` · ${r.shopName}` : ""}
          </p>
        </div>
      ),
    },
    { key: "count", header: "Txns", align: "right", render: (r) => <span className="font-semibold">{r.count}</span> },
    { key: "gross", header: "GMV", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.gross)}</span> },
    { key: "net", header: "Net credited", align: "right", render: (r) => formatINR(r.net) },
    { key: "margin", header: "Revenue", align: "right", render: (r) => <span className="font-semibold text-emerald-600">{formatINR(r.margin)}</span> },
    { key: "lastAt", header: "Last txn", render: (r) => <span className="text-xs text-ink-500">{fmtDateTime(r.lastAt)}</span> },
  ];

  const topupCols: Column<TopupRow>[] = [
    { key: "refId", header: "Reference", render: (r) => <span className="font-mono text-xs">{r.refId}</span> },
    {
      key: "name",
      header: "Retailer",
      render: (r) => (
        <div className="leading-tight">
          <p className="font-semibold text-ink-900">{r.name}</p>
          <p className="text-xs text-ink-500">
            {r.userCode ?? "—"}
            {r.shopName ? ` · ${r.shopName}` : ""}
          </p>
        </div>
      ),
    },
    { key: "amount", header: "Gross paid", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
    { key: "partner", header: "Gateway", render: (r) => <span className="text-xs">{r.partner ?? "—"}</span> },
    { key: "createdAt", header: "When", render: (r) => <span className="text-xs text-ink-500">{fmtDateTime(r.createdAt)}</span> },
  ];

  const tabs: Array<{ id: Tab; label: string; icon: typeof CreditCard }> = [
    { id: "settlements", label: "PG settlements", icon: CreditCard },
    { id: "retailers", label: "By retailer", icon: Users },
    { id: "topups", label: "Wallet top-ups", icon: Wallet },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Payment Gateway"
        description="Live PG acquiring — GMV, MDR revenue and settlement status across retailer wallet top-ups (Chagan Comet/Star) and every PG capture."
        actions={
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              period === p
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-ink-100 bg-white text-ink-600 hover:border-ink-200"
            }`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
        {data && <span className="ml-auto text-xs text-ink-400">Updated {fmtDateTime(data.asOf)}</span>}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active retailers" value={String(stats?.activeRetailers ?? 0)} icon={Store} accent="brand" />
        <StatCard label={`GMV (${PERIOD_LABEL[period].toLowerCase()})`} value={formatINR(stats?.gmv ?? 0)} icon={IndianRupee} accent="emerald" />
        <StatCard label="MDR revenue" value={formatINR(stats?.mdrRevenue ?? 0)} icon={Percent} accent="violet" />
        <StatCard
          label="Success rate"
          value={stats?.successRate != null ? `${stats.successRate}%` : "—"}
          icon={CreditCard}
          accent="accent"
        />
      </div>

      {stats && (
        <div className="grid gap-3 rounded-2xl border border-ink-100 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-400">Settlements</p>
            <p className="font-semibold text-ink-900">{stats.count}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-400">Net credited</p>
            <p className="font-semibold text-ink-900">{formatINR(stats.netSettled)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-400">Settled</p>
            <p className="font-semibold text-emerald-600">{stats.settledCount}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-400">Pending</p>
            <p className="font-semibold text-amber-600">{stats.pendingCount}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-400">Failed / held</p>
            <p className="font-semibold text-rose-600">{stats.failedCount}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
                active ? "border-brand-500 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "settlements" && (
        <DataTable
          title="PG settlement feed"
          description="Latest PG captures — gross collected, MDR deducted (with company revenue), and net credited."
          columns={txnCols}
          data={data?.transactions ?? []}
        />
      )}

      {tab === "retailers" && (
        <DataTable
          title="By retailer"
          description="PG volume per retailer in the selected period, ranked by GMV."
          columns={retailerCols}
          data={data?.byRetailer ?? []}
        />
      )}

      {tab === "topups" && (
        <DataTable
          title={`Wallet top-ups${data ? ` — ${data.topups.totalCount} · ${formatINR(data.topups.totalAmount)}` : ""}`}
          description="Genuine retailer wallet top-ups (TOPUP references) in the selected period."
          columns={topupCols}
          data={data?.topups.rows ?? []}
        />
      )}
    </div>
  );
}
