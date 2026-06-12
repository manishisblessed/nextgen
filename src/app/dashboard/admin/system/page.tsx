"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Badge } from "@/components/ui/Badge";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { systemMetrics, type SystemMetric } from "@/lib/data";

export default function AdminSystemPage() {
  const cols: Column<SystemMetric>[] = [
    { key: "service", header: "Service", render: (r) => <span className="font-semibold text-ink-900">{r.service}</span> },
    { key: "uptime", header: "Uptime (24h)", align: "right" },
    { key: "p95ms", header: "P95 latency", align: "right", render: (r) => `${r.p95ms} ms` },
    { key: "txnsToday", header: "Txns today", align: "right", render: (r) => r.txnsToday.toLocaleString("en-IN") },
    {
      key: "errorRate",
      header: "Error rate",
      align: "right",
      render: (r) => {
        const n = parseFloat(r.errorRate);
        return (
          <Badge variant={n > 0.2 ? "danger" : n > 0.1 ? "warning" : "success"}>{r.errorRate}</Badge>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="System health"
        description="Live SLO board for every payment switch and service. Pages PagerDuty when error budget burns &gt; 2%."
        actions={
          <ReportActions
            filename="system-health"
            title="JMP NextGenPay · System Health"
            subtitle="Per-service SLO snapshot"
            columns={[
              { key: "service", header: "Service" },
              { key: "uptime", header: "Uptime (24h)" },
              { key: "p95ms", header: "P95 latency (ms)" },
              { key: "txnsToday", header: "Txns today" },
              { key: "errorRate", header: "Error rate" }
            ]}
            rows={systemMetrics}
          />
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="GMV / hour" delta="+9.4%" tone="emerald" values={[820, 880, 920, 1020, 980, 1100, 1180, 1240, 1320, 1410, 1480, 1520, 1580, 1640, 1720, 1810]} />
        <Card title="Errors / hour" delta="-12%" tone="rose" values={[42, 38, 41, 36, 33, 30, 28, 31, 28, 24, 22, 20, 18, 17, 16, 15]} />
        <Card title="P95 latency" delta="+3 ms" tone="brand" values={[420, 430, 425, 440, 432, 421, 418, 412, 405, 401, 399, 410, 415, 420, 412, 410]} />
      </div>

      <DataTable title="Service SLOs" columns={cols} data={systemMetrics} />
    </div>
  );
}

function Card({
  title,
  delta,
  values,
  tone
}: {
  title: string;
  delta: string;
  values: number[];
  tone: "emerald" | "rose" | "brand";
}) {
  const colors = { emerald: "#059669", rose: "#e11d48", brand: "#185df5" };
  const badge = { emerald: "bg-emerald-50 text-emerald-700", rose: "bg-rose-50 text-rose-700", brand: "bg-brand-50 text-brand-700" };
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-500">{title}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[tone]}`}>{delta}</span>
      </div>
      <div className="mt-3">
        <Sparkline values={values} color={colors[tone]} height={60} />
      </div>
    </div>
  );
}
