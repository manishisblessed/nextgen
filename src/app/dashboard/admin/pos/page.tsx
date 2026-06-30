"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  Monitor,
  IndianRupee,
  ArrowLeftRight,
  CreditCard,
  Search,
  RefreshCw,
  RefreshCcw,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  UserPlus,
  UserMinus,
  X,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn, formatINR } from "@/lib/utils";
import type {
  PosTransactionsResponse,
  PosTransaction,
  PosTransactionStatus,
  PosPaymentMode,
  LocalPosMachine,
  LocalPosMachinesResponse,
} from "@/lib/partners/sameday-pos.types";

// ── Fetchers ──

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function postFetcher([url, body]: [string, unknown]) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

// ── Helpers ──

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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Tab types ──
type Tab = "machines" | "transactions";

export default function AdminPosPage() {
  const [activeTab, setActiveTab] = useState<Tab>("transactions");

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="POS Fleet"
        description="Machine inventory, live transactions, exports and device health across all terminals."
      />

      {/* Tabs */}
      <div className="inline-flex w-full max-w-xl gap-1 rounded-xl border border-ink-100 bg-ink-50/60 p-1">
        {(["transactions", "machines"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
              activeTab === tab
                ? "bg-white text-ink-900 shadow-sm ring-1 ring-ink-100"
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);
  const [assignTarget, setAssignTarget] = useState<LocalPosMachine | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: "50" });
  if (statusFilter) params.set("status", statusFilter);
  if (search) params.set("search", search);
  if (assigneeFilter) params.set("assignee", assigneeFilter);

  const { data, error, isLoading, mutate } = useSWR<LocalPosMachinesResponse>(
    `/api/admin/pos/machines?${params}`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const machines = data?.data ?? [];
  const pagination = data?.pagination;
  const stats = data?.stats;

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/pos/machines/sync", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error ?? "Sync failed");
      } else {
        await mutate();
      }
    } catch {
      alert("Sync request failed");
    } finally {
      setSyncing(false);
    }
  }, [mutate]);

  const handleUnassign = useCallback(async (machine: LocalPosMachine) => {
    if (!confirm(`Unassign ${machine.tid ?? machine.externalId} from ${machine.assignee?.name ?? "user"}?`)) return;
    const res = await fetch("/api/admin/pos/machines/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId: machine.id, userId: null }),
    });
    const d = await res.json();
    if (!res.ok) alert(typeof d.error === "string" ? d.error : "Unassign failed");
    else mutate();
  }, [mutate]);

  const cols: Column<LocalPosMachine>[] = [
    { key: "tid", header: "TID", render: (r) => <span className="font-mono text-xs font-semibold">{r.tid ?? "—"}</span> },
    { key: "serial", header: "Serial No.", render: (r) => <span className="font-mono text-xs">{r.serial ?? "—"}</span> },
    { key: "mid", header: "MID", render: (r) => <span className="font-mono text-xs">{r.mid ?? "—"}</span> },
    { key: "model", header: "Model", render: (r) => r.model ?? "—" },
    { key: "location", header: "Location", render: (r) => r.location || "—" },
    { key: "status", header: "Status", render: (r) => machineBadge(r.status) },
    {
      key: "assignee",
      header: "Assigned To",
      render: (r) =>
        r.assignee ? (
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-ink-900">{r.assignee.name}</span>
            <span className="text-[11px] uppercase tracking-wide text-ink-400">{r.assignee.role.toLowerCase()}</span>
          </div>
        ) : (
          <Badge variant="default">Unassigned</Badge>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setAssignTarget(r)}>
            <UserPlus className="h-3.5 w-3.5" /> {r.assignee ? "Reassign" : "Assign"}
          </Button>
          {r.assignee && (
            <Button variant="ghost" size="sm" onClick={() => handleUnassign(r)} title="Unassign">
              <UserMinus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="min-w-0 space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Machines" value={stats ? String(stats.total) : "..."} icon={CreditCard} accent="violet" />
        <StatCard label="Assigned" value={stats ? String(stats.assigned) : "..."} icon={Monitor} accent="brand" />
        <StatCard label="Unassigned" value={stats ? String(stats.unassigned) : "..."} icon={ArrowLeftRight} accent="emerald" />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr,170px,170px,auto]">
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-semibold text-ink-500">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                placeholder="TID, serial, MID..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-ink-200 py-2 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-semibold text-ink-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
              <option value="decommissioned">Decommissioned</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-semibold text-ink-500">Assignment</label>
            <select
              value={assigneeFilter}
              onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="all">All machines</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" size="sm" onClick={() => mutate()} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="primary" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">Sync</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <ErrorBanner message="Failed to load POS machines." />
      ) : (
        <DataTable
          title="Terminal Inventory"
          description={
            pagination
              ? `${pagination.total} terminal${pagination.total === 1 ? "" : "s"} · page ${pagination.page} of ${pagination.totalPages}`
              : "Loading..."
          }
          columns={cols}
          data={machines}
          empty={isLoading ? "Loading machines..." : "No POS machines found. Click Sync to pull the latest inventory."}
        />
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <Paginator
          page={pagination.page}
          totalPages={pagination.totalPages}
          hasPrev={pagination.hasPrev}
          hasNext={pagination.hasNext}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      )}

      {assignTarget && (
        <AssignModal
          machine={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => { setAssignTarget(null); mutate(); }}
        />
      )}
    </div>
  );
}

