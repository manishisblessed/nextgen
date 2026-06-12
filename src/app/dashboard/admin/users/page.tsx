"use client";

import { useMemo, useState } from "react";
import { Search, Filter, MoreHorizontal, ShieldOff, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { networkUsers, type NetworkUser } from "@/lib/data";
import { formatINR } from "@/lib/utils";

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | NetworkUser["role"]>("all");
  const [status, setStatus] = useState<"all" | NetworkUser["status"]>("all");

  const filtered = useMemo(() => {
    return networkUsers.filter((u) => {
      if (role !== "all" && u.role !== role) return false;
      if (status !== "all" && u.status !== status) return false;
      if (q) {
        const t = q.toLowerCase();
        if (
          !u.name.toLowerCase().includes(t) &&
          !u.shop.toLowerCase().includes(t) &&
          !u.id.toLowerCase().includes(t) &&
          !u.city.toLowerCase().includes(t)
        )
          return false;
      }
      return true;
    });
  }, [q, role, status]);

  const columns: Column<NetworkUser>[] = [
    {
      key: "name",
      header: "User",
      render: (r) => (
        <div>
          <div className="font-semibold text-ink-900">{r.name}</div>
          <div className="text-xs text-ink-500">{r.shop} · {r.id}</div>
        </div>
      )
    },
    {
      key: "role",
      header: "Role",
      render: (r) => (
        <Badge variant={r.role === "master-distributor" ? "accent" : r.role === "distributor" ? "brand" : "default"}>
          {r.role}
        </Badge>
      )
    },
    { key: "city", header: "Location", render: (r) => `${r.city}, ${r.state}` },
    { key: "joined", header: "Joined" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Active" ? "success" : r.status === "Pending KYC" ? "warning" : "danger"}>
          {r.status}
        </Badge>
      )
    },
    { key: "walletBalance", header: "Wallet", align: "right", render: (r) => formatINR(r.walletBalance) },
    { key: "monthlyTurnover", header: "MTD", align: "right", render: (r) => formatINR(r.monthlyTurnover) },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          {r.status === "Active" ? (
            <button className="grid h-8 w-8 place-items-center rounded-lg text-rose-700 hover:bg-rose-50" title="Suspend">
              <ShieldOff className="h-4 w-4" />
            </button>
          ) : (
            <button className="grid h-8 w-8 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50" title="Reactivate">
              <ShieldCheck className="h-4 w-4" />
            </button>
          )}
          <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" title="More">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Users & shops"
        description="Search, filter and manage every retailer, distributor and master across the platform."
        actions={
          <ReportActions
            filename="users"
            title="JMP NextGenPay · Users & Shops"
            subtitle={`${filtered.length} of ${networkUsers.length} users`}
            columns={[
              { key: "id", header: "Code" },
              { key: "name", header: "Name" },
              { key: "shop", header: "Shop / Firm" },
              { key: "role", header: "Role" },
              { key: "city", header: "City" },
              { key: "state", header: "State" },
              { key: "joined", header: "Joined" },
              { key: "status", header: "Status" },
              { key: "walletBalance", header: "Wallet (INR)" },
              { key: "monthlyTurnover", header: "MTD Turnover (INR)" }
            ]}
            rows={filtered}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            placeholder="Search name, shop, ID, city..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-ink-400" />
          <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="h-10 w-44">
            <option value="all">All roles</option>
            <option value="retailer">Retailers</option>
            <option value="distributor">Distributors</option>
            <option value="master-distributor">Master distributors</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-10 w-44">
            <option value="all">Any status</option>
            <option value="Active">Active</option>
            <option value="Pending KYC">Pending KYC</option>
            <option value="Suspended">Suspended</option>
          </Select>
        </div>
      </div>

      <DataTable
        title={`${filtered.length} users`}
        description="Click on a row to view full profile, ledger and transactions."
        columns={columns}
        data={filtered}
        empty="No users match your filters."
      />
    </div>
  );
}
