"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Button } from "@/components/ui/Button";
import { Save, Sparkles } from "lucide-react";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { commissionSlabs, type CommissionSlab } from "@/lib/data";
import { getSession, type Role } from "@/lib/auth";

export default function CommissionsPage() {
  const [role, setRole] = useState<Role>("distributor");

  useEffect(() => {
    const s = getSession();
    if (s) setRole(s.role);
  }, []);

  const cols: Column<CommissionSlab>[] = [
    { key: "service", header: "Service", render: (r) => <span className="font-semibold text-ink-900">{r.service}</span> },
    {
      key: "retailer",
      header: "Retailer payout",
      align: "right",
      render: (r) => (
        <input
          defaultValue={r.retailer}
          className="w-28 rounded-lg border border-ink-200 px-2 py-1 text-right text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      )
    },
    { key: "distributor", header: "Your override", align: "right" },
    ...(role === "master-distributor"
      ? [{ key: "master" as const, header: "Master override", align: "right" as const }]
      : [])
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title={role === "master-distributor" ? "Commission master" : "Commission slabs"}
        description={role === "master-distributor"
          ? "Set rate-cards for your distributors. They can only set retailer payouts within these caps."
          : "Configure how much each retailer earns per transaction. Capped by master rate-card."}
        actions={
          <>
            <ReportActions
              filename="commission-slabs"
              title={
                role === "master-distributor"
                  ? "Payprism India · Commission Master"
                  : "Payprism India · Commission Slabs"
              }
              subtitle="Service-wise rate-card"
              columns={[
                { key: "service", header: "Service" },
                { key: "retailer", header: "Retailer payout" },
                { key: "distributor", header: "Distributor override" },
                ...(role === "master-distributor"
                  ? [
                      {
                        key: "master" as const,
                        header: "Master override"
                      }
                    ]
                  : [])
              ]}
              rows={commissionSlabs}
            />
            <Button variant="outline">
              <Sparkles className="h-4 w-4" /> Apply template
            </Button>
            <Button>
              <Save className="h-4 w-4" /> Publish v9
            </Button>
          </>
        }
      />

      <DataTable title="Service rate-card" columns={cols} data={commissionSlabs} />
    </div>
  );
}
