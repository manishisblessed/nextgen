"use client";

import {
  Monitor,
  IndianRupee,
  ArrowLeftRight,
  ReceiptText,
  Wrench
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  posMachines,
  posTransactions,
  posRentals,
  type PosMachine,
  type PosTransaction,
  type PosRental
} from "@/lib/data";
import { formatINR } from "@/lib/utils";

const myMachines = posMachines.filter((m) => m.assignedTo !== "—");

export default function PosPage() {
  const machineCols: Column<PosMachine>[] = [
    { key: "serial", header: "Terminal ID", render: (r) => <span className="font-mono text-xs">{r.serial}</span> },
    { key: "model", header: "Model" },
    { key: "assignedTo", header: "Merchant" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Active" ? "success" : r.status === "In Stock" ? "brand" : r.status === "Faulty" ? "danger" : "default"}>
          {r.status}
        </Badge>
      )
    },
    { key: "plan", header: "Plan" },
    { key: "txns30d", header: "Txns (30d)", align: "right" },
    { key: "volume30d", header: "Volume (30d)", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.volume30d)}</span> }
  ];

  const txnCols: Column<PosTransaction>[] = [
    { key: "id", header: "Txn ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "terminal", header: "Terminal", render: (r) => <span className="font-mono text-xs">{r.terminal}</span> },
    { key: "mode", header: "Mode" },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Approved" ? "success" : r.status === "Voided" ? "warning" : r.status === "Refunded" ? "brand" : "danger"}>
          {r.status}
        </Badge>
      )
    },
    { key: "settlement", header: "Settlement" },
    { key: "date", header: "Date" }
  ];

  const rentalCols: Column<PosRental>[] = [
    { key: "invoice", header: "Invoice", render: (r) => <span className="font-mono text-xs">{r.invoice}</span> },
    { key: "terminal", header: "Terminal", render: (r) => <span className="font-mono text-xs">{r.terminal}</span> },
    { key: "plan", header: "Plan" },
    { key: "amount", header: "Rent", align: "right", render: (r) => formatINR(r.amount) },
    { key: "dueDate", header: "Due Date" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Paid" ? "success" : r.status === "Due" ? "warning" : "danger"}>
          {r.status}
        </Badge>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Point of Sale"
        title="POS Terminals"
        description="Live terminals, card & UPI transactions, rental subscriptions and T+1 settlement — everything about your POS fleet."
        actions={
          <Button variant="outline">
            <Wrench className="h-4 w-4" /> Raise service request
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Terminals" value={String(myMachines.filter((m) => m.status === "Active").length)} icon={Monitor} accent="brand" />
        <StatCard label="POS Volume (30d)" value="₹99.9 L" delta="+11.4%" icon={IndianRupee} accent="emerald" />
        <StatCard label="Transactions (30d)" value="2,749" delta="+324" icon={ArrowLeftRight} accent="violet" />
        <StatCard label="Rent Due" value={formatINR(posRentals.filter((r) => r.status !== "Paid").reduce((s, r) => s + r.amount, 0))} icon={ReceiptText} accent="accent" />
      </div>

      <DataTable
        title="My terminals"
        description="POS machines assigned to your outlets."
        columns={machineCols}
        data={myMachines}
      />

      <DataTable
        title="Recent POS transactions"
        description="Card, UPI, BharatQR and Tap & Pay transactions across terminals."
        columns={txnCols}
        data={posTransactions}
      />

      <DataTable
        title="Rental invoices"
        description="Monthly rental subscription for your terminals, auto-debited from wallet."
        columns={rentalCols}
        data={posRentals}
      />
    </div>
  );
}
