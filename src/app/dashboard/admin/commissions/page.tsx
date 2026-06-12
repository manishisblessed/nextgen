"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Button } from "@/components/ui/Button";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { commissionSlabs, type CommissionSlab } from "@/lib/data";
import { Plus, Save } from "lucide-react";

export default function AdminCommissionsPage() {
  const cols: Column<CommissionSlab>[] = [
    { key: "service", header: "Service", render: (r) => <span className="font-semibold text-ink-900">{r.service}</span> },
    { key: "retailer", header: "Retailer payout", align: "right" },
    { key: "distributor", header: "Distributor override", align: "right" },
    { key: "master", header: "Master override", align: "right" },
    {
      key: "actions",
      header: "",
      align: "right",
      render: () => (
        <button className="text-xs font-semibold text-brand-700 hover:underline">
          Edit slab
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Commission master"
        description="Master rate-card across services. Distributors can only set rates within these caps."
        actions={
          <>
            <ReportActions
              filename="commission-master"
              title="JMP NextGenPay · Commission Master"
              subtitle="Service-wise rate-card"
              columns={[
                { key: "service", header: "Service" },
                { key: "retailer", header: "Retailer payout" },
                { key: "distributor", header: "Distributor override" },
                { key: "master", header: "Master override" }
              ]}
              rows={commissionSlabs}
            />
            <Button variant="outline">
              <Plus className="h-4 w-4" /> New slab
            </Button>
            <Button>
              <Save className="h-4 w-4" /> Publish v18
            </Button>
          </>
        }
      />
      <DataTable
        title="Service rate-card"
        description="Retailer + Distributor + Master = total platform payout per transaction."
        columns={cols}
        data={commissionSlabs}
      />
    </div>
  );
}
