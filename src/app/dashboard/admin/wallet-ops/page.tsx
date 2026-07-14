"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatINR, formatNumber } from "@/lib/utils";
import {
  RefreshCw,
  Eye,
  EyeOff,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
  ShieldCheck,
} from "lucide-react";

/* ---------------------------------------------------------------- types */

type TierBalance = {
  role: string;
  users: number;
  primary: number;
  aeps: number;
  held: number;
  total: number;
};

type Cumulative = {
  systemTotal: number;
  primaryTotal: number;
  aepsTotal: number;
  heldTotal: number;
  walletCount: number;
  tiers: TierBalance[];
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  shopName: string | null;
  role: string;
  status: string;
  primary: number;
  aeps: number;
  held: number;
  total: number;
};

type Operation = {
  id: string;
  type: "PUSH" | "PULL";
  walletType: string;
  amount: number;
  reasonCode: string;
  remarks: string;
  status: string;
  createdAt: string;
  rejectedNote: string | null;
  targetUser?: { name: string; email: string; shopName: string | null; role: string };
  actor?: { name: string; email: string };
  approvedBy?: { name: string; email: string } | null;
};

const ROLE_LABEL: Record<string, string> = {
  RETAILER: "Retailers",
  DISTRIBUTOR: "Distributors",
  MASTER_DISTRIBUTOR: "Master Distributors",
  SUPER_DISTRIBUTOR: "Super Distributors",
};

const REASON_CODES = [
  "FUND_LOAD",
  "REFUND",
  "CHARGEBACK",
  "CORRECTION",
  "PENALTY",
  "PROMO",
  "OTHER",
] as const;

const inputCls =
  "w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/* ---------------------------------------------------------------- page */

