"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
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
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn, formatINR } from "@/lib/utils";
import type {
  PosTransactionsResponse,
  PosTransaction,
  PosTransactionStatus,
  PosPaymentMode,
  LocalPosMachine,
  MyPosMachinesResponse,
  PosTerminalTreeResponse,
  TerminalTreeMember,
  TerminalTreeTerminal,
} from "@/lib/partners/sameday-pos.types";

async function fetcher<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const text = await r.text();
  let json: { error?: string } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(r.ok ? "Invalid response from server" : `Request failed (${r.status})`);
  }
  if (!r.ok) throw new Error(typeof json?.error === "string" ? json.error : "Request failed");
  return json as T;
}

async function postFetcher<T>([url, body]: readonly [string, unknown]): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: { error?: string } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(r.ok ? "Invalid response from server" : `Request failed (${r.status})`);
  }
  if (!r.ok) throw new Error(typeof json?.error === "string" ? json.error : "Request failed");
  return json as T;
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
  const { data: authSession } = useSession();
  const currentUserId = authSession?.user?.id ?? "";
  const currentUserName = authSession?.user?.name ?? "";
  const [page, setPage] = useState(1);
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const [recallTarget, setRecallTarget] = useState<LocalPosMachine | null>(null);

  const { data, error, isLoading, mutate } = useSWR<MyPosMachinesResponse>(
    `/api/pos/my-machines?page=${page}&pageSize=50`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const machines = data?.data ?? [];
  const pagination = data?.pagination;
  const stats = data?.stats;

  const handleRecall = useCallback(async (machine: LocalPosMachine) => {
    const label = machine.tid ?? machine.serial ?? machine.id.slice(0, 8);
    setRecallingId(machine.id);

    // Optimistic update: immediately show the machine as owned by the caller
    // so the UI feels instant. SWR revalidates in the background.
    mutate(
      (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.map((m) =>
            m.id === machine.id
              ? { ...m, assignedUserId: currentUserId, assignee: { id: currentUserId, name: currentUserName, phone: "", role: "" } }
              : m,
          ),
        };
      },
      { revalidate: false },
    );

    try {
      const res = await fetch("/api/network/pos/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId: machine.id, childId: null, returnReason: "Recalled by network parent" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof d.error === "string" ? d.error : "Recall failed");
        mutate(); // rollback optimistic update
      } else {
        toast.success(`${label} recalled to your account`);
        mutate(); // sync with server
      }
    } catch {
      toast.error("Recall request failed");
      mutate(); // rollback
    } finally {
      setRecallingId(null);
    }
  }, [mutate, currentUserId, currentUserName]);

  const cols: Column<LocalPosMachine>[] = [
    { key: "tid", header: "TID", render: (r) => <span className="font-mono text-xs font-semibold">{r.tid ?? "—"}</span> },
    { key: "serial", header: "Serial No.", render: (r) => <span className="font-mono text-xs">{r.serial ?? "—"}</span> },
    { key: "mid", header: "MID", render: (r) => <span className="font-mono text-xs">{r.mid ?? "—"}</span> },
    { key: "model", header: "Model", render: (r) => r.model ?? "—" },
    { key: "location", header: "Location", render: (r) => r.location || "—" },
    { key: "city", header: "City", render: (r) => r.city || "—" },
    { key: "status", header: "Status", render: (r) => machineBadge(r.status) },
    {
      key: "assignee",
      header: "Assigned To",
      render: (r) => {
        if (!r.assignee) return "—";
        const isChild = r.assignedUserId !== currentUserId;
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink-700">{r.assignee.name}</span>
            {isChild && (
              <button
                onClick={() => setRecallTarget(r)}
                disabled={recallingId === r.id}
                title={`Recall from ${r.assignee.name}`}
                className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
              >
                {recallingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Recall
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Active Terminals" value={stats ? String(stats.active) : "..."} icon={Monitor} accent="brand" />
        <StatCard label="Total Machines" value={stats ? String(stats.total) : "..."} icon={CreditCard} accent="violet" />
        <StatCard label="On This Page" value={String(machines.length)} icon={ArrowLeftRight} accent="emerald" />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => mutate()} title="Refresh">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {error ? (
        <ErrorBanner message={error instanceof Error ? error.message : "Failed to load POS machines."} />
      ) : (
        <DataTable
          title="My Terminals"
          description={pagination ? `${pagination.total} terminal${pagination.total === 1 ? "" : "s"} assigned to your account` : "Loading..."}
          columns={cols}
          data={machines}
          loading={isLoading}
          empty="No POS machines assigned to your account yet."
        />
      )}

      {pagination && pagination.totalPages > 1 && (
        <Paginator page={pagination.page} totalPages={pagination.totalPages}
          hasPrev={pagination.hasPrev} hasNext={pagination.hasNext}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
      )}

      <ConfirmDialog
        open={recallTarget !== null}
        onClose={() => setRecallTarget(null)}
        busy={recallTarget ? recallingId === recallTarget.id : false}
        title="Recall this terminal?"
        description={
          recallTarget && (
            <>
              <span className="font-mono font-semibold text-ink-900">
                {recallTarget.tid ?? recallTarget.serial ?? recallTarget.id.slice(0, 8)}
              </span>{" "}
              will be taken back from{" "}
              <span className="font-semibold text-ink-900">
                {recallTarget.assignee?.name ?? "the assigned user"}
              </span>{" "}
              and returned to you.
            </>
          )
        }
        confirmLabel="Recall"
        onConfirm={async () => {
          if (!recallTarget) return;
          await handleRecall(recallTarget);
          setRecallTarget(null);
        }}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TRANSACTIONS TAB — refreshes every 1 second
// ═══════════════════════════════════════════════════════════════════════

const NETWORK_ROLES = ["SUPER_DISTRIBUTOR", "MASTER_DISTRIBUTOR", "DISTRIBUTOR", "RETAILER"] as const;
const ROLE_LABELS: Record<string, string> = {
  MASTER_DISTRIBUTOR: "Master Distributor",
  DISTRIBUTOR: "Distributor",
  RETAILER: "Retailer",
};

function getSubtreeIds(rootId: string, members: TerminalTreeMember[]): Set<string> {
  const result = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const m of members) {
      if (m.parentId === cur && !result.has(m.id)) {
        result.add(m.id);
        queue.push(m.id);
      }
    }
  }
  return result;
}

function TransactionsTab() {
  const today = todayRange();
  const defaults = defaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [statusFilter, setStatusFilter] = useState<PosTransactionStatus | "">("");
  const [modeFilter, setModeFilter] = useState<PosPaymentMode | "">("");
  const [terminalFilter, setTerminalFilter] = useState("");
  const [hierSelections, setHierSelections] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Fetch the network hierarchy + terminal data for cascading filters.
  const { data: treeData } = useSWR<PosTerminalTreeResponse>(
    "/api/pos/terminal-tree",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );

  const callerRole = treeData?.callerRole ?? "";
  const members = treeData?.members ?? [];
  const allTerminals = treeData?.terminals ?? [];

  // Which hierarchy tiers should appear as cascading dropdowns.
  const filterTiers = useMemo(() => {
    const idx = NETWORK_ROLES.indexOf(callerRole as typeof NETWORK_ROLES[number]);
    if (idx < 0) return [];
    return NETWORK_ROLES.slice(idx + 1) as unknown as string[];
  }, [callerRole]);

  // For each tier, compute visible members based on the selection at the tier above.
  const tierOptions = useMemo(() => {
    const result: Record<string, TerminalTreeMember[]> = {};
    for (let i = 0; i < filterTiers.length; i++) {
      const tier = filterTiers[i];
      const membersAtTier = members.filter((m) => m.role === tier);

      if (i === 0) {
        result[tier] = membersAtTier;
      } else {
        const prevTier = filterTiers[i - 1];
        const prevSel = hierSelections[prevTier];
        if (!prevSel) {
          // No selection at parent tier → show all ancestors' options filtered
          // by any selection higher in the chain.
          let scope: Set<string> | null = null;
          for (let j = i - 2; j >= 0; j--) {
            const sel = hierSelections[filterTiers[j]];
            if (sel) {
              scope = getSubtreeIds(sel, members);
              scope.add(sel);
              break;
            }
          }
          result[tier] = scope
            ? membersAtTier.filter((m) => scope!.has(m.id) || (m.parentId && scope!.has(m.parentId)))
            : membersAtTier;
        } else {
          const subtree = getSubtreeIds(prevSel, members);
          subtree.add(prevSel);
          result[tier] = membersAtTier.filter((m) => m.parentId && subtree.has(m.parentId));
        }
      }
    }
    return result;
  }, [filterTiers, members, hierSelections]);

  // The deepest hierarchy selection drives terminal filtering.
  const effectiveScope = useMemo(() => {
    for (let i = filterTiers.length - 1; i >= 0; i--) {
      const sel = hierSelections[filterTiers[i]];
      if (sel) return sel;
    }
    return null;
  }, [filterTiers, hierSelections]);

  // Terminals matching the current hierarchy scope.
  const filteredTerminals = useMemo(() => {
    if (!effectiveScope) return allTerminals;
    const scopeIds = getSubtreeIds(effectiveScope, members);
    scopeIds.add(effectiveScope);
    return allTerminals.filter((t) => t.ownerId && scopeIds.has(t.ownerId));
  }, [allTerminals, effectiveScope, members]);

  // Auto-select when exactly one terminal matches.
  const activeTerminal = terminalFilter || (filteredTerminals.length === 1 ? filteredTerminals[0].tid : "");
  const hasNoTerminals = treeData != null && allTerminals.length === 0;
  const needsTerminalSelection = !hasNoTerminals && filteredTerminals.length > 1 && !activeTerminal;

  // Earliest visible date for the selected terminal (assignment time).
  const activeTerminalData = activeTerminal
    ? allTerminals.find((t) => t.tid === activeTerminal)
    : null;
  const assignedAtDate = activeTerminalData?.assignedAt
    ? activeTerminalData.assignedAt.slice(0, 10)
    : null;
  const clampedDateFrom = assignedAtDate && dateFrom < assignedAtDate
    ? assignedAtDate
    : dateFrom;

  const body = {
    date_from: `${clampedDateFrom}T00:00:00.000Z`,
    date_to: `${dateTo}T23:59:59.999Z`,
    status: statusFilter || null,
    payment_mode: modeFilter || null,
    terminal_id: activeTerminal || null,
    page,
    page_size: 50,
  };

  // Only fetch transactions when we have tree data loaded and a terminal selected.
  const canFetchTxn = treeData != null && !!activeTerminal && !needsTerminalSelection;

  const { data, error, isLoading } = useSWR<PosTransactionsResponse>(
    canFetchTxn ? ["/api/pos/transactions", body] : null,
    postFetcher,
    {
      // 5s keeps the feed feeling live without saturating the partner API —
      // each poll is a full proxy round trip that competes with other requests.
      refreshInterval: (latest) => (latest ? 5000 : 0),
      refreshWhenHidden: false,
      revalidateOnFocus: false,
      keepPreviousData: true,
      shouldRetryOnError: true,
      errorRetryCount: 2,
      errorRetryInterval: 8000,
    }
  );

  const handleHierChange = useCallback(
    (tier: string, value: string) => {
      setHierSelections((prev) => {
        const next = { ...prev };
        next[tier] = value;
        const idx = filterTiers.indexOf(tier);
        for (let i = idx + 1; i < filterTiers.length; i++) delete next[filterTiers[i]];
        // Clean empty selections
        for (const k of Object.keys(next)) if (!next[k]) delete next[k];
        return next;
      });
      setTerminalFilter("");
      setPage(1);
    },
    [filterTiers]
  );

  const handleExport = useCallback(async (format: "csv" | "excel") => {
    setExporting(true);
    try {
      const res = await fetch("/api/pos/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, date_from: dateFrom, date_to: dateTo, status: statusFilter || null, terminal_id: activeTerminal || null }),
      });
      const d = await res.json();
      if (d.data?.job_id) {
        toast.info("Export started — the file will open when ready.");
        pollExport(d.data.job_id);
      } else {
        toast.error(d.error ?? "Export failed");
        setExporting(false);
      }
    } catch { toast.error("Export request failed"); setExporting(false); }
  }, [dateFrom, dateTo, statusFilter, activeTerminal]);

  const pollExport = useCallback(async (jobId: string) => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/pos/export-status/${jobId}`);
        const d = await res.json();
        if (d.data?.job?.status === "COMPLETED" && d.data.job.file_url) {
          window.open(d.data.job.file_url, "_blank");
          toast.success("Export ready — download opened in a new tab.");
          setExporting(false);
          return;
        }
        if (d.data?.job?.status === "FAILED") { toast.error("Export failed. Please try again."); setExporting(false); return; }
      } catch { break; }
    }
    toast.warning("Export is taking longer than expected.");
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
        <StatCard label="Terminals" value={allTerminals.length ? String(allTerminals.length) : "..."} icon={Monitor} accent="accent" />
      </div>

      {/* Network hierarchy cascading filters */}
      {filterTiers.length > 0 && members.length > 0 && (
        <div className="rounded-2xl border border-ink-100 bg-white p-4">
          <p className="mb-3 text-xs font-semibold text-ink-500">Filter by network</p>
          <div className="flex flex-wrap items-end gap-3">
            {filterTiers.map((tier) => {
              const opts = tierOptions[tier] ?? [];
              if (opts.length === 0) return null;
              return (
                <div key={tier}>
                  <label className="mb-1 block text-xs font-semibold text-ink-500">
                    {ROLE_LABELS[tier] ?? tier}
                  </label>
                  <select
                    value={hierSelections[tier] ?? ""}
                    onChange={(e) => handleHierChange(tier, e.target.value)}
                    className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    <option value="">All</option>
                    {opts.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}

            {filteredTerminals.length > 1 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-500">Terminal</label>
                <select
                  value={terminalFilter}
                  onChange={(e) => { setTerminalFilter(e.target.value); setPage(1); }}
                  className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  <option value="">Select terminal</option>
                  {filteredTerminals.map((t) => (
                    <option key={t.tid} value={t.tid}>
                      {t.tid}{t.location ? ` — ${t.location}` : t.model ? ` — ${t.model}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live indicator + Date / Status / Mode filters */}
      <div className="rounded-2xl border border-ink-100 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-semibold text-emerald-700">Live — auto-refreshing</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-500">From</label>
            <input type="date" value={dateFrom} min={assignedAtDate ?? undefined}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
            {assignedAtDate && dateFrom < assignedAtDate && (
              <p className="mt-1 text-[10px] text-amber-600">
                Clamped to assignment date ({new Date(assignedAtDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})
              </p>
            )}
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
          {/* Terminal picker for roles with no hierarchy (retailer) or no tree data yet */}
          {filterTiers.length === 0 && filteredTerminals.length > 1 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-500">Terminal</label>
              <select value={terminalFilter} onChange={(e) => { setTerminalFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400">
                <option value="">Select terminal</option>
                {filteredTerminals.map((t) => (
                  <option key={t.tid} value={t.tid}>
                    {t.tid}{t.location ? ` — ${t.location}` : t.model ? ` — ${t.model}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
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

      {hasNoTerminals ? (
        <div className="flex items-center gap-2 rounded-2xl border border-ink-200 bg-ink-50 p-4 text-sm text-ink-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          No POS terminals are assigned to your account yet.
        </div>
      ) : needsTerminalSelection ? (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Select one of your terminals to view its transactions.
        </div>
      ) : error ? (
        <ErrorBanner message={error instanceof Error ? error.message : "Failed to load transactions."} />
      ) : (
        <DataTable
          title="POS Transactions"
          description={
            pagination
              ? `${pagination.total_records} total · page ${pagination.page} of ${pagination.total_pages}`
              : isLoading
                ? "Loading..."
                : "No data yet"
          }
          columns={cols}
          data={transactions}
          loading={isLoading}
          empty="No transactions for the selected filters."
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
