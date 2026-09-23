"use client";

/**
 * Retailer Rewards — gamified view of the monthly volume-incentive programme.
 * Shows live tier progress toward the next reward, the projected cashback if the
 * month closed now, and a history of rewards already credited. Designed to
 * encourage retailers to push more QR / POS business each month.
 */

import useSWR from "swr";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/Badge";
import { formatINR } from "@/lib/utils";
import { Gift, Trophy, TrendingUp, Sparkles, IndianRupee, AlertCircle, Target } from "lucide-react";

type Progress = {
  schemeId: string;
  schemeName: string;
  description: string | null;
  rail: "QR" | "POS" | "PG" | "COMBINED";
  rewardType: "CASHBACK_ON_MDR" | "CASHBACK_ON_VOLUME" | "FLAT";
  periodKey: string;
  volume: number;
  mdrPaid: number;
  currentTier: { id: string; label: string | null; rate: number; rewardType: string } | null;
  projectedReward: number;
  entryThreshold: number;
  nextTier: { id: string; label: string | null; threshold: number; remaining: number; rate: number } | null;
  progress: number;
  achieved: boolean;
};

type Payout = {
  id: string;
  schemeName: string;
  periodKey: string;
  rail: string;
  measuredVolume: number;
  mdrPaid: number;
  rewardAmount: number;
  createdAt: string;
};

type Resp = {
  schemes: Progress[];
  payouts: Payout[];
  totalEarned: number;
};

const RAIL_LABEL: Record<string, string> = {
  QR: "QR",
  POS: "POS",
  PG: "PG",
  COMBINED: "QR+POS+PG",
};

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Request failed");
  return res.json();
}

