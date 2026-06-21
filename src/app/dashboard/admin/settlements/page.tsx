"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { formatINR } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

type SettlementRow = {
  id: string;
  cycle: string;
  counterparty: string;
  amount: number;
  txnCount: number;
  status: "Settled" | "In Bank" | "Reconciling";
  date: string;
};

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settlements");
      const data = await res.json();
      if (data.settlements) setSettlements(data.settlements);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettlements(); }, [fetchSettlements]);

  const cols: Column<SettlementRow>[] = [
    { key: "id", header: "Cycle ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "cycle", header: "Cycle" },
    { key: "counterparty", header: "Counterparty" },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
    { key: "txnCount", header: "Txns", align: "right", render: (r) => r.txnCount.toLocaleString("en-IN") },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Settled" ? "success" : r.status === "In Bank" ? "brand" : "warning"}>
          {r.status}
        </Badge>
      ),
    },
    { key: "date", header: "Date" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Settlements"
        description="T+1 nodal settlements derived from transaction data. Reconcile with bank statements."
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
                { key: "txnCount", header: "Transactions" },
                { key: "status", header: "Status" },
                { key: "date", header: "Date" },
              ]}
              rows={settlements}
            />
            <Button variant="outline" onClick={fetchSettlements} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />
      <DataTable
        title={loading ? "Loading..." : "Recent cycles"}
        columns={cols}
        data={settlements}
        empty="No settlement data yet."
      />
    </div>
  );
}
