"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { billers, type Biller } from "@/lib/data";
import { Settings2 } from "lucide-react";

export default function AdminBillersPage() {
  const cols: Column<Biller>[] = [
    { key: "category", header: "Category", render: (r) => <span className="font-semibold text-ink-900">{r.category}</span> },
    { key: "count", header: "Billers", align: "right" },
    { key: "routing", header: "Routing" },
    { key: "uptime", header: "Uptime (24h)", align: "right" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Live" ? "success" : r.status === "Degraded" ? "warning" : "danger"}>
          {r.status}
        </Badge>
      )
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: () => (
        <button className="text-xs font-semibold text-brand-700 hover:underline">
          Configure
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Billers & routing"
        description="Manage 1,200+ billers across BBPS, NPCI, NETC and direct integrations. Configure failover routes, toggle live, and monitor uptime."
        actions={
          <>
            <ReportActions
              filename="billers"
              title="Payprism India · Billers & Routing"
              subtitle="Category-level uptime and routing"
              columns={[
                { key: "category", header: "Category" },
                { key: "count", header: "Billers" },
                { key: "routing", header: "Routing" },
                { key: "uptime", header: "Uptime (24h)" },
                { key: "status", header: "Status" }
              ]}
              rows={billers}
            />
            <Button variant="outline">
              <Settings2 className="h-4 w-4" /> Routing rules
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { l: "Live billers", v: "1,238" },
          { l: "Categories", v: "12" },
          { l: "Avg uptime", v: "99.91%" },
          { l: "Degraded now", v: "2", tone: "warn" as const },
          { l: "Down now", v: "0", tone: "ok" as const }
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-ink-100 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-500">{s.l}</p>
            <p className="mt-1 font-display text-xl font-bold text-ink-900">{s.v}</p>
          </div>
        ))}
      </div>

      <DataTable title="Categories" columns={cols} data={billers} />
    </div>
  );
}
