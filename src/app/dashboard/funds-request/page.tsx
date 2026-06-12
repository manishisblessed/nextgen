"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Plus, Send } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { fundRequests, type FundRequest } from "@/lib/data";
import { getSession, type Role } from "@/lib/auth";
import { formatINR, generateRefId } from "@/lib/utils";

export default function FundsRequestPage() {
  const [role, setRole] = useState<Role>("retailer");
  const [rows, setRows] = useState<FundRequest[]>(fundRequests);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s) setRole(s.role);
  }, []);

  const isApprover = role !== "retailer";

  const decide = (id: string, status: "Approved" | "Rejected") =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));

  const cols: Column<FundRequest>[] = [
    { key: "id", header: "Request", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    {
      key: "fromName",
      header: isApprover ? "From retailer" : "Requested by",
      render: (r) => (
        <div>
          <div className="font-semibold text-ink-900">{r.fromName}</div>
          <div className="text-xs text-ink-500">{r.fromId}</div>
        </div>
      )
    },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
    { key: "mode", header: "Mode" },
    { key: "reference", header: "Reference", render: (r) => <span className="font-mono text-xs">{r.reference}</span> },
    { key: "date", header: "When", className: "whitespace-nowrap text-xs text-ink-500" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Approved" ? "success" : r.status === "Rejected" ? "danger" : "warning"}>
          {r.status}
        </Badge>
      )
    },
    ...(isApprover
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            render: (r: FundRequest) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => decide(r.id, "Approved")} disabled={r.status !== "Pending"} className="grid h-8 w-8 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50 disabled:opacity-30" title="Approve">
                  <CheckCircle2 className="h-4 w-4" />
                </button>
                <button onClick={() => decide(r.id, "Rejected")} disabled={r.status !== "Pending"} className="grid h-8 w-8 place-items-center rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-30" title="Reject">
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            )
          }
        ]
      : [])
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isApprover ? "Approvals" : "Wallet"}
        title={isApprover ? "Fund requests from your network" : "Request funds"}
        description={isApprover
          ? "Approve incoming wallet top-up requests with bank reference. Auto-credit on approval."
          : "Submit your bank deposit reference to top up your NextGenPay wallet within minutes."}
        actions={
          <>
            <ReportActions
              filename="fund-requests"
              title="JMP NextGenPay · Fund Requests"
              subtitle={isApprover ? "Incoming approvals" : "My requests"}
              columns={[
                { key: "id", header: "Request ID" },
                { key: "fromName", header: "Requested by" },
                { key: "fromId", header: "Code" },
                { key: "toId", header: "To" },
                { key: "amount", header: "Amount (INR)" },
                { key: "mode", header: "Mode" },
                { key: "reference", header: "Reference / UTR" },
                { key: "status", header: "Status" },
                { key: "date", header: "When" }
              ]}
              rows={rows}
            />
            {!isApprover && (
              <Button onClick={() => setShowNew(true)}>
                <Plus className="h-4 w-4" /> New request
              </Button>
            )}
          </>
        }
      />

      {showNew && !isApprover && (
        <NewRequestForm
          onCancel={() => setShowNew(false)}
          onSubmit={(req) => {
            setRows([req, ...rows]);
            setShowNew(false);
          }}
        />
      )}

      <DataTable title={`${rows.length} requests`} columns={cols} data={rows} />
    </div>
  );
}

function NewRequestForm({
  onSubmit,
  onCancel
}: {
  onSubmit: (r: FundRequest) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("10000");
  const [mode, setMode] = useState<FundRequest["mode"]>("IMPS");
  const [ref, setRef] = useState("");

  return (
    <form
      className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/60 to-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          id: generateRefId("FR-"),
          fromId: "JNPR3091",
          fromName: "Aman Sharma",
          toId: "JNPD2003",
          amount: parseInt(amount, 10),
          mode,
          reference: ref || "MANUAL",
          date: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) + " ",
          status: "Pending"
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <Label>Amount</Label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Deposit mode</Label>
          <Select value={mode} onChange={(e) => setMode(e.target.value as FundRequest["mode"])}>
            <option>IMPS</option><option>NEFT</option><option>RTGS</option><option>UPI</option><option>Cash Deposit</option>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Bank reference / UTR</Label>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="P2A8765 / NEFT123..." />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit"><Send className="h-4 w-4" /> Submit</Button>
      </div>
    </form>
  );
}
