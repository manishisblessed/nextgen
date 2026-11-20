"use client";

import { X, Printer } from "lucide-react";

type Row = Record<string, unknown>;

type Props = {
  row: Row | null;
  onClose: () => void;
};

function inr(n: unknown): string {
  if (typeof n !== "number") return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "—" || v === "") return "—";
  return String(v);
}

function toDateTimeStr(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function SlipRow({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-xs text-ink-500">{label}</span>
      <span className={`text-right text-xs text-ink-800 ${mono ? "font-mono" : ""} ${bold ? "font-bold" : "font-medium"}`}>
        {value || "—"}
      </span>
    </div>
  );
}

export function BillSlipModal({ row, onClose }: Props) {
  if (!row) return null;

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=440,height=720");
    if (!win) return;
    win.document.write(buildSlipHtml(row));
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const mobile = fmt(row.mobile);
  const card = fmt(row.card);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="font-display text-base font-semibold text-ink-900">Bill Payment Slip</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 active:bg-brand-800"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Slip content */}
        <div className="max-h-[80vh] overflow-y-auto p-5">
          {/* Brand header */}
          <div className="mb-4 border-b border-dashed border-ink-200 pb-4 text-center">
            <p className="font-display text-lg font-bold text-brand-700">NextGenPay</p>
            <p className="text-xs text-ink-400">Bill Payment Receipt</p>
          </div>

          <div className="space-y-2.5">
            <SlipRow label="Date & Time" value={toDateTimeStr(row.date)} />
            <SlipRow label="Order No." value={fmt(row.orderNo)} mono />
            <SlipRow label="Order ID" value={fmt(row.orderId)} mono />
            <SlipRow label="Customer Name" value={fmt(row.customerName)} />
            <SlipRow label="Biller" value={fmt(row.bankName)} />
            {mobile !== "—" && <SlipRow label="Mobile" value={mobile} mono />}
            {card !== "—" && <SlipRow label="Card No." value={card} mono />}
          </div>

          {/* Amount breakdown */}
          <div className="my-4 space-y-2 border-t border-dashed border-ink-200 pt-4">
            <SlipRow label="Payment Amount" value={inr(row.paymentAmount)} />
            <SlipRow label="Service Charge" value={inr(row.charge)} />
            <SlipRow label="GST (18%)" value={inr(row.gst)} />
            <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2.5">
              <span className="text-sm font-bold text-ink-900">Total Payment</span>
              <span className="font-mono text-sm font-bold text-ink-900">{inr(row.totalDebit)}</span>
            </div>
          </div>

          {/* Reference / status */}
          <div className="space-y-2.5 border-t border-dashed border-ink-200 pt-4">
            <SlipRow
              label="Status"
              value={fmt(row.status)}
              bold
            />
            <SlipRow label="Reference No." value={fmt(row.referenceNo)} mono />
            <SlipRow label="Txn Ref" value={fmt(row.refId)} mono />
            <SlipRow label="Retailer ID" value={fmt(row.retailerId)} mono />
          </div>

          <p className="mt-4 text-center text-[10px] text-ink-400">
            Thank you for using NextGenPay
          </p>
        </div>
      </div>
    </div>
  );
}

