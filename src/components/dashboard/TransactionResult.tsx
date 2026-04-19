"use client";

import { CheckCircle2, X, Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

export type TxnResult = {
  refId: string;
  service: string;
  amount: number;
  customer?: string;
  meta?: Record<string, string | number>;
} | null;

export function TransactionResult({
  result,
  onClose
}: {
  result: TxnResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!result) setCopied(false);
  }, [result]);

  if (!result) return null;

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

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 px-6 py-8 text-center text-white">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/20 backdrop-blur">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <p className="mt-4 font-display text-lg font-semibold">
            Transaction successful
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

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1">
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
