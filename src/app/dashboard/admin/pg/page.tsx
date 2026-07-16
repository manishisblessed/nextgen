"use client";

import { CreditCard, Store, IndianRupee, Percent } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/utils";

type PgMerchant = {
  mid: string;
  business: string;
  name: string;
  city: string;
  modes: string[];
  mdr: string;
  volume30d: number;
  status: string;
  onboarded: string;
};

type PgTransaction = {
  id: string;
  merchant: string;
  mode: string;
  amount: number;
  fee: number | null;
  status: string;
  settlement: string;
  date: string;
};

export default function AdminPgPage() {
  const merchants: PgMerchant[] = [];
  const transactions: PgTransaction[] = [];

  const merchantCols: Column<PgMerchant>[] = [
    { key: "mid", header: "MID", render: (r) => <span className="font-mono text-xs">{r.mid}</span> },
    {
      key: "business",
      header: "Merchant",
      render: (r) => (
        <div>
          <p className="font-semibold text-ink-900">{r.business}</p>
          <p className="text-xs text-ink-500">{r.name} · {r.city}</p>
        </div>
      )
    },
    { key: "modes", header: "Modes", render: (r) => <span className="text-xs">{r.modes.join(", ")}</span> },
    { key: "mdr", header: "MDR / Scheme", render: (r) => <span className="text-xs">{r.mdr}</span> },
    { key: "volume30d", header: "Volume (30d)", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.volume30d)}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Live" ? "success" : r.status === "Pending KYC" ? "warning" : "danger"}>
          {r.status}
        </Badge>
      )
    },
    { key: "onboarded", header: "Onboarded" }
  ];

  const txnCols: Column<PgTransaction>[] = [
    { key: "id", header: "Txn ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "merchant", header: "Merchant" },
    { key: "mode", header: "Mode" },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
    { key: "fee", header: "MDR Fee", align: "right", render: (r) => (r.fee ? formatINR(r.fee) : "—") },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Success" ? "success" : r.status === "Pending" ? "warning" : r.status === "Refunded" ? "brand" : "danger"}>
          {r.status}
        </Badge>
      )
    },
    { key: "settlement", header: "Settlement" },
    { key: "date", header: "Date" }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Payment Gateway"
        description="Merchant onboarding, MDR & scheme configuration, transaction monitoring and settlement control for the PG vertical."
        actions={
          <Button>
            <Store className="h-4 w-4" /> Onboard merchant
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Live Merchants" value="0" icon={Store} accent="brand" />
        <StatCard label="GMV (30d)" value={formatINR(0)} icon={IndianRupee} accent="emerald" />
        <StatCard label="MDR Revenue (30d)" value={formatINR(0)} icon={Percent} accent="violet" />
        <StatCard label="Success Rate" value="—" icon={CreditCard} accent="accent" />
      </div>

      <DataTable
        title="Merchant master"
        description="All PG merchants with KYC status, enabled modes and MDR schemes."
        columns={merchantCols}
        data={merchants}
      />

      <DataTable
        title="Live transaction feed"
        description="Latest orders across all merchants, with settlement state."
        columns={txnCols}
        data={transactions}
      />
    </div>
  );
}
