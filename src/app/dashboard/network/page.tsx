"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Filter, PackagePlus, RefreshCw } from "lucide-react";
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
  role: "retailer" | "distributor" | "master-distributor";
  city: string;
  state: string;
  joined: string;
  status: "Active" | "Pending KYC" | "Suspended" | "Closed";
  walletBalance: number;
  monthlyTurnover: number;
  retailers: number;
};

export default function NetworkPage() {
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [users, setUsers] = useState<NetworkUser[]>([]);
  const [loading, setLoading] = useState(true);

  const role =
    !session ? "retailer" :
    session.role === "master-distributor" ? "master-distributor" :
    session.role === "distributor" ? "distributor" : "retailer";

  const childRole = role === "master-distributor" ? "distributor" : "retailer";

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

  const cols: Column<NetworkUser>[] = [
    {
      key: "name",
      header: childRole === "distributor" ? "Distributor" : "Retailer",
      render: (r) => (
        <div>
          <div className="font-semibold text-ink-900">{r.name}</div>
          <div className="text-xs text-ink-500">{r.shop} · {r.id.slice(0, 8)}</div>
        </div>
      ),
    },
    { key: "city", header: "Location", render: (r) => `${r.city}, ${r.state}` },
    ...(childRole === "distributor"
      ? [{ key: "retailers" as const, header: "Retailers", align: "right" as const, render: (r: NetworkUser) => r.retailers ?? 0 }]
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
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={role === "master-distributor" ? "Network tree" : "My retailers"}
        title={role === "master-distributor" ? "Distributors under you" : "Retailers under you"}
        description={role === "master-distributor"
          ? "Direct distributors. Override commissions, top-up wallets, freeze or graduate accounts."
          : "Retailers in your network. Approve fund requests, set commissions, and watch turnover."}
        actions={
          <>
            <ReportActions
              filename={`my-${childRole === "distributor" ? "distributors" : "retailers"}`}
              title={`JMP NextGenPay · My ${childRole === "distributor" ? "Distributors" : "Retailers"}`}
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
                {role === "master-distributor" ? "Onboard distributor" : "Onboard retailer"}
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

      <DataTable
        title={loading ? "Loading..." : `${users.length} ${childRole === "distributor" ? "distributors" : "retailers"}`}
        columns={cols}
        data={users}
        empty={`No ${childRole}s in your network yet.`}
      />
    </div>
  );
}
