"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { TransactionsTable } from "@/components/dashboard/TransactionsTable";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { recentTransactions } from "@/lib/data";
import { formatINR } from "@/lib/utils";

const series = [
  { label: "AePS", color: "#185df5", values: [3200, 4100, 3800, 4600, 5200, 4900, 5800, 6100, 6800, 7200, 7400, 7800, 8400, 9200] },
  { label: "DMT", color: "#7c3aed", values: [1800, 2200, 2400, 2700, 3100, 3300, 3500, 3800, 4200, 4500, 4800, 5100, 5400, 5800] },
  { label: "Recharges", color: "#f97606", values: [4400, 4600, 4800, 5100, 5400, 5800, 6100, 6400, 6800, 7100, 7400, 7800, 8200, 8600] },
  { label: "Bills", color: "#059669", values: [1200, 1400, 1600, 1800, 1900, 2200, 2400, 2600, 2900, 3100, 3400, 3600, 3800, 4100] }
];

const serviceTrendRows = series.map((s) => ({
  service: s.label,
  total: s.values.reduce((a, b) => a + b, 0),
  peak: Math.max(...s.values),
  average: Math.round(s.values.reduce((a, b) => a + b, 0) / s.values.length),
  trend: s.values.join(" / ")
}));

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Business reports"
        description="Service-wise turnover, commissions and trends. Preview, then export to CSV or PDF."
        actions={
          <ReportActions
            filename="business-report"
            title="JMP NextGenPay · Business Report"
            subtitle="Service-wise turnover, commissions, transactions"
            columns={[
              { key: "id", header: "Txn ID" },
              { key: "service", header: "Service" },
              { key: "customer", header: "Customer" },
              { key: "amount", header: "Amount (INR)" },
              { key: "commission", header: "Commission (INR)" },
              { key: "status", header: "Status" },
              { key: "date", header: "Date" }
            ]}
            rows={recentTransactions}
          />
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Net turnover (MTD)", v: formatINR(184500) },
          { l: "Commissions earned", v: formatINR(8642) },
          { l: "Successful txns", v: "1,284" },
          { l: "Failure rate", v: "0.42%" }
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-ink-100 bg-white p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-500">{s.l}</p>
            <p className="mt-1 font-display text-xl font-bold text-ink-900">{s.v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-ink-100 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-ink-900">Service trends · last 14 days</h3>
          <div className="flex flex-wrap gap-2">
            <ReportActions
              filename="service-trends-14d"
              title="JMP NextGenPay · Service Trends (14 days)"
              subtitle="Daily totals per service"
              columns={[
                { key: "service", header: "Service" },
                { key: "total", header: "14-day total" },
                { key: "peak", header: "Peak day" },
                { key: "average", header: "Daily average" },
                { key: "trend", header: "Daily series" }
              ]}
              rows={serviceTrendRows}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {series.map((s) => (
            <div key={s.label} className="rounded-xl border border-ink-100 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-500">{s.label}</p>
                <span className="font-display text-sm font-bold text-ink-900">
                  {formatINR(s.values.reduce((a, b) => a + b, 0))}
                </span>
              </div>
              <div className="mt-3"><Sparkline values={s.values} color={s.color} height={70} /></div>
            </div>
          ))}
        </div>
      </div>

      <TransactionsTable />
    </div>
  );
}