function buildSlipHtml(row: Row): string {
  const f = (v: unknown) => (v === null || v === undefined || v === "—" || v === "") ? "—" : String(v);
  const money = (n: unknown) =>
    typeof n === "number"
      ? `&#8377;${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—";
  const dt = row.date ? new Date(String(row.date)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

  const infoRows: [string, string, boolean?][] = [
    ["Date & Time", dt],
    ["Order No.", f(row.orderNo), true],
    ["Order ID", f(row.orderId), true],
    ["Customer Name", f(row.customerName)],
    ["Biller", f(row.bankName)],
  ];
  if (f(row.mobile) !== "—") infoRows.push(["Mobile", f(row.mobile), true]);
  if (f(row.card) !== "—") infoRows.push(["Card No.", f(row.card), true]);

  const statusColor = f(row.status).toUpperCase() === "SUCCESS" ? "#059669" : "#6b7280";

  const rows = (arr: [string, string, boolean?][]) =>
    arr.map(([l, v, m]) => `
      <tr>
        <td style="padding:4px 10px 4px 0;color:#6b7280;font-size:11px;white-space:nowrap;">${l}</td>
        <td style="padding:4px 0;text-align:right;font-size:11px;font-family:${m ? "monospace" : "inherit"};font-weight:500;word-break:break-all;">${v}</td>
      </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Bill Payment Slip · NextGenPay</title>
  <style>
    @page { size: 80mm auto; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 10px; font-size: 12px; color: #111827; background: #fff; }
    .header { text-align: center; border-bottom: 1px dashed #d1d5db; padding-bottom: 10px; margin-bottom: 10px; }
    .header h1 { margin: 0 0 2px; font-size: 17px; color: #1d4ed8; letter-spacing: -0.3px; }
    .header p { margin: 0; font-size: 10px; color: #9ca3af; }
    table { width: 100%; border-collapse: collapse; }
    .divider { border: none; border-top: 1px dashed #d1d5db; margin: 8px 0; }
    .total-box { display: flex; justify-content: space-between; align-items: center; background: #eff6ff; padding: 7px 10px; border-radius: 8px; margin: 8px 0; }
    .total-box span { font-size: 13px; font-weight: 700; }
    .footer { text-align: center; font-size: 9px; color: #9ca3af; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #d1d5db; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>NextGenPay</h1>
    <p>Bill Payment Receipt</p>
  </div>

  <table>${rows(infoRows)}</table>

  <hr class="divider"/>

  <table>
    <tr>
      <td style="padding:3px 10px 3px 0;color:#6b7280;font-size:11px;">Payment Amount</td>
      <td style="padding:3px 0;text-align:right;font-size:11px;font-weight:500;">${money(row.paymentAmount)}</td>
    </tr>
    <tr>
      <td style="padding:3px 10px 3px 0;color:#6b7280;font-size:11px;">Service Charge</td>
      <td style="padding:3px 0;text-align:right;font-size:11px;font-weight:500;">${money(row.charge)}</td>
    </tr>
    <tr>
      <td style="padding:3px 10px 3px 0;color:#6b7280;font-size:11px;">GST (18%)</td>
      <td style="padding:3px 0;text-align:right;font-size:11px;font-weight:500;">${money(row.gst)}</td>
    </tr>
  </table>

  <div class="total-box">
    <span>Total Payment</span>
    <span style="font-family:monospace;">${money(row.totalDebit)}</span>
  </div>

  <hr class="divider"/>

  <table>
    <tr>
      <td style="padding:3px 10px 3px 0;color:#6b7280;font-size:11px;">Status</td>
      <td style="padding:3px 0;text-align:right;font-size:11px;font-weight:700;color:${statusColor};">${f(row.status)}</td>
    </tr>
    <tr>
      <td style="padding:3px 10px 3px 0;color:#6b7280;font-size:11px;">Reference No.</td>
      <td style="padding:3px 0;text-align:right;font-size:10px;font-family:monospace;word-break:break-all;">${f(row.referenceNo)}</td>
    </tr>
    <tr>
      <td style="padding:3px 10px 3px 0;color:#6b7280;font-size:11px;">Txn Ref</td>
      <td style="padding:3px 0;text-align:right;font-size:10px;font-family:monospace;word-break:break-all;">${f(row.refId)}</td>
    </tr>
    <tr>
      <td style="padding:3px 10px 3px 0;color:#6b7280;font-size:11px;">Retailer ID</td>
      <td style="padding:3px 0;text-align:right;font-size:10px;font-family:monospace;">${f(row.retailerId)}</td>
    </tr>
  </table>

  <div class="footer">Thank you for using NextGenPay</div>
</body>
</html>`;
}