export default function WalletOpsPage() {
  const [tab, setTab] = useState<"balances" | "operate" | "history">("balances");
  const [masked, setMasked] = useState(false);
  const [cumulative, setCumulative] = useState<Cumulative | null>(null);
  const notify = useCallback((text: string, ok: boolean) => {
    if (ok) toast.success(text);
    else toast.error(text);
  }, []);

  const loadCumulative = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/wallet/aggregates?view=cumulative");
      if (res.ok) setCumulative(await res.json());
    } catch {
      /* panel stays empty */
    }
  }, []);

  useEffect(() => {
    loadCumulative();
  }, [loadCumulative]);

  const money = useCallback(
    (n: number) => (masked ? "₹ ●●●●●" : formatINR(n)),
    [masked]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Money"
        title="Wallet Operations"
        description="Platform liability at a glance, user-wise balances, and audited admin credit/debit with maker-checker above the threshold."
        actions={
          <>
            <Button variant="outline" onClick={() => setMasked((m) => !m)}>
              {masked ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {masked ? "Show amounts" : "Mask amounts"}
            </Button>
            <Button variant="outline" onClick={loadCumulative}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </>
        }
      />

      {/* Cumulative liability */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-transparent bg-gradient-to-br from-brand-600 to-violet-600 p-4 text-white shadow-soft">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            System liability (all wallets)
          </p>
          <p className="mt-1 font-display text-2xl font-bold">
            {money(cumulative?.systemTotal ?? 0)}
          </p>
          <p className="text-[11px] text-white/70">
            across {formatNumber(cumulative?.walletCount ?? 0)} user wallets
          </p>
        </div>
        <MiniStat label="Primary wallets" value={money(cumulative?.primaryTotal ?? 0)} />
        <MiniStat label="AEPS wallets" value={money(cumulative?.aepsTotal ?? 0)} />
        <MiniStat label="On hold (in-flight)" value={money(cumulative?.heldTotal ?? 0)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(cumulative?.tiers ?? []).map((t) => (
          <div key={t.role} className="rounded-2xl border border-ink-100 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-500">
                {ROLE_LABEL[t.role] ?? t.role}
              </p>
              <Badge>{formatNumber(t.users)}</Badge>
            </div>
            <p className="mt-1 font-display text-lg font-bold text-ink-900">{money(t.total)}</p>
            <p className="text-[11px] text-ink-500">
              Primary {money(t.primary)} · AEPS {money(t.aeps)}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-ink-100">
        {(
          [
            ["balances", "User-wise balances"],
            ["operate", "Push / Pull"],
            ["history", "Operations history"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "balances" && <UserBalancesTab money={money} />}
      {tab === "operate" && (
        <OperateTab
          onDone={(msg, ok) => {
            notify(msg, ok);
            loadCumulative();
          }}
        />
      )}
      {tab === "history" && <HistoryTab money={money} onNotice={notify} />}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink-900">{value}</p>
    </div>
  );
}

/* ------------------------------------------------ user-wise balances tab */

function UserBalancesTab({ money }: { money: (n: number) => string }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [sums, setSums] = useState({ primary: 0, aeps: 0, total: 0 });
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        view: "users",
        role,
        q,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/admin/wallet/aggregates?${params}`);
      const data = await res.json();
      if (res.ok) {
        setRows(data.rows);
        setTotal(data.total);
        setSums(data.sums);
      }
    } finally {
      setLoading(false);
    }
  }, [q, role, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const columns: Column<UserRow>[] = useMemo(
    () => [
      {
        key: "name",
        header: "User",
        render: (r) => (
          <div>
            <p className="font-semibold text-ink-900">{r.name}</p>
            <p className="text-[11px] text-ink-500">{r.shopName ?? r.email}</p>
          </div>
        ),
      },
      {
        key: "role",
        header: "Tier",
        render: (r) => <Badge variant="brand">{r.role.replace(/_/g, " ")}</Badge>,
      },
      {
        key: "status",
        header: "Status",
        render: (r) => (
          <Badge variant={r.status === "ACTIVE" ? "success" : "warning"}>{r.status}</Badge>
        ),
      },
      { key: "primary", header: "Primary", align: "right", render: (r) => money(r.primary) },
      { key: "aeps", header: "AEPS", align: "right", render: (r) => money(r.aeps) },
      { key: "held", header: "Held", align: "right", render: (r) => money(r.held) },
      {
        key: "total",
        header: "Total",
        align: "right",
        render: (r) => <span className="font-semibold">{money(r.total)}</span>,
      },
    ],
    [money]
  );

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search name / shop / email / phone…"
            className={`${inputCls} w-72 pl-9`}
          />
        </div>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className={`${inputCls} w-auto`}
        >
          <option value="ALL">All tiers</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-ink-500">
          Filtered total: <b className="text-ink-800">{money(sums.total)}</b> · {formatNumber(total)} users
        </span>
      </div>

      <DataTable
        columns={columns}
        data={rows}
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

/* ------------------------------------------------------ push / pull tab */

type UserHit = { id: string; name: string; shop: string; role: string; walletBalance: number };

function OperateTab({ onDone }: { onDone: (msg: string, ok: boolean) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [selected, setSelected] = useState<UserHit | null>(null);
  const [type, setType] = useState<"PUSH" | "PULL">("PUSH");
  const [walletType, setWalletType] = useState<"PRIMARY" | "AEPS">("PRIMARY");
  const [amount, setAmount] = useState("");
  const [reasonCode, setReasonCode] = useState<string>("FUND_LOAD");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q || q.length < 2 || selected) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&pageSize=10`);
        const data = await res.json();
        if (res.ok) setHits(data.users ?? []);
      } catch {
        setHits([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, selected]);

  const submit = async () => {
    if (!selected) return onDone("Pick a target user first.", false);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return onDone("Enter a valid amount.", false);
    if (remarks.trim().length < 3) return onDone("Remarks are mandatory (min 3 chars).", false);

    setBusy(true);
    try {
      const res = await fetch("/api/admin/wallet/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: selected.id,
          type,
          walletType,
          amount: amt,
          reasonCode,
          remarks: remarks.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Operation failed");
      const staged = data.operation?.status === "PENDING_APPROVAL";
      onDone(
        staged
          ? `Staged for approval — a different admin must approve this ${type.toLowerCase()} of ${formatINR(amt)}.`
          : `${type === "PUSH" ? "Credited" : "Debited"} ${formatINR(amt)} ${type === "PUSH" ? "to" : "from"} ${selected.name} — ledger entry written.`,
        true
      );
      setAmount("");
      setRemarks("");
      setSelected(null);
      setQ("");
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Operation failed", false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 rounded-2xl border border-ink-100 bg-white p-5 lg:col-span-3">
        {/* Target user */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-ink-500">
            Target user
          </label>
          {selected ? (
            <div className="mt-1.5 flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-ink-900">{selected.name}</p>
                <p className="text-[11px] text-ink-500">
                  {selected.shop} · {selected.role} · Wallet {formatINR(selected.walletBalance)}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, shop, email…"
                className={`${inputCls} pl-9`}
              />
              {hits.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-ink-100 bg-white shadow-lg">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        setSelected(h);
                        setHits([]);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-brand-50"
                    >
                      <span>
                        <span className="font-semibold text-ink-900">{h.name}</span>{" "}
                        <span className="text-ink-500">· {h.shop}</span>
                      </span>
                      <span className="text-[11px] text-ink-500">{h.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Direction + wallet */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink-500">
              Operation
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setType("PUSH")}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  type === "PUSH"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-ink-200 text-ink-500 hover:border-ink-300"
                }`}
              >
                <ArrowUpCircle className="h-4 w-4" /> Push (credit)
              </button>
              <button
                onClick={() => setType("PULL")}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  type === "PULL"
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-ink-200 text-ink-500 hover:border-ink-300"
                }`}
              >
                <ArrowDownCircle className="h-4 w-4" /> Pull (debit)
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink-500">
              Wallet
            </label>
            <select
              value={walletType}
              onChange={(e) => setWalletType(e.target.value as "PRIMARY" | "AEPS")}
              className={`${inputCls} mt-1.5`}
            >
              <option value="PRIMARY">Primary wallet</option>
              <option value="AEPS">AEPS wallet</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink-500">
              Amount (₹)
            </label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`${inputCls} mt-1.5`}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-ink-500">
              Reason code
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className={`${inputCls} mt-1.5`}
            >
              {REASON_CODES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-ink-500">
            Remarks (mandatory, audit-logged)
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder="Why is this adjustment being made?"
            className={`${inputCls} mt-1.5 resize-none`}
          />
        </div>

        <Button onClick={submit} disabled={busy} className="w-full" isLoading={busy}>
          <Wallet className="h-4 w-4" />
          {type === "PUSH" ? "Credit user wallet" : "Debit user wallet"}
        </Button>
      </div>

      <div className="space-y-3 lg:col-span-2">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-bold text-amber-800">Money-safety rules</p>
          </div>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-amber-800">
            <li>• Every operation writes a ledger entry with your identity and remarks.</li>
            <li>• Amounts at/above the approval threshold stage as pending — a different admin must approve before money moves.</li>
            <li>• A credit that would push the user above the wallet cap is refused.</li>
            <li>• Pulls are refused when the user lacks spendable balance — negative balances are impossible.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- history tab */

function HistoryTab({
  money,
  onNotice,
}: {
  money: (n: number) => string;
  onNotice: (text: string, ok: boolean) => void;
}) {
  const [ops, setOps] = useState<Operation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/admin/wallet/operations?${params}`);
      const data = await res.json();
      if (res.ok) {
        setOps(data.operations);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "approve" | "reject" | "cancel") => {
    setActing(id);
    try {
      const res = await fetch(`/api/admin/wallet/operations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Action failed");
      onNotice(`Operation ${action}d.`, true);
      load();
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Action failed", false);
    } finally {
      setActing(null);
    }
  };

  const columns: Column<Operation>[] = [
    {
      key: "createdAt",
      header: "Date",
      render: (r) =>
        new Date(r.createdAt).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      key: "targetUser",
      header: "User",
      render: (r) => (
        <div>
          <p className="font-semibold text-ink-900">{r.targetUser?.name ?? "—"}</p>
          <p className="text-[11px] text-ink-500">{r.targetUser?.shopName ?? r.targetUser?.email}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Op",
      render: (r) => (
        <Badge variant={r.type === "PUSH" ? "success" : "danger"}>
          {r.type} · {r.walletType}
        </Badge>
      ),
    },
    { key: "amount", header: "Amount", align: "right", render: (r) => money(r.amount) },
    { key: "reasonCode", header: "Reason", render: (r) => r.reasonCode.replace(/_/g, " ") },
    {
      key: "actor",
      header: "By",
      render: (r) => <span className="text-xs">{r.actor?.email ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge
          variant={
            r.status === "COMPLETED"
              ? "success"
              : r.status === "PENDING_APPROVAL"
              ? "warning"
              : "danger"
          }
        >
          {r.status.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) =>
        r.status === "PENDING_APPROVAL" ? (
          <div className="flex gap-1.5">
            <Button size="sm" disabled={acting === r.id} onClick={() => act(r.id, "approve")}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acting === r.id}
              onClick={() => act(r.id, "reject")}
            >
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={`${inputCls} w-auto`}
        >
          <option value="all">All statuses</option>
          <option value="PENDING_APPROVAL">Pending approval</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={ops}
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
