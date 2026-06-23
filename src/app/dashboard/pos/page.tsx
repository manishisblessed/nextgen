"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  Monitor,
  IndianRupee,
  ArrowLeftRight,
  CreditCard,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn, formatINR } from "@/lib/utils";
import type {
  PosTransactionsResponse,
  PosMachinesResponse,
  PosTransaction,
  PosMachine,
  PosTransactionStatus,
  PosPaymentMode,
} from "@/lib/partners/sameday-pos.types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function postFetcher([url, body]: [string, unknown]) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function todayRange() {
  const today = new Date().toISOString().slice(0, 10);
  return { from: today, to: today };
}

function statusBadge(status: PosTransactionStatus) {
  const v: Record<PosTransactionStatus, "success" | "warning" | "danger" | "brand" | "default"> = {
    CAPTURED: "success", AUTHORIZED: "brand", FAILED: "danger", REFUNDED: "warning", VOIDED: "default",
  };
  return <Badge variant={v[status] ?? "default"}>{status}</Badge>;
}

function machineBadge(status: string) {
  const m: Record<string, "success" | "danger" | "warning" | "default"> = {
    active: "success", inactive: "default", maintenance: "warning", decommissioned: "danger",
  };
  return <Badge variant={m[status] ?? "default"}>{status}</Badge>;
}

