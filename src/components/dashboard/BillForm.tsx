"use client";

import { useState } from "react";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  TransactionResult,
  type TxnResult
} from "@/components/dashboard/TransactionResult";
import { generateRefId, formatINR } from "@/lib/utils";

export function BillForm({
  serviceTitle,
  consumerLabel,
  billers,
  refPrefix = "BILL"
}: {
  serviceTitle: string;
  consumerLabel: string;
  billers: string[];
  refPrefix?: string;
}) {
  const [biller, setBiller] = useState(billers[0]);
  const [consumer, setConsumer] = useState("");
  const [amount, setAmount] = useState("");
  const [fetched, setFetched] = useState<{
    name: string;
    due: number;
    dueDate: string;
  } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TxnResult>(null);

  async function fetchBill() {
    if (!consumer) return;
    setFetching(true);
    await new Promise((r) => setTimeout(r, 700));
    const due = Math.floor(Math.random() * 4500 + 350);
    setFetched({
      name: "Customer " + consumer.slice(-4),
      due,
      dueDate: "30 Apr 2026"
    });
    setAmount(String(due));
    setFetching(false);
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setResult({
      refId: generateRefId(refPrefix),
      service: `${serviceTitle} — ${biller}`,
      amount: Number(amount),
      customer: fetched?.name ?? consumer,
      meta: {
        Biller: biller,
        "Consumer #": consumer
      }
    });
    setFetched(null);
  }

  return (
    <>
      <form
        onSubmit={pay}
        className="grid gap-4 rounded-2xl border border-ink-100 bg-white p-6 sm:grid-cols-2"
      >
        <div>
          <Label htmlFor="biller">Biller / Operator</Label>
          <Select
            id="biller"
            value={biller}
            onChange={(e) => {
              setBiller(e.target.value);
              setFetched(null);
            }}
          >
            {billers.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="consumer">{consumerLabel}</Label>
          <Input
            id="consumer"
            required
            placeholder="Enter number"
            value={consumer}
            onChange={(e) => {
              setConsumer(e.target.value);
              setFetched(null);
            }}
          />
        </div>

        <div className="sm:col-span-2">
          {!fetched ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={fetchBill}
              disabled={fetching || !consumer}
            >
              {fetching ? "Fetching bill..." : "Fetch bill"}
            </Button>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <p className="font-semibold text-ink-900">{fetched.name}</p>
              <p className="text-xs text-ink-600">
                Bill due {fetched.dueDate}
              </p>
              <p className="mt-2 font-display text-xl font-bold text-emerald-700">
                {formatINR(fetched.due)}
              </p>
            </div>
          )}
        </div>

        {fetched && (
          <>
            <div className="sm:col-span-2">
              <Label htmlFor="amount">Amount to pay (₹)</Label>
              <Input
                id="amount"
                required
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading
                  ? "Processing..."
                  : `Pay ${amount ? formatINR(Number(amount)) : "bill"}`}
              </Button>
            </div>
          </>
        )}
      </form>
      <TransactionResult result={result} onClose={() => setResult(null)} />
    </>
  );
}
