"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatINR, formatNumber } from "@/lib/utils";
import { RefreshCw, Download, Search } from "lucide-react";

type Entry = {
  id: string;
  user: { name: string; email: string; shopName: string | null; role: string };
  walletType: string;
  direction: "CREDIT" | "DEBIT";
  reason: string;
  amount: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: string;
};

const WALLET_REASONS = [
  "TOPUP",
  "WITHDRAW",
  "TRANSACTION",
  "COMMISSION",
  "REVERSAL",
  "ADJUSTMENT",
  "FUND_TRANSFER_IN",
  "FUND_TRANSFER_OUT",
  "FEE",
  "PENALTY",
  "PAYOUT",
  "SETTLEMENT",
  "AEPS_SETTLEMENT",
  "RENTAL",
];

const inputCls =
  "rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function LedgerExplorerPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [sums, setSums] = useState({ credit: 0, debit: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [walletType, setWalletType] = useState("all");
  const [direction, setDirection] = useState("all");
  const [reason, setReason] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const pageSize = 50;

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qParam = sp.get("q");
    const idParam = sp.get("userId");
    if (qParam) setQ(qParam);
    if (idParam) setUserId(idParam);
  }, []);

  const buildParams = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (userId) params.set("userId", userId);
      else if (q) params.set("q", q);
      if (walletType !== "all") params.set("walletType", walletType);
      if (direction !== "all") params.set("direction", direction);
      if (reason !== "all") params.set("reason", reason);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
      return params;
    },
    [q, userId, walletType, direction, reason, from, to, page]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/wallet/ledger?${buildParams()}`);
      const data = await res.json();
      if (res.ok) {
        setEntries(data.entries);
        setTotal(data.total);
        setSums(data.sums);
      }
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const exportCsv = () => {
    window.open(`/api/admin/wallet/ledger?${buildParams({ format: "csv" })}`, "_blank");
  };

  const columns: Column<Entry>[] = [
    {
      key: "createdAt",
      header: "Date",
      render: (r) =>
        new Date(r.createdAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      key: "user",
      header: "User",
      render: (r) => (
        <div>
          <p className="font-semibold text-ink-900">{r.user.name}</p>
          <p className="text-[11px] text-ink-500">{r.user.shopName ?? r.user.email}</p>
        </div>
      ),
    },
    {
      key: "walletType",
      header: "Wallet",
      render: (r) => <Badge variant={r.walletType === "AEPS" ? "accent" : "brand"}>{r.walletType}</Badge>,
    },
    {
      key: "direction",
      header: "Type",
      render: (r) => (
        <Badge variant={r.direction === "CREDIT" ? "success" : "danger"}>{r.direction}</Badge>
      ),
    },
    { key: "reason", header: "Reason", render: (r) => r.reason.replace(/_/g, " ") },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => (
        <span className={r.direction === "CREDIT" ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
          {r.direction === "CREDIT" ? "+" : "−"}
          {formatINR(r.amount)}
        </span>
      ),
    },
    {
      key: "balanceAfter",
      header: "Balance after",
      align: "right",
      render: (r) => formatINR(r.balanceAfter),
    },
    {
      key: "refType",
      header: "Source",
      render: (r) => (
        <span className="font-mono text-[11px] text-ink-500">
          {r.refType ?? "—"}
          {r.refId ? ` · ${r.refId.slice(0, 12)}` : ""}
        </span>
      ),
    },
    {
      key: "note",
      header: "Note",
      render: (r) => (
        <span className="block max-w-[220px] truncate text-xs text-ink-600" title={r.note ?? ""}>
          {r.note ?? "—"}
        </span>
      ),
    },
  ];

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Money"
        title="Ledger Explorer"
        description="Every rupee that has ever moved, across both wallet books. Filter, inspect and export — the ledger is append-only and never edited."
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
            Credits (filtered)
          </p>
          <p className="mt-1 font-display text-xl font-bold text-emerald-700">
            {formatINR(sums.credit)}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">
            Debits (filtered)
          </p>
          <p className="mt-1 font-display text-xl font-bold text-rose-700">{formatINR(sums.debit)}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-500">Entries</p>
          <p className="mt-1 font-display text-xl font-bold text-ink-900">{formatNumber(total)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setUserId("");
              setPage(1);
            }}
            placeholder="Search user / shop / email…"
            className={`${inputCls} w-64 pl-9`}
          />
        </div>
        <select value={walletType} onChange={(e) => { setWalletType(e.target.value); setPage(1); }} className={inputCls}>
          <option value="all">Both wallets</option>
          <option value="PRIMARY">Primary</option>
          <option value="AEPS">AEPS</option>
        </select>
        <select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }} className={inputCls}>
          <option value="all">Credit + Debit</option>
          <option value="CREDIT">Credits</option>
          <option value="DEBIT">Debits</option>
        </select>
        <select value={reason} onChange={(e) => { setReason(e.target.value); setPage(1); }} className={inputCls}>
          <option value="all">All reasons</option>
          {WALLET_REASONS.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={inputCls} />
        <span className="text-xs text-ink-400">to</span>
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={inputCls} />
      </div>

      <DataTable
        columns={columns}
        data={entries}
        loading={loading}
      />

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-ink-500">
            Page {page} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
