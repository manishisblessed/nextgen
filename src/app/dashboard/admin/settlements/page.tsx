"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { settlements, type Settlement } from "@/lib/data";
import { formatINR } from "@/lib/utils";
import { Banknote } from "lucide-react";

export default function AdminSettlementsPage() {
  const cols: Column<Settlement>[] = [
    { key: "id", header: "Cycle ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "cycle", header: "Cycle" },
    { key: "counterparty", header: "Counterparty" },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Settled" ? "success" : r.status === "In Bank" ? "brand" : "warning"}>
          {r.status}
        </Badge>
      )
    },
    { key: "date", header: "Date" }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Settlements"
        description="T+1 nodal settlements across ICICI &amp; Yes Bank. Reconcile with NPCI files and bank statements."
        actions={
          <>
            <ReportActions
              filename="settlements"
              title="JMP NextGenPay · Settlements"
              subtitle="T+1 nodal settlements ledger"
              columns={[
                { key: "id", header: "Cycle ID" },
                { key: "cycle", header: "Cycle" },
                { key: "counterparty", header: "Counterparty" },
                { key: "amount", header: "Amount (INR)" },
                { key: "status", header: "Status" },
                { key: "date", header: "Date" }
              ]}
              rows={settlements}
            />
            <Button>
              <Banknote className="h-4 w-4" /> Run cycle
            </Button>
          </>
        }
      />
      <DataTable title="Recent cycles" columns={cols} data={settlements} />
    </div>
  );
}
