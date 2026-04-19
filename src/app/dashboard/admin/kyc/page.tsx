"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Eye, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { kycRequests, type KycRequest } from "@/lib/data";

export default function AdminKycPage() {
  const [rows, setRows] = useState<KycRequest[]>(kycRequests);
  const pending = rows.filter((r) => r.status === "Awaiting Review");

  const update = (id: string, status: KycRequest["status"]) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));

  const cols: Column<KycRequest>[] = [
    {
      key: "name",
      header: "Applicant",
      render: (r) => (
        <div>
          <div className="font-semibold text-ink-900">{r.name}</div>
          <div className="text-xs text-ink-500">{r.shop} · {r.city}</div>
        </div>
      )
    },
    { key: "role", header: "Role", render: (r) => <Badge variant={r.role === "distributor" ? "brand" : "default"}>{r.role}</Badge> },
    { key: "pan", header: "PAN" },
    { key: "aadhaar", header: "Aadhaar" },
    { key: "submittedOn", header: "Submitted" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Verified" ? "success" : r.status === "Rejected" ? "danger" : "warning"}>
          {r.status}
        </Badge>
      )
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button className="grid h-8 w-8 place-items-center rounded-lg text-brand-700 hover:bg-brand-50" title="Inspect documents">
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={() => update(r.id, "Verified")}
            disabled={r.status !== "Awaiting Review"}
            className="grid h-8 w-8 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50 disabled:opacity-30"
            title="Approve"
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => update(r.id, "Rejected")}
            disabled={r.status !== "Awaiting Review"}
            className="grid h-8 w-8 place-items-center rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-30"
            title="Reject"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="KYC approvals"
        description="Review applicant documents, validate PAN/Aadhaar, and approve or reject."
        actions={
          <Button variant="outline">
            <ShieldCheck className="h-4 w-4" /> Auto-verify (DigiLocker)
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Awaiting review" value={pending.length} tone="warning" />
        <Stat label="Verified · MTD" value={rows.filter((r) => r.status === "Verified").length + 142} tone="success" />
        <Stat label="Rejected · MTD" value={rows.filter((r) => r.status === "Rejected").length + 6} tone="danger" />
      </div>

      <DataTable title="KYC queue" columns={cols} data={rows} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" | "warning" }) {
  const map = {
    success: "from-emerald-500 to-emerald-700 text-emerald-50",
    danger: "from-rose-500 to-rose-700 text-rose-50",
    warning: "from-amber-500 to-amber-700 text-amber-50"
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${map[tone]} p-5 shadow-soft`}>
      <p className="text-xs font-bold uppercase tracking-widest opacity-90">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}