// ── Assign modal: search a user and assign the machine ──

type UserSearchResult = { id: string; name: string; role: string; city: string; shop: string };

function AssignModal({
  machine,
  onClose,
  onAssigned,
}: {
  machine: LocalPosMachine;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [q, setQ] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading } = useSWR<{ users: UserSearchResult[] }>(
    `/api/admin/users?role=all&q=${encodeURIComponent(q)}&pageSize=10`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const users = data?.users ?? [];

  const assign = useCallback(async (userId: string) => {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/pos/machines/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId: machine.id, userId }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(typeof d.error === "string" ? d.error : "Assignment failed");
        setSubmitting(false);
        return;
      }
      onAssigned();
    } catch {
      setErr("Assignment request failed");
      setSubmitting(false);
    }
  }, [machine.id, onAssigned]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-ink-100 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">Assign terminal</h3>
            <p className="text-xs text-ink-500">
              {machine.tid ? `TID ${machine.tid}` : machine.externalId}
              {machine.assignee ? ` · currently with ${machine.assignee.name}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              autoFocus
              type="text"
              placeholder="Search by name, shop, city, ID..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-lg border border-ink-200 py-2 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>

          {err && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {err}
            </div>
          )}

          <div className="max-h-72 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-100">
            {isLoading && users.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ink-500">Loading users…</div>
            ) : users.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ink-500">No users found.</div>
            ) : (
              users.map((u) => {
                const isCurrent = u.id === machine.assignedUserId;
                return (
                  <button
                    key={u.id}
                    disabled={submitting || isCurrent}
                    onClick={() => assign(u.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50/50 disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-900">{u.name}</div>
                      <div className="truncate text-xs text-ink-500">
                        {u.role} · {u.shop !== "—" ? u.shop : u.city}
                      </div>
                    </div>
                    {isCurrent ? (
                      <Badge variant="success"><Check className="h-3 w-3" /> Current</Badge>
                    ) : (
                      <UserPlus className="h-4 w-4 shrink-0 text-brand-600" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
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

  const { data, error, isLoading, mutate } = useSWR<PosTransactionsResponse>(
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
      const data = await res.json();
      if (data.data?.job_id) {
        pollExport(data.data.job_id);
      } else {
        alert(data.error ?? "Export failed");
        setExporting(false);
      }
    } catch {
      alert("Export request failed");
      setExporting(false);
    }
  }, [dateFrom, dateTo, statusFilter, terminalFilter]);

  const pollExport = useCallback(async (jobId: string) => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/pos/export-status/${jobId}`);
        const d = await res.json();
        if (d.data?.job?.status === "COMPLETED" && d.data.job.file_url) {
          window.open(d.data.job.file_url, "_blank");
          setExporting(false);
          return;
        }
        if (d.data?.job?.status === "FAILED") {
          alert("Export failed. Please try again.");
          setExporting(false);
          return;
        }
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
    { key: "auth_code", header: "Auth Code", render: (r) => <span className="font-mono text-xs">{r.auth_code}</span> },
  ];

  return (
    <div className="min-w-0 space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Transactions" value={summary ? String(summary.total_transactions) : "..."} icon={ArrowLeftRight} accent="brand" />
        <StatCard label="Total Volume" value={summary ? formatINR(parseFloat(summary.total_amount)) : "..."} icon={IndianRupee} accent="emerald" />
        <StatCard label="Captured" value={summary ? String(summary.captured_count) : "..."} icon={CreditCard} accent="violet" />
        <StatCard label="Terminals Active" value={summary ? String(summary.terminal_count) : "..."} icon={Monitor} accent="accent" />
      </div>

      {/* Live indicator + filters */}
      <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold text-emerald-700">Live — refreshing every second</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("excel")} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-semibold text-ink-500">From</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-semibold text-ink-500">To</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-semibold text-ink-500">Status</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as PosTransactionStatus | ""); setPage(1); }}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400">
              <option value="">All</option>
              <option value="CAPTURED">Captured</option>
              <option value="AUTHORIZED">Authorized</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
              <option value="VOIDED">Voided</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-semibold text-ink-500">Mode</label>
            <select value={modeFilter} onChange={(e) => { setModeFilter(e.target.value as PosPaymentMode | ""); setPage(1); }}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400">
              <option value="">All</option>
              <option value="CARD">Card</option>
              <option value="UPI">UPI</option>
              <option value="NFC">NFC</option>
              <option value="BHARATQR">BharatQR</option>
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-semibold text-ink-500">Terminal</label>
            <input type="text" placeholder="TID..." value={terminalFilter}
              onChange={(e) => { setTerminalFilter(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
          </div>
          <div className="flex min-w-0 items-end">
            <Button variant="outline" size="sm" className="w-full" onClick={() => { setDateFrom(today.from); setDateTo(today.to); setPage(1); }}>
              Today
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <ErrorBanner message="Failed to load transactions." />
      ) : (
        <DataTable
          title="POS Transactions"
          description={
            pagination
              ? `${pagination.total_records} total · page ${pagination.page} of ${pagination.total_pages}`
              : "Loading..."
          }
          columns={cols}
          data={transactions}
          empty={isLoading ? "Loading transactions..." : "No transactions for the selected filters."}
        />
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <Paginator
          page={pagination.page}
          totalPages={pagination.total_pages}
          hasPrev={pagination.has_prev}
          hasNext={pagination.has_next}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
    </div>
  );
}

// ── Shared small components ──

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
