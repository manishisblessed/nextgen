"use client";

import { CheckCircle2, Ban, Building2, Wallet, ArrowRight, Star } from "lucide-react";
import type { GatewayPlan } from "@/app/api/wallet/topup/plans/route";

type Props = {
  plans: GatewayPlan[];
  selected: string;
  onSelect: (id: string) => void;
};

const SETTLEMENT_LABEL: Record<string, string> = {
  T0: "T0 Settlement",
  T1: "T1 Settlement",
};

export function GatewayCompareCards({ plans, selected, onSelect }: Props) {
  if (!plans.length) return null;

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex gap-4" style={{ minWidth: "min-content" }}>
        {plans.map((plan) => {
          const isSelected = selected === plan.id;
          const isBest = plan.bestValue;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border-2 bg-white transition-all duration-200 ${
                isBest
                  ? "border-brand-500 shadow-lg shadow-brand-100"
                  : isSelected
                    ? "border-brand-400 shadow-md"
                    : "border-ink-150 hover:border-ink-200"
              }`}
              style={{ minWidth: 220, maxWidth: 260, flex: "0 0 240px" }}
            >
              {/* Best value badge */}
              {isBest && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow">
                    <Star className="h-3 w-3 fill-current" />
                    Best Value
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className={`rounded-t-[14px] px-5 pt-5 pb-3 text-center ${isBest ? "pt-7" : ""}`}>
                <h3
                  className={`font-display text-xl font-bold ${
                    isBest ? "text-brand-700" : isSelected ? "text-brand-600" : "text-ink-800"
                  }`}
                >
                  {plan.label}
                </h3>
                <p className="mt-0.5 text-xs font-medium text-ink-500">
                  {SETTLEMENT_LABEL[plan.settlementType] ?? `${plan.settlementType} Settlement`}
                </p>
              </div>

              {/* Divider */}
              <div className="mx-5 border-t border-ink-100" />

              {/* Rate rows */}
              <div className="flex flex-col gap-1 px-5 py-3">
                {plan.rates.map((r) => (
                  <div key={r.mode} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2
                        className={`h-3.5 w-3.5 shrink-0 ${
                          plan.healthy ? "text-brand-500" : "text-ink-300"
                        }`}
                      />
                      <span className="text-xs font-medium text-ink-600">{r.mode} -</span>
                    </div>
                    <span className="text-xs font-semibold text-ink-800 whitespace-nowrap">
                      {r.display}
                    </span>
                  </div>
                ))}
              </div>

              {/* Suggested banks */}
              <div className="mx-4 mb-3 rounded-xl bg-ink-50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-brand-700">Suggested Bank:</p>
                    <p className="text-[11px] text-ink-500">
                      {plan.banks.length} partner bank{plan.banks.length !== 1 ? "s" : ""} supported
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {plan.banks.map((b) => (
                    <span
                      key={b}
                      className="rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[10px] font-medium text-ink-700"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>

              {/* Transaction limit */}
              {plan.maxAmount != null && (
                <div className="mx-4 mb-4 flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2.5">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
                    <Wallet className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-ink-500">Transaction limit :</p>
                    <p className="font-display text-sm font-bold text-ink-900">
                      ₹{plan.maxAmount.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    PER TXN
                  </span>
                </div>
              )}

              {/* Unavailable banner */}
              {!plan.healthy && (
                <div className="mx-4 mb-3 flex items-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
                  <Ban className="h-3.5 w-3.5 shrink-0" />
                  {plan.detail || "Temporarily unavailable"}
                </div>
              )}

              {/* GO button */}
              <div className="mt-auto px-4 pb-5">
                <button
                  type="button"
                  disabled={!plan.healthy}
                  onClick={() => plan.healthy && onSelect(plan.id)}
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl border-2 py-2.5 text-sm font-bold transition-all duration-150 ${
                    !plan.healthy
                      ? "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-400"
                      : isBest || isSelected
                        ? "border-brand-600 bg-brand-600 text-white shadow-md hover:bg-brand-700 hover:border-brand-700"
                        : "border-brand-500 bg-white text-brand-700 hover:bg-brand-50"
                  }`}
                >
                  GO
                  {(isBest || isSelected) && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
