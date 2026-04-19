"use client";

import { useState } from "react";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  TransactionResult,
  type TxnResult
} from "@/components/dashboard/TransactionResult";
import { generateRefId, formatINR } from "@/lib/utils";

export function RechargeForm({
  serviceTitle,
  numberLabel,
  numberPlaceholder,
  operators,
  amountPresets = [99, 199, 299, 399, 499, 999],
  refPrefix = "RCH"
}: {
  serviceTitle: string;
  numberLabel: string;
  numberPlaceholder: string;
  operators: string[];
  amountPresets?: number[];
  refPrefix?: string;
}) {
  const [number, setNumber] = useState("");
  const [operator, setOperator] = useState(operators[0]);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TxnResult>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setResult({
      refId: generateRefId(refPrefix),
      service: `${serviceTitle} — ${operator}`,
      amount: Number(amount),
      customer: number,
      meta: { Operator: operator }
    });
  }

  return (
    <>
      <form
        onSubmit={submit}
        className="grid gap-4 rounded-2xl border border-ink-100 bg-white p-6 sm:grid-cols-2"
      >
        <div>
          <Label htmlFor="number">{numberLabel}</Label>
          <Input
            id="number"
            required
            placeholder={numberPlaceholder}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="operator">Operator</Label>
          <Select
            id="operator"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
          >
            {operators.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="amount">Amount (₹)</Label>
          <Input
            id="amount"
            required
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {amountPresets.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-700 hover:border-brand-300 hover:text-brand-700"
              >
                {formatINR(v)}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading
              ? "Recharging..."
              : `Pay ${amount ? formatINR(Number(amount)) : "now"}`}
          </Button>
        </div>
      </form>
      <TransactionResult result={result} onClose={() => setResult(null)} />
    </>
  );
}
