"use client";

import { useState } from "react";
import { Fingerprint, Banknote, Receipt, FileText } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  TransactionResult,
  type TxnResult
} from "@/components/dashboard/TransactionResult";
import { generateRefId } from "@/lib/utils";
import { cn } from "@/lib/utils";

const ops = [
  { id: "withdrawal", label: "Cash withdrawal", icon: Banknote },
  { id: "balance", label: "Balance enquiry", icon: Receipt },
  { id: "statement", label: "Mini statement", icon: FileText }
] as const;

type Op = (typeof ops)[number]["id"];

const banks = ["SBI", "PNB", "BoB", "Canara", "Union", "HDFC", "ICICI", "Axis"];

export default function AadhaarPayPage() {
  const [op, setOp] = useState<Op>("withdrawal");
  const [aadhaar, setAadhaar] = useState("");
  const [bank, setBank] = useState(banks[0]);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TxnResult>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1100));
    setLoading(false);
    const meta: Record<string, string | number> =
      op === "balance"
        ? { "Available balance": `₹ ${(Math.random() * 25000 + 1000).toFixed(0)}` }
        : op === "statement"
          ? { "Last 5 transactions": "View in receipt" }
          : { Bank: bank, Mode: "AePS biometric" };
    setResult({
      refId: generateRefId("AEPS"),
      service: `AePS — ${ops.find((o) => o.id === op)!.label}`,
      amount: op === "withdrawal" ? Number(amount) : 0,
      customer: `Aadhaar XXXX XXXX ${aadhaar.slice(-4)}`,
      meta
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <ServicePageHeader
        icon={Fingerprint}
        title="Aadhaar Pay (AePS)"
        description="Cash withdrawal, balance enquiry & mini statement using customer's Aadhaar + biometric."
      />

      <form
        onSubmit={submit}
        className="rounded-2xl border border-ink-100 bg-white p-6"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {ops.map((o) => {
            const Icon = o.icon;
            const active = op === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setOp(o.id)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition",
                  active
                    ? "border-brand-500 bg-brand-50"
                    : "border-ink-100 bg-white hover:border-ink-200"
                )}
              >
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl",
                    active ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-700"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-ink-900">
                  {o.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="aadhaar">Aadhaar number (12 digits)</Label>
            <Input
              id="aadhaar"
              required
              maxLength={12}
              minLength={12}
              placeholder="XXXX XXXX XXXX"
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <Label htmlFor="bank">Bank (IIN)</Label>
            <Select id="bank" value={bank} onChange={(e) => setBank(e.target.value)}>
              {banks.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </div>
          {op === "withdrawal" && (
            <div>
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Max ₹10,000 per txn"
              />
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <strong>Note:</strong> Connect your authorised RD-service biometric
          device. Customer's fingerprint will be captured securely after
          submission.
        </div>

        <div className="mt-6">
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Capturing biometric..." : "Capture biometric & continue"}
          </Button>
        </div>
      </form>

      <TransactionResult result={result} onClose={() => setResult(null)} />
    </div>
  );
}
