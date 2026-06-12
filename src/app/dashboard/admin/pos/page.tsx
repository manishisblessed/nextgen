"use client";

import { Monitor, PackagePlus, IndianRupee, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportActions } from "@/components/dashboard/ReportActions";
import {
  posMachines,
  posRentals,
  type PosMachine,
  type PosRental
} from "@/lib/data";
import { formatINR } from "@/lib/utils";

export default function AdminPosPage() {
  const machineCols: Column<PosMachine>[] = [
    { key: "serial", header: "Terminal ID", render: (r) => <span className="font-mono text-xs">{r.serial}</span> },
    { key: "model", header: "Model" },
    { key: "assignedTo", header: "Assigned To" },
    { key: "city", header: "Location" },
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
    { key: "monthlyRent", header: "Rent / mo", align: "right", render: (r) => (r.monthlyRent ? formatINR(r.monthlyRent) : "—") },
    { key: "volume30d", header: "Volume (30d)", align: "right", render: (r) => (r.volume30d ? <span className="font-semibold">{formatINR(r.volume30d)}</span> : "—") }
  ];

  const rentalCols: Column<PosRental>[] = [
    { key: "invoice", header: "Invoice", render: (r) => <span className="font-mono text-xs">{r.invoice}</span> },
    { key: "merchant", header: "Merchant" },
    { key: "terminal", header: "Terminal", render: (r) => <span className="font-mono text-xs">{r.terminal}</span> },
    { key: "plan", header: "Plan" },
    { key: "amount", header: "Amount", align: "right", render: (r) => formatINR(r.amount) },
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

  const inStock = posMachines.filter((m) => m.status === "In Stock").length;
  const active = posMachines.filter((m) => m.status === "Active").length;
  const rentDue = posRentals.filter((r) => r.status !== "Paid").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="POS Fleet"
        description="Machine inventory, merchant assignment, rental billing and device health across the entire POS estate."
        actions={
          <>
            <ReportActions
              filename="pos-inventory"
              title="JMP NextGenPay · POS Inventory"
              subtitle="Terminal fleet & assignment register"
              columns={[
                { key: "serial", header: "Terminal ID" },
                { key: "model", header: "Model" },
                { key: "assignedTo", header: "Assigned To" },
                { key: "city", header: "Location" },
                { key: "status", header: "Status" },
                { key: "monthlyRent", header: "Rent (INR)" },
                { key: "volume30d", header: "Volume 30d (INR)" }
              ]}
              rows={posMachines}
            />
            <Button>
              <PackagePlus className="h-4 w-4" /> Add machines
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Terminals" value={String(active)} delta="+3" icon={Monitor} accent="brand" />
        <StatCard label="In Stock" value={String(inStock)} icon={PackagePlus} accent="violet" />
        <StatCard label="Fleet Volume (30d)" value="₹99.9 L" delta="+11.4%" icon={IndianRupee} accent="emerald" />
        <StatCard label="Rent Outstanding" value={formatINR(rentDue)} icon={ReceiptText} accent="accent" />
      </div>

      <DataTable
        title="Terminal inventory"
        description="Every POS machine — assigned, in stock, faulty or returned."
        columns={machineCols}
        data={posMachines}
      />

      <DataTable
        title="Rental billing"
        description="Monthly rental invoices raised against merchant wallets."
        columns={rentalCols}
        data={posRentals}
      />
    </div>
  );
}
