"use client";

import { useEffect, useState } from "react";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Plus } from "lucide-react";
import { ServicePageHeader } from "@/components/dashboard/ServicePage";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TransactionsTable } from "@/components/dashboard/TransactionsTable";
import {
  TransactionResult,
  type TxnResult
} from "@/components/dashboard/TransactionResult";
import { generateRefId, formatINR } from "@/lib/utils";
import { getSession, saveSession, type Session } from "@/lib/auth";

export default function WalletPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<"add" | "withdraw">("add");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("UPI");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TxnResult>(null);

  useEffect(() => {
    setSession(getSession());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    const amt = Number(amount);
    const newBalance =
      mode === "add" ? session.walletBalance + amt : session.walletBalance - amt;
    const updated = { ...session, walletBalance: Math.max(0, newBalance) };
    saveSession(updated);
    setSession(updated);
    setLoading(false);
    setAmount("");
    setResult({
      refId: generateRefId(mode === "add" ? "TOPUP" : "WITHDRAW"),
      service: mode === "add" ? `Wallet top-up via ${method}` : "Wallet withdraw to bank",
      amount: amt,
      meta: { "New balance": formatINR(updated.walletBalance) }
    });
  }

  return (
    <div>
      <ServicePageHeader
        icon={Wallet}
        title="Payprism Wallet"
        description="Top-up your wallet, withdraw to your bank or view your balance history."
      />

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 p-6 text-white shadow-glow">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <p className="text-xs font-semibold uppercase tracking-widest text-white/80">
            Available balance
          </p>
          <p className="mt-2 font-display text-3xl font-bold">
            {formatINR(session?.walletBalance ?? 0)}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/15 p-3">
              <p className="opacity-80">This month in</p>
              <p className="mt-1 font-display text-lg font-bold">₹ 84,210</p>
            </div>
            <div className="rounded-xl bg-white/15 p-3">
              <p className="opacity-80">This month out</p>
              <p className="mt-1 font-display text-lg font-bold">₹ 56,890</p>
            </div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="lg:col-span-2 rounded-2xl border border-ink-100 bg-white p-6"
        >
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: "add", label: "Add money", icon: ArrowDownToLine },
              { id: "withdraw", label: "Withdraw to bank", icon: ArrowUpFromLine }
            ] as const).map((m) => {
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
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
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

      <TransactionsTable />
      <TransactionResult result={result} onClose={() => setResult(null)} />
    </div>
  );
}
