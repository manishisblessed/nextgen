"use client";

import { CreditCard, Store, IndianRupee, Percent } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportActions } from "@/components/dashboard/ReportActions";
import {
  pgMerchants,
  pgTransactions,
  type PgMerchant,
  type PgTransaction
} from "@/lib/data";
import { formatINR } from "@/lib/utils";

export default function AdminPgPage() {
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
          <>
            <ReportActions
              filename="pg-merchants"
              title="JMP NextGenPay · PG Merchants"
              subtitle="Payment gateway merchant master"
              columns={[
                { key: "mid", header: "MID" },
                { key: "business", header: "Business" },
                { key: "name", header: "Owner" },
                { key: "city", header: "City" },
                { key: "mdr", header: "MDR" },
                { key: "volume30d", header: "Volume 30d (INR)" },
                { key: "status", header: "Status" }
              ]}
              rows={pgMerchants}
            />
            <Button>
              <Store className="h-4 w-4" /> Onboard merchant
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Live Merchants" value={String(pgMerchants.filter((m) => m.status === "Live").length)} icon={Store} accent="brand" />
        <StatCard label="GMV (30d)" value="₹1.62 Cr" delta="+18.4%" icon={IndianRupee} accent="emerald" />
        <StatCard label="MDR Revenue (30d)" value="₹1.84 L" delta="+12.1%" icon={Percent} accent="violet" />
        <StatCard label="Success Rate" value="96.2%" delta="+0.4%" icon={CreditCard} accent="accent" />
      </div>

      <DataTable
        title="Merchant master"
        description="All PG merchants with KYC status, enabled modes and MDR schemes."
        columns={merchantCols}
        data={pgMerchants}
      />

      <DataTable
        title="Live transaction feed"
        description="Latest orders across all merchants, with settlement state."
        columns={txnCols}
        data={pgTransactions}
      />
    </div>
  );
}
