"use client";

import { useMemo, useState } from "react";
import { History, Search, Filter } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TransactionsTable } from "@/components/dashboard/TransactionsTable";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { recentTransactions } from "@/lib/data";

export default function TransactionsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");

  const data = useMemo(() => {
    return recentTransactions.filter((t) => {
      const matchesQ =
        !q ||
        t.id.toLowerCase().includes(q.toLowerCase()) ||
        t.service.toLowerCase().includes(q.toLowerCase()) ||
        t.customer.toLowerCase().includes(q.toLowerCase());
      const matchesStatus = status === "All" || t.status === status;
      return matchesQ && matchesStatus;
    });
  }, [q, status]);

  const totals = useMemo(() => {
    const total = recentTransactions.reduce((s, t) => s + t.amount, 0);
    const commission = recentTransactions.reduce(
      (s, t) => s + t.commission,
      0
    );
    return { total, commission, count: recentTransactions.length };
  }, []);

  return (
    <div>
      <ServicePageHeader
        icon={History}
        title="Transactions"
        description="Search, filter and export every transaction processed through your account."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
            Total transactions
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-ink-900">
            {totals.count}
          </p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
            Total volume
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-ink-900">
            ₹ {totals.total.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
            Total commission
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-700">
            ₹ {totals.commission.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by ID, service or customer..."
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-40"
        >
          {["All", "Success", "Pending", "Failed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Button variant="outline" size="md">
          <Filter className="h-4 w-4" />
          More filters
        </Button>
        <ReportActions
          filename="transactions"
          title="JMP NextGenPay · Transactions"
          subtitle={`Filtered view · ${data.length} of ${recentTransactions.length} records`}
          columns={[
            { key: "id", header: "Txn ID" },
            { key: "service", header: "Service" },
            { key: "customer", header: "Customer" },
            { key: "amount", header: "Amount (INR)" },
            { key: "commission", header: "Commission (INR)" },
            { key: "status", header: "Status" },
            { key: "date", header: "Date" }
          ]}
          rows={data}
        />
      </div>

      <TransactionsTable data={data} showHeader={false} />
    </div>
  );
}
