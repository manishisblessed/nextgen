"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Filter, PackagePlus, RefreshCw, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { useAuth } from "@/lib/useAuth";
import { formatINR } from "@/lib/utils";

type NetworkUser = {
  id: string;
  name: string;
  shop: string;
  role: "retailer" | "distributor" | "master-distributor" | "super-distributor";
  city: string;
  state: string;
  joined: string;
  status: "Active" | "Pending KYC" | "Suspended" | "Closed";
  walletBalance: number;
  monthlyTurnover: number;
  retailers: number;
};

/** Labels for the direct downline each network tier manages. */
const CHILD_META = {
  "super-distributor": {
    child: "master-distributor",
    singular: "master distributor",
    plural: "master distributors",
    header: "Master Distributor",
    eyebrow: "Network tree",
    title: "Master distributors under you",
    description:
      "Direct master distributors. Override commissions, top-up wallets, freeze or graduate accounts.",
    hasDownline: true,
  },
  "master-distributor": {
    child: "distributor",
    singular: "distributor",
    plural: "distributors",
    header: "Distributor",
    eyebrow: "Network tree",
    title: "Distributors under you",
    description:
      "Direct distributors. Override commissions, top-up wallets, freeze or graduate accounts.",
    hasDownline: true,
  },
  distributor: {
    child: "retailer",
    singular: "retailer",
    plural: "retailers",
    header: "Retailer",
    eyebrow: "My retailers",
    title: "Retailers under you",
    description:
      "Retailers in your network. Approve fund requests, set commissions, and watch turnover.",
    hasDownline: false,
  },
} as const;

export default function NetworkPage() {
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [users, setUsers] = useState<NetworkUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const role: keyof typeof CHILD_META =
    session?.role === "super-distributor" ? "super-distributor" :
    session?.role === "master-distributor" ? "master-distributor" :
    "distributor";

  const meta = CHILD_META[role];

  const fetchNetwork = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/network?${params}`);
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(fetchNetwork, 300);
    return () => clearTimeout(t);
  }, [fetchNetwork]);

  const toggleStatus = useCallback(async (row: NetworkUser) => {
    const suspending = row.status !== "Suspended";
    let reason: string | undefined;

    if (suspending) {
      const input = prompt(
        `SECURITY FREEZE — ${row.name}\n\nThis instantly blocks all transactions and logs the ${meta.singular} out everywhere. Enter a reason (required):`
      );
      if (input === null) return; // cancelled
      reason = input.trim();
      if (!reason) {
        setToggleError("A reason is required to suspend an account.");
        return;
      }
    } else if (!confirm(`Reactivate ${row.name}? They will be able to transact again.`)) {
      return;
    }

    setTogglingId(row.id);
    setToggleError(null);
    try {
      const res = await fetch(`/api/network/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: suspending ? "suspend" : "activate", reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToggleError(data.error ?? "Could not update account status.");
      } else {
        await fetchNetwork();
      }
    } catch {
      setToggleError("Network error — please try again.");
    } finally {
      setTogglingId(null);
    }
  }, [meta.singular, fetchNetwork]);

  const cols: Column<NetworkUser>[] = [
    {
      key: "name",
      header: meta.header,
      render: (r) => (
        <div>
          <div className="font-semibold text-ink-900">{r.name}</div>
          <div className="text-xs text-ink-500">{r.shop} · {r.id.slice(0, 8)}</div>
        </div>
      ),
    },
    { key: "city", header: "Location", render: (r) => `${r.city}, ${r.state}` },
    ...(meta.hasDownline
      ? [{ key: "retailers" as const, header: "Downline", align: "right" as const, render: (r: NetworkUser) => r.retailers ?? 0 }]
      : []),
    { key: "joined", header: "Joined" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Active" ? "success" : r.status === "Pending KYC" ? "warning" : "danger"}>
          {r.status}
        </Badge>
      ),
    },
    { key: "walletBalance", header: "Wallet", align: "right", render: (r) => formatINR(r.walletBalance) },
    { key: "monthlyTurnover", header: "MTD", align: "right", render: (r) => formatINR(r.monthlyTurnover) },
    {
      key: "security",
      header: "Security",
      align: "right",
      render: (r) => {
        if (r.status === "Closed") return null;
        const busy = togglingId === r.id;
        const suspended = r.status === "Suspended";
        return (
          <button
            onClick={() => toggleStatus(r)}
            disabled={busy}
            title={
              suspended
                ? "Reactivate this account"
                : "Freeze this account — blocks all transactions immediately"
            }
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              suspended
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : suspended ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <ShieldOff className="h-3.5 w-3.5" />
            )}
            {suspended ? "Reactivate" : "Freeze"}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={meta.eyebrow}
        title={meta.title}
        description={meta.description}
        actions={
          <>
            <ReportActions
              filename={`my-${meta.plural.replace(/ /g, "-")}`}
              title={`JMP NextGenPay · My ${meta.plural.replace(/\b\w/g, (c) => c.toUpperCase())}`}
              subtitle={`${users.length} record${users.length === 1 ? "" : "s"}`}
              columns={[
                { key: "id", header: "Code" },
                { key: "name", header: "Name" },
                { key: "shop", header: "Shop / Firm" },
                { key: "city", header: "City" },
                { key: "state", header: "State" },
                { key: "joined", header: "Joined" },
                { key: "status", header: "Status" },
                { key: "walletBalance", header: "Wallet (INR)" },
                { key: "monthlyTurnover", header: "MTD Turnover (INR)" },
              ]}
              rows={users}
            />
            <Button variant="outline" onClick={fetchNetwork} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Link href="/dashboard/network/onboard">
              <Button>
                <PackagePlus className="h-4 w-4" />
                Onboard {meta.singular}
              </Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, shop, ID..." className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-ink-400" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-44">
            <option value="all">Any status</option>
            <option value="Active">Active</option>
            <option value="Pending KYC">Pending KYC</option>
            <option value="Suspended">Suspended</option>
          </Select>
        </div>
      </div>

      {toggleError && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <ShieldOff className="h-4 w-4 shrink-0" />
          {toggleError}
        </div>
      )}

      <DataTable
        title={loading ? "Loading..." : `${users.length} ${meta.plural}`}
        columns={cols}
        data={users}
        empty={`No ${meta.plural} in your network yet.`}
      />
    </div>
  );
}