function fmtMonth(periodKey: string): string {
  const [y, m] = periodKey.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function fmtPct(fraction: number): string {
  return `${(fraction * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export default function RewardsPage() {
  const { data, error, isLoading } = useSWR<Resp>("/api/incentive/progress", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 60000,
  });

  const schemes = data?.schemes ?? [];
  const projectedThisMonth = schemes.reduce((s, x) => s + x.projectedReward, 0);
  const achievedCount = schemes.filter((x) => x.currentTier).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="My Rewards"
        title="Monthly Rewards & Cashback"
        description="Earn reverse cashback and rewards as your monthly business grows. Hit the volume targets below and rewards are auto-credited to your wallet on the last day of the month."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Projected this month" value={formatINR(projectedThisMonth)} icon={Sparkles} accent="brand" />
        <StatCard label="Rewards unlocked" value={`${achievedCount}/${schemes.length}`} icon={Trophy} accent="emerald" />
        <StatCard label="Active programmes" value={String(schemes.length)} icon={Gift} accent="violet" />
        <StatCard label="Total earned (lifetime)" value={data ? formatINR(data.totalEarned) : "…"} icon={IndianRupee} accent="accent" />
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> Couldn&apos;t load your rewards. Please retry shortly.
        </div>
      ) : isLoading ? (
        <div className="rounded-2xl border border-ink-100 bg-white p-10 text-center text-sm text-ink-500">Loading your rewards…</div>
      ) : schemes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-10 text-center">
          <Gift className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-3 text-sm font-semibold text-ink-700">No reward programmes yet</p>
          <p className="mt-1 text-xs text-ink-500">
            You&apos;re not enrolled in a reward programme right now. Keep transacting — your distributor or admin can
            enrol you to start earning monthly cashback.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {schemes.map((s) => (
            <RewardCard key={s.schemeId} s={s} />
          ))}
        </div>
      )}

      {/* Reward history */}
      {data && data.payouts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-brand-600" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-ink-600">Reward history</h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-ink-50/60 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Month</th>
                  <th className="px-4 py-2.5 font-semibold">Programme</th>
                  <th className="px-4 py-2.5 font-semibold">Rail</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Volume</th>
                  <th className="px-4 py-2.5 text-right font-semibold">MDR paid</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-emerald-700">Reward credited</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-ink-800">
                {data.payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-emerald-50/30">
                    <td className="px-4 py-2.5 font-medium">{fmtMonth(p.periodKey)}</td>
                    <td className="px-4 py-2.5">{p.schemeName}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="brand">{RAIL_LABEL[p.rail] ?? p.rail}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">{formatINR(p.measuredVolume)}</td>
                    <td className="px-4 py-2.5 text-right text-ink-500">{formatINR(p.mdrPaid)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{formatINR(p.rewardAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function RewardCard({ s }: { s: Progress }) {
  const pct = Math.round(s.progress * 100);
  const baseWord =
    s.rewardType === "CASHBACK_ON_MDR" ? "of MDR paid" : s.rewardType === "CASHBACK_ON_VOLUME" ? "of volume" : "";

  // Achieved the top tier — celebratory state.
  if (s.achieved && s.currentTier) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display text-sm font-semibold text-ink-900">{s.schemeName}</h3>
              <Badge variant="brand">{RAIL_LABEL[s.rail] ?? s.rail}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-ink-500">{fmtMonth(s.periodKey)}</p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white">
            <Trophy className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2 text-emerald-700">
          <Sparkles className="h-5 w-5" />
          <p className="text-sm font-bold">Top reward unlocked{s.currentTier.label ? ` — ${s.currentTier.label}` : ""}!</p>
        </div>
        <p className="mt-1 text-xs text-ink-600">
          You&apos;ve done <span className="font-semibold text-ink-900">{formatINR(s.volume)}</span> this month and are
          earning <span className="font-semibold text-emerald-700">{fmtPct(s.currentTier.rate)} {baseWord}</span>.
        </p>

        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-emerald-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: "100%" }} />
        </div>

        <div className="mt-4 rounded-xl bg-white/70 p-3 text-center">
          <p className="text-[11px] uppercase tracking-wider text-ink-400">Projected reward this month</p>
          <p className="font-display text-2xl font-bold text-emerald-700">{formatINR(s.projectedReward)}</p>
        </div>
      </div>
    );
  }

  const chase = s.nextTier;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-ink-900">{s.schemeName}</h3>
            <Badge variant="brand">{RAIL_LABEL[s.rail] ?? s.rail}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-500">{s.description ?? fmtMonth(s.periodKey)}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
          <Gift className="h-5 w-5" />
        </span>
      </div>

      {/* Current status line */}
      <div className="mt-4 flex items-center gap-2 text-sm">
        {s.currentTier ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
            <TrendingUp className="h-4 w-4" /> Earning {fmtPct(s.currentTier.rate)} {baseWord}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-ink-600">
            <Target className="h-4 w-4" /> {formatINR(Math.max(0, s.entryThreshold - s.volume))} more to unlock your first reward
          </span>
        )}
      </div>

      {/* Progress bar toward the next milestone */}
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-500">
        <span>{formatINR(s.volume)} done</span>
        <span>
          {chase ? `Next: ${formatINR(chase.threshold)}` : `Target: ${formatINR(s.entryThreshold)}`}
        </span>
      </div>

      {/* Next-tier nudge */}
      {chase && (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
          <p className="text-xs text-ink-700">
            Do <span className="font-bold text-amber-700">{formatINR(chase.remaining)}</span> more this month to unlock{" "}
            {chase.label ? <span className="font-semibold">{chase.label}</span> : "the next tier"} and earn{" "}
            <span className="font-bold text-emerald-700">{fmtPct(chase.rate)} {baseWord}</span>.
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-ink-50/60 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-ink-400">This month volume</p>
          <p className="font-display text-lg font-bold text-ink-900">{formatINR(s.volume)}</p>
        </div>
        <div className="rounded-xl bg-emerald-50/60 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-ink-400">Projected reward</p>
          <p className="font-display text-lg font-bold text-emerald-700">{formatINR(s.projectedReward)}</p>
        </div>
      </div>
    </div>
  );
}
