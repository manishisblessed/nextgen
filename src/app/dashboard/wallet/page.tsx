"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
} from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  TransactionResult,
  type TxnResult,
} from "@/components/dashboard/TransactionResult";
import { Badge } from "@/components/ui/Badge";
import { generateRefId, formatINR } from "@/lib/utils";
import { useAuth } from "@/lib/useAuth";

type WalletTxn = {
  id: string;
  direction: "CREDIT" | "DEBIT";
  reason: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  refType: string | null;
  refId: string | null;
  createdAt: string;
};

type WalletData = {
  balance: number;
  monthlyIn: number;
  monthlyOut: number;
  recentTxns: WalletTxn[];
};

const REASON_LABELS: Record<string, string> = {
  TOPUP: "Wallet top-up",
  WITHDRAW: "Withdrawal",
  TRANSACTION: "Service txn",
  COMMISSION: "Commission",
  REVERSAL: "Refund / reversal",
  ADJUSTMENT: "Adjustment",
  FUND_TRANSFER_IN: "Fund received",
  FUND_TRANSFER_OUT: "Fund sent",
  FEE: "Fee",
  PENALTY: "Penalty",
};

export default function WalletPage() {
  const { session } = useAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [fetching, setFetching] = useState(true);
  const [mode, setMode] = useState<"add" | "withdraw">("add");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TxnResult>(null);

  const fetchWallet = useCallback(async () => {
    try {
      setFetching(true);
      const res = await fetch("/api/wallet");
      if (res.ok) setData(await res.json());
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const balance = data?.balance ?? session?.walletBalance ?? 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    const amt = Number(amount);
    setLoading(false);
    setAmount("");
    setResult({
      refId: generateRefId(mode === "add" ? "TOPUP" : "WITHDRAW"),
      service:
        mode === "add"
          ? `Wallet top-up via ${method}`
          : "Wallet withdraw to bank",
      amount: amt,
      meta: {
        Status: "Demo — payment gateway not connected yet",
        Note:
          mode === "add"
            ? "Use Fund Requests to top up your wallet via bank transfer"
            : "Bank payout integration coming soon",
      },
    });
  }

  return (
    <div>
      <ServicePageHeader
        icon={Wallet}
        title="NextGenPay Wallet"
        description="Top-up your wallet, withdraw to your bank or view your balance history."
      />

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 p-6 text-white shadow-glow">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/80">
              Available balance
            </p>
            <button
              onClick={fetchWallet}
              disabled={fetching}
              className="grid h-7 w-7 place-items-center rounded-lg bg-white/15 text-white/80 transition hover:bg-white/25 disabled:animate-spin"
              title="Refresh balance"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 font-display text-3xl font-bold">
            {formatINR(balance)}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/15 p-3">
              <p className="opacity-80">This month in</p>
              <p className="mt-1 font-display text-lg font-bold">
                {formatINR(data?.monthlyIn ?? 0)}
              </p>
            </div>
            <div className="rounded-xl bg-white/15 p-3">
              <p className="opacity-80">This month out</p>
              <p className="mt-1 font-display text-lg font-bold">
                {formatINR(data?.monthlyOut ?? 0)}
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="lg:col-span-2 rounded-2xl border border-ink-100 bg-white p-6"
        >
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "add", label: "Add money", icon: ArrowDownToLine },
                {
                  id: "withdraw",
                  label: "Withdraw to bank",
                  icon: ArrowUpFromLine,
                },
              ] as const
            ).map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-100 bg-white text-ink-700 hover:border-ink-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {m.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                required
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {[500, 1000, 2000, 5000, 10000, 25000].map((v) => (
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

            <div>
              <Label htmlFor="method">
                {mode === "add" ? "Payment method" : "Bank account"}
              </Label>
              <Select
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {(mode === "add"
                  ? ["UPI", "Net Banking", "Debit Card", "IMPS"]
                  : ["SBI - XXXX1234", "HDFC - XXXX5678"]
                ).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={loading}
              >
                {loading
                  ? "Processing..."
                  : mode === "add"
                    ? "Add money to wallet"
                    : "Withdraw to bank"}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Wallet transaction history — real data from DB */}
      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">
              Wallet history
            </h3>
            <p className="text-xs text-ink-500">
              {data?.recentTxns.length
                ? `Showing latest ${data.recentTxns.length} entries`
                : "No wallet transactions yet"}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Description</th>
                <th className="px-5 py-3 font-semibold text-right">Amount</th>
                <th className="px-5 py-3 font-semibold text-right">
                  Balance after
                </th>
                <th className="px-5 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-ink-800">
              {!data?.recentTxns.length ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-ink-500"
                  >
                    {fetching
                      ? "Loading..."
                      : "No wallet transactions yet. Your transaction history will appear here."}
                  </td>
                </tr>
              ) : (
                data.recentTxns.map((t) => (
                  <tr key={t.id} className="hover:bg-ink-50/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {t.direction === "CREDIT" ? (
                          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="grid h-7 w-7 place-items-center rounded-lg bg-rose-50 text-rose-600">
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <Badge
                          variant={
                            t.direction === "CREDIT" ? "success" : "danger"
                          }
                        >
                          {t.direction}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink-900">
                        {REASON_LABELS[t.reason] ?? t.reason}
                      </div>
                      {t.note && (
                        <div className="text-xs text-ink-500">{t.note}</div>
                      )}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-semibold ${t.direction === "CREDIT" ? "text-emerald-700" : "text-rose-700"}`}
                    >
                      {t.direction === "CREDIT" ? "+" : "−"}
                      {formatINR(t.amount)}
                    </td>
                    <td className="px-5 py-3 text-right text-ink-600">
                      {formatINR(t.balanceAfter)}
                    </td>
                    <td className="px-5 py-3 text-xs text-ink-500 whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <TransactionResult result={result} onClose={() => setResult(null)} />
    </div>
  );
}