function cleanName(name: string | null) {
  if (!name) return "—";
  return name.replace(/\s*\/\s*$/, "").trim() || "—";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

type Tab = "machines" | "transactions";

export default function PosPage() {
  const [activeTab, setActiveTab] = useState<Tab>("transactions");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Point of Sale"
        title="POS Terminals"
        description="Live terminals and per-second transactions from your POS machines — powered by Same Day Solution."
        actions={
          <Button variant="outline">
            <Wrench className="h-4 w-4" /> Raise service request
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-ink-100 bg-ink-50/60 p-1">
        {(["transactions", "machines"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
              activeTab === tab
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500 hover:text-ink-700"
            )}
          >
            {tab === "transactions" ? (
              <span className="flex items-center justify-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Live Transactions</span>
            ) : (
              <span className="flex items-center justify-center gap-2"><Monitor className="h-4 w-4" /> POS Machines</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "transactions" ? <TransactionsTab /> : <MachinesTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MACHINES TAB
// ═══════════════════════════════════════════════════════════════════════

function MachinesTab() {
  const [page, setPage] = useState(1);

  const { data, error, isLoading, mutate } = useSWR<PosMachinesResponse>(
    `/api/pos/machines?page=${page}&limit=50`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const machines = data?.data ?? [];
  const pagination = data?.pagination;
  const active = machines.filter((m) => m.status === "active").length;

  const cols: Column<PosMachine>[] = [
    { key: "tid", header: "TID", render: (r) => <span className="font-mono text-xs font-semibold">{r.tid}</span> },
    { key: "serial_number", header: "Serial No.", render: (r) => <span className="font-mono text-xs">{r.serial_number}</span> },
    { key: "brand", header: "Brand" },
    { key: "machine_type", header: "Type" },
    { key: "location", header: "Location", render: (r) => r.location || "—" },
    { key: "city", header: "City", render: (r) => r.city || "—" },
    { key: "status", header: "Status", render: (r) => machineBadge(r.status) },
    { key: "installation_date", header: "Installed", render: (r) => fmtDate(r.installation_date) },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Active Terminals" value={isLoading ? "..." : String(active)} icon={Monitor} accent="brand" />
        <StatCard label="Total Machines" value={isLoading ? "..." : String(pagination?.total ?? machines.length)} icon={CreditCard} accent="violet" />
        <StatCard label="On This Page" value={String(machines.length)} icon={ArrowLeftRight} accent="emerald" />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => mutate()} title="Refresh">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {error ? (
        <ErrorBanner message="Failed to load POS machines." />
      ) : (
        <DataTable
          title="My Terminals"
          description={pagination ? `${pagination.total} terminal${pagination.total === 1 ? "" : "s"} assigned to your account` : "Loading..."}
          columns={cols}
          data={machines}
          empty={isLoading ? "Loading machines..." : "No POS machines assigned yet."}
        />
      )}

      {pagination && pagination.total_pages > 1 && (
        <Paginator page={pagination.page} totalPages={pagination.total_pages}
          hasPrev={pagination.has_prev_page} hasNext={pagination.has_next_page}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TRANSACTIONS TAB — refreshes every 1 second
// ═══════════════════════════════════════════════════════════════════════

function TransactionsTab() {
  const today = todayRange();
  const defaults = defaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [statusFilter, setStatusFilter] = useState<PosTransactionStatus | "">("");
  const [modeFilter, setModeFilter] = useState<PosPaymentMode | "">("");
  const [terminalFilter, setTerminalFilter] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const body = {
    date_from: `${dateFrom}T00:00:00.000Z`,
    date_to: `${dateTo}T23:59:59.999Z`,
    status: statusFilter || null,
    payment_mode: modeFilter || null,
    terminal_id: terminalFilter || null,
    page,
    page_size: 50,
  };

  const { data, error, isLoading } = useSWR<PosTransactionsResponse>(
    ["/api/pos/transactions", body],
    postFetcher,
    { refreshInterval: 1000, revalidateOnFocus: false, keepPreviousData: true }
  );

  const handleExport = useCallback(async (format: "csv" | "excel") => {
    setExporting(true);
    try {
      const res = await fetch("/api/pos/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, date_from: dateFrom, date_to: dateTo, status: statusFilter || null, terminal_id: terminalFilter || null }),
      });
      const d = await res.json();
      if (d.data?.job_id) { pollExport(d.data.job_id); }
      else { alert(d.error ?? "Export failed"); setExporting(false); }
    } catch { alert("Export request failed"); setExporting(false); }
  }, [dateFrom, dateTo, statusFilter, terminalFilter]);

  const pollExport = useCallback(async (jobId: string) => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/pos/export-status/${jobId}`);
        const d = await res.json();
        if (d.data?.job?.status === "COMPLETED" && d.data.job.file_url) { window.open(d.data.job.file_url, "_blank"); setExporting(false); return; }
        if (d.data?.job?.status === "FAILED") { alert("Export failed."); setExporting(false); return; }
      } catch { break; }
    }
    alert("Export is taking longer than expected.");
    setExporting(false);
  }, []);

  const transactions = data?.data ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination;

  const cols: Column<PosTransaction>[] = [
    { key: "txn_time", header: "Time", render: (r) => <span className="text-xs">{fmtTime(r.txn_time)}</span> },
    { key: "terminal_id", header: "TID", render: (r) => <span className="font-mono text-xs font-semibold">{r.terminal_id}</span> },
    { key: "payment_mode", header: "Mode", render: (r) => <Badge variant="default">{r.payment_mode}</Badge> },
    { key: "card_brand", header: "Card", render: (r) => r.payment_mode === "CARD" ? `${r.card_brand} ${r.card_type}` : "—" },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold text-ink-900">{formatINR(parseFloat(r.amount))}</span> },
    { key: "status", header: "Status", render: (r) => statusBadge(r.status) },
    { key: "customer_name", header: "Customer", render: (r) => <span className="max-w-[140px] truncate block text-xs">{cleanName(r.customer_name)}</span> },
    { key: "card_number", header: "Card No.", render: (r) => r.card_number ? <span className="font-mono text-xs">{r.card_number}</span> : "—" },
    { key: "rrn", header: "RRN", render: (r) => <span className="font-mono text-xs">{r.rrn}</span> },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Transactions" value={summary ? String(summary.total_transactions) : "..."} icon={ArrowLeftRight} accent="brand" />
        <StatCard label="Total Volume" value={summary ? formatINR(parseFloat(summary.total_amount)) : "..."} icon={IndianRupee} accent="emerald" />
        <StatCard label="Captured" value={summary ? String(summary.captured_count) : "..."} icon={CreditCard} accent="violet" />
        <StatCard label="Terminals" value={summary ? String(summary.terminal_count) : "..."} icon={Monitor} accent="accent" />
      </div>

      {/* Live indicator + Filters */}
      <div className="rounded-2xl border border-ink-100 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-semibold text-emerald-700">Live — refreshing every second</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-500">From</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-500">To</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-500">Status</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as PosTransactionStatus | ""); setPage(1); }}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400">
              <option value="">All</option>
              <option value="CAPTURED">Captured</option>
              <option value="AUTHORIZED">Authorized</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
              <option value="VOIDED">Voided</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-500">Mode</label>
            <select value={modeFilter} onChange={(e) => { setModeFilter(e.target.value as PosPaymentMode | ""); setPage(1); }}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400">
              <option value="">All</option>
              <option value="CARD">Card</option>
              <option value="UPI">UPI</option>
              <option value="NFC">NFC</option>
              <option value="BHARATQR">BharatQR</option>
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setDateFrom(today.from); setDateTo(today.to); setPage(1); }}>
            Today
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} CSV
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorBanner message="Failed to load transactions." />
      ) : (
        <DataTable
          title="POS Transactions"
          description={pagination ? `${pagination.total_records} total · page ${pagination.page} of ${pagination.total_pages}` : "Loading..."}
          columns={cols}
          data={transactions}
          empty={isLoading ? "Loading transactions..." : "No transactions for the selected filters."}
        />
      )}

      {pagination && pagination.total_pages > 1 && (
        <Paginator page={pagination.page} totalPages={pagination.total_pages}
          hasPrev={pagination.has_prev} hasNext={pagination.has_next}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
      )}
    </>
  );
}

// ── Shared ──

function Paginator({ page, totalPages, hasPrev, hasNext, onPrev, onNext }: {
  page: number; totalPages: number; hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev}>
        <ChevronLeft className="h-4 w-4" /> Previous
      </Button>
      <span className="text-sm text-ink-600">Page {page} of {totalPages}</span>
      <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext}>
        Next <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message} Check your connection and POS credentials.
    </div>
  );
}
