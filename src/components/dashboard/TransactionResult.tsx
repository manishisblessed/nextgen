"use client";

import { CheckCircle2, Clock, X, Copy, Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/useAuth";

/** Branding line shown on every payment result/receipt. */
function payByLine(userCode?: string | null): string {
  return userCode
    ? `Pay by NxtGenPay by RT Code - ${userCode}`
    : "Pay by NxtGenPay";
}

export type TxnResult = {
  refId: string;
  service: string;
  amount: number;
  customer?: string;
  meta?: Record<string, string | number>;
  /** Defaults to SUCCESS. PENDING = provider accepted but not yet confirmed. */
  status?: "SUCCESS" | "PENDING";
} | null;

function buildReceiptHtml(r: NonNullable<TxnResult>, userCode?: string | null): string {
  const pending = r.status === "PENDING";
  const headStyle = pending
    ? "background:linear-gradient(135deg,#d97706,#b45309)"
    : "background:linear-gradient(135deg,#059669,#047857)";
  const headTitle = pending ? "Transaction Pending" : "Transaction Successful";
  const date = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const metaRows = r.meta
    ? Object.entries(r.meta)
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 0;color:#666;font-size:13px">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600;font-size:13px">${v}</td></tr>`
        )
        .join("")
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt — ${r.refId}</title>
<style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}.r{max-width:400px;margin:24px auto;font-family:system-ui,sans-serif;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden}.hdr{${headStyle};color:#fff;padding:32px 24px;text-align:center}.hdr h2{margin:0 0 4px;font-size:18px;font-weight:600}.hdr .amt{font-size:28px;font-weight:700;margin:8px 0 2px}.hdr .svc{font-size:12px;opacity:.8}.body{padding:20px 24px}table{width:100%;border-collapse:collapse}tr+tr{border-top:1px solid #f3f4f6}.foot{text-align:center;padding:16px 24px;font-size:11px;color:#999;border-top:1px dashed #e5e7eb}</style></head>
<body><div class="r"><div class="hdr"><h2>${headTitle}</h2><div class="amt">₹${r.amount.toLocaleString("en-IN")}</div><div class="svc">${r.service}</div></div>
<div class="body"><table><tr><td style="padding:6px 0;color:#666;font-size:13px">Reference ID</td><td style="padding:6px 0;text-align:right;font-weight:600;font-size:13px;font-family:monospace">${r.refId}</td></tr>
${r.customer ? `<tr><td style="padding:6px 0;color:#666;font-size:13px">Customer</td><td style="padding:6px 0;text-align:right;font-weight:600;font-size:13px">${r.customer}</td></tr>` : ""}
${metaRows}
<tr><td style="padding:6px 0;color:#666;font-size:13px">Date</td><td style="padding:6px 0;text-align:right;font-weight:600;font-size:13px">${date}</td></tr></table></div>
<div class="foot"><div style="font-weight:600;color:#059669;margin-bottom:4px">${payByLine(userCode)}</div>NextGenPay — Powered by BBPS</div></div></body></html>`;
}

export function TransactionResult({
  result,
  onClose
}: {
  result: TxnResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { session } = useAuth();
  const userCode = session?.userCode;

  useEffect(() => {
    if (!result) setCopied(false);
  }, [result]);

  const downloadReceipt = useCallback(() => {
    if (!result) return;
    const w = window.open("", "_blank", "width=460,height=650");
    if (!w) return;
    w.document.write(buildReceiptHtml(result, userCode));
    w.document.close();
    w.addEventListener("afterprint", () => w.close());
    setTimeout(() => w.print(), 300);
  }, [result, userCode]);

  if (!result) return null;

  const pending = result.status === "PENDING";

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(result.refId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/50 px-4 py-8 backdrop-blur"
      role="dialog"
      aria-modal
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-glow">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-ink-700 hover:bg-ink-200"
        >
          <X className="h-4 w-4" />
        </button>

        <div
          className={`px-6 py-8 text-center text-white ${
            pending
              ? "bg-gradient-to-br from-amber-500 to-amber-700"
              : "bg-gradient-to-br from-emerald-500 to-emerald-700"
          }`}
        >
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/20 backdrop-blur">
            {pending ? <Clock className="h-9 w-9" /> : <CheckCircle2 className="h-9 w-9" />}
          </span>
          <p className="mt-4 font-display text-lg font-semibold">
            {pending ? "Transaction pending" : "Transaction successful"}
          </p>
          <p className="mt-1 text-3xl font-bold">
            ₹{result.amount.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-white/80">{result.service}</p>
        </div>

        <div className="space-y-3 p-6">
          <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Reference ID
              </p>
              <p className="font-mono text-sm font-semibold text-ink-900">
                {result.refId}
              </p>
            </div>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-white"
            >
              <Copy className="h-3 w-3" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {result.customer && (
            <div className="rounded-xl bg-ink-50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
                Customer
              </p>
              <p className="text-sm font-medium text-ink-900">
                {result.customer}
              </p>
            </div>
          )}

          {result.meta &&
            Object.entries(result.meta).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3"
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                  {k}
                </span>
                <span className="text-sm font-medium text-ink-900">{v}</span>
              </div>
            ))}

          {pending && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                We&rsquo;re confirming this with the operator. Check Transaction History before
                retrying to avoid a duplicate charge.
              </span>
            </div>
          )}

          <p className="pt-1 text-center text-xs font-semibold text-emerald-600">
            {payByLine(userCode)}
          </p>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={downloadReceipt}>
              <Download className="h-4 w-4" />
              Receipt
            </Button>
            <Button onClick={onClose} className="flex-1">
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
