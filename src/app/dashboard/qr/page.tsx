"use client";

import { useState } from "react";
import { QrCode, Copy, Check, IndianRupee, ScanLine, Timer } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  qrCodes,
  qrPayments,
  type QrCodeItem,
  type QrPayment
} from "@/lib/data";
import { formatINR } from "@/lib/utils";

const VPA = "nextgenpay.desai@icici";

export default function QrPage() {
  const [qrType, setQrType] = useState<"Static" | "Dynamic">("Static");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState(false);

  const upiLink = `upi://pay?pa=${VPA}&pn=${encodeURIComponent("NextGenPay Merchant")}${
    qrType === "Dynamic" && amount ? `&am=${amount}` : ""
  }&tn=${encodeURIComponent(label || "QR payment")}&cu=INR`;

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(upiLink)}`;

  function copy() {
    navigator.clipboard.writeText(upiLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const qrCols: Column<QrCodeItem>[] = [
    { key: "id", header: "QR ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    {
      key: "type",
      header: "Type",
      render: (r) => <Badge variant={r.type === "Static" ? "brand" : "accent"}>{r.type}</Badge>
    },
    { key: "label", header: "Label" },
    { key: "vpa", header: "UPI VPA", render: (r) => <span className="font-mono text-xs">{r.vpa}</span> },
    { key: "payments", header: "Payments", align: "right" },
    { key: "collected", header: "Collected", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.collected)}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Active" ? "success" : r.status === "Expired" ? "warning" : "default"}>
          {r.status}
        </Badge>
      )
    }
  ];

  const payCols: Column<QrPayment>[] = [
    { key: "id", header: "Payment ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "qrId", header: "QR", render: (r) => <span className="font-mono text-xs">{r.qrId}</span> },
    { key: "payer", header: "Payer VPA", render: (r) => <span className="font-mono text-xs">{r.payer}</span> },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Received" ? "success" : r.status === "Pending" ? "warning" : "danger"}>
          {r.status}
        </Badge>
      )
    },
    {
      key: "settled",
      header: "Settlement",
      render: (r) => (r.settled ? <Badge variant="brand">Settled</Badge> : <span className="text-xs text-ink-500">T+1 queue</span>)
    },
    { key: "date", header: "Date" }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="QR Payments"
        title="QR Code Collections"
        description="Generate branded static & dynamic UPI QR codes, get paid instantly and reconcile every payment with T+1 settlement."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected Today" value="₹14,070" delta="+22%" icon={IndianRupee} accent="brand" />
        <StatCard label="Scans Today" value="38" delta="+9" icon={ScanLine} accent="violet" />
        <StatCard label="Active QR Codes" value={String(qrCodes.filter((q) => q.status === "Active").length)} icon={QrCode} accent="emerald" />
        <StatCard label="Awaiting Settlement" value="₹14,130" icon={Timer} accent="accent" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4 rounded-2xl border border-ink-100 bg-white p-6"
        >
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <QrCode className="h-4 w-4" />
            </span>
            <h3 className="font-display text-base font-semibold text-ink-900">
              Generate QR code
            </h3>
          </div>

          <div>
            <Label>QR type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["Static", "Dynamic"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setQrType(t)}
                  className={
                    qrType === t
                      ? "rounded-xl border border-brand-600 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700"
                      : "rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-600 hover:border-ink-300"
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-500">
              {qrType === "Static"
                ? "Fixed QR for your counter — customer enters the amount."
                : "One-time QR with a pre-filled amount, ideal for invoices."}
            </p>
          </div>

          {qrType === "Dynamic" && (
            <div>
              <Label htmlFor="qr-amount">Amount (₹)</Label>
              <Input
                id="qr-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
          )}

          <div>
            <Label htmlFor="qr-label">Label (optional)</Label>
            <Input
              id="qr-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={qrType === "Static" ? "e.g. Shop Counter 1" : "e.g. Invoice #4427"}
            />
          </div>

          <div>
            <Label>Linked UPI VPA</Label>
            <div className="flex items-center justify-between rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
              <span className="font-mono text-sm font-semibold text-ink-900">{VPA}</span>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>

          <Button type="button" size="lg" className="w-full">
            Download branded QR
          </Button>
        </form>

        <div className="rounded-2xl border border-ink-100 bg-gradient-to-br from-brand-50 to-accent-50 p-6 text-center">
          <h3 className="font-display text-base font-semibold text-ink-900">
            {qrType === "Static" ? "Your counter QR" : "Invoice QR preview"}
          </h3>
          <p className="mt-1 text-xs text-ink-600">
            Works with PhonePe, Google Pay, Paytm & every UPI app.
          </p>
          <div className="mx-auto mt-6 grid h-56 w-56 place-items-center rounded-2xl bg-white shadow-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="UPI QR code" className="h-44 w-44 rounded-xl" />
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-ink-700 shadow-sm">
            Pay to <strong>{VPA}</strong>
            {qrType === "Dynamic" && amount && <span>• ₹{amount}</span>}
          </div>
        </div>
      </div>

      <DataTable
        title="My QR codes"
        description="All static and dynamic QR codes issued to your outlets."
        columns={qrCols}
        data={qrCodes}
      />

      <DataTable
        title="Recent QR payments"
        description="Real-time UPI credits received against your QR codes."
        columns={payCols}
        data={qrPayments}
      />
    </div>
  );
}
