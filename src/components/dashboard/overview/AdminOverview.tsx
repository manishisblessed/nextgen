"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Users,
  Banknote,
  ServerCog,
  ArrowRight,
  Activity,
  RefreshCw,
  Landmark,
  Percent,
  TrendingUp,
  Wallet,
  Eye,
  EyeOff,
  PiggyBank,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { StatSkeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Session } from "@/lib/auth";
import { formatINR, formatNumber } from "@/lib/utils";

type PayoutStats = {
  volumeToday: number;
  countToday: number;
  volumeMonth: number;
  successRate: number | null;
  successCount30: number;
  terminalCount30: number;
  inflight: number;
  daily: number[];
};

type StatsData = {
  activeUsers: number;
  totalUsers: number;
  pendingKyc: number;
  settledToday: number;
  txnsToday: number;
  monthlyGmv: number;
  dailyGmv: number[];
  serviceHealth: { service: string; live: boolean; provider: string }[];
  auditEvents: { id: string; actor: string; action: string; target: string; severity: string; ts: string }[];
  vendorBalanceTotal?: number;
  payout?: PayoutStats;
};

type TierBalance = {
  role: string;
  users: number;
  primary: number;
  aeps: number;
  total: number;
};

type LiabilityData = {
  systemTotal: number;
  primaryTotal: number;
  aepsTotal: number;
  heldTotal: number;
  walletCount: number;
  tiers: TierBalance[];
};

type ProviderBalance = {
  key: string;
  name: string;
  provider: string;
  configured: boolean;
  balance: number | null;
  detail?: string | null;
  error?: string | null;
};

const TIER_SHORT: Record<string, string> = {
  RETAILER: "RT",
  DISTRIBUTOR: "DT",
  MASTER_DISTRIBUTOR: "MD",
  SUPER_DISTRIBUTOR: "SD",
};

export function AdminOverview({ session }: { session: Session }) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [liability, setLiability] = useState<LiabilityData | null>(null);
  const [providers, setProviders] = useState<ProviderBalance[] | null>(null);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [masked, setMasked] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setProviders(null);
    setProvidersError(null);
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      setStats(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
    // Money panels — independent, best-effort.
    fetch("/api/admin/wallet/aggregates?view=cumulative")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setLiability(d))
      .catch(() => {});
    fetch("/api/admin/providers/balances")
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !Array.isArray(d?.providers)) {
          setProviders([]);
          setProvidersError(d?.error || "Could not load provider balances");
          return;
        }
        setProviders(d.providers);
        setProvidersError(null);
      })
      .catch(() => {
        setProviders([]);
        setProvidersError("Could not load provider balances");
      });
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const money = useCallback(
    (n: number) => (masked ? "₹ ●●●●●" : formatINR(n)),
    [masked]
  );

  const livePartners = stats?.serviceHealth.filter((s) => s.live).length ?? 0;
  const totalPartners = stats?.serviceHealth.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-ink-500">Platform admin · {session.email}</p>
          <h1 className="heading-md">NextGenPay Control Tower</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Link href="/dashboard/admin/system">
            <Button variant="outline" size="sm">
              <Activity className="h-3.5 w-3.5" />
              Status
            </Button>
          </Link>
          <Link href="/dashboard/admin/kyc">
            <Button size="sm">
              Review KYC ({stats?.pendingKyc ?? 0})
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Active Users"
              value={formatNumber(stats?.activeUsers ?? 0)}
              delta={`of ${formatNumber(stats?.totalUsers ?? 0)}`}
              trend="up"
              icon={Users}
              accent="brand"
              href="/dashboard/admin/users"
            />
            <StatCard
              label="KYC in Queue"
              value={String(stats?.pendingKyc ?? 0)}
              delta=""
              trend="down"
              icon={ShieldCheck}
              accent="accent"
              href="/dashboard/admin/kyc"
            />
            <StatCard
              label="Settled Today"
              value={formatINR(stats?.settledToday ?? 0)}
              delta={`${stats?.txnsToday ?? 0} txns`}
              trend="up"
              icon={Banknote}
              accent="emerald"
              href="/dashboard/admin/settlements"
            />
            <StatCard
              label="Partners Live"
              value={`${livePartners} / ${totalPartners}`}
              delta=""
              trend="up"
              icon={ServerCog}
              accent="violet"
              href="/dashboard/admin/services"
            />
          </>
        )}
      </div>

      {/* ── Wallet liability + provider floats ─────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-ink-100 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-brand-600" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
                Wallet liability · user funds we hold
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setMasked((m) => !m)}
                className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                aria-label="Toggle amount masking"
              >
                {masked ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <Link href="/dashboard/admin/wallet-ops" className="text-ink-400 hover:text-ink-700">
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="font-display text-2xl font-bold text-ink-900">
                {money(liability?.systemTotal ?? 0)}
              </p>
              <p className="text-[11px] text-ink-500">
                {formatNumber(liability?.walletCount ?? 0)} wallets · Primary{" "}
                {money(liability?.primaryTotal ?? 0)} · AEPS {money(liability?.aepsTotal ?? 0)}
                {" · "}Held {money(liability?.heldTotal ?? 0)}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(liability?.tiers ?? []).map((t) => (
              <div key={t.role} className="rounded-xl bg-ink-50/70 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    {TIER_SHORT[t.role] ?? t.role}
                  </span>
                  <Badge>{formatNumber(t.users)}</Badge>
                </div>
                <p className="mt-0.5 truncate font-display text-sm font-bold text-ink-900">
                  {money(t.total)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
                Provider wallets
              </p>
            </div>
            <Link href="/dashboard/admin/settlements" className="text-ink-400 hover:text-ink-700" title="Open settlements / partner wallet">
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="mt-2 space-y-2">
            {providers === null && (
              <li className="text-xs text-ink-400">Loading provider balances…</li>
            )}
            {providersError && providers?.length === 0 && (
              <li className="text-xs text-rose-600">{providersError}</li>
            )}
            {(providers ?? []).map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-ink-800">{p.name}</p>
                  {p.detail && <p className="text-[10px] font-semibold text-rose-600">{p.detail}</p>}
                  {p.error && (
                    <p className="truncate text-[10px] text-ink-400" title={p.error}>
                      {p.error}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-display text-sm font-bold text-ink-900">
                  {!p.configured ? (
                    <Badge>not configured</Badge>
                  ) : p.error ? (
                    <Badge variant="danger">unreachable</Badge>
                  ) : (
                    money(p.balance ?? 0)
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Payout Volume · Today"
              value={formatINR(stats?.payout?.volumeToday ?? 0)}
              delta={`${stats?.payout?.countToday ?? 0} settled`}
              trend="up"
              icon={Banknote}
              accent="violet"
              href="/dashboard/payout-approvals"
            />
            <StatCard
              label="Payout Volume · MTD"
              value={formatINR(stats?.payout?.volumeMonth ?? 0)}
              delta="this month"
              trend="up"
              icon={Landmark}
              accent="brand"
              href="/dashboard/payout-approvals"
            />
            <StatCard
              label="Payout Success · 30d"
              value={stats?.payout?.successRate == null ? "—" : `${stats.payout.successRate}%`}
              delta={`${stats?.payout?.successCount30 ?? 0}/${stats?.payout?.terminalCount30 ?? 0}`}
              trend={stats?.payout?.successRate != null && stats.payout.successRate < 90 ? "down" : "up"}
              icon={Percent}
              accent="emerald"
              href="/dashboard/reports"
            />
            <StatCard
              label="Payouts In-flight"
              value={formatNumber(stats?.payout?.inflight ?? 0)}
              delta="awaiting settlement"
              trend="up"
              icon={Activity}
              accent="accent"
              href="/dashboard/payout-approvals"
            />
          </>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Link href="/dashboard/reports" className="rounded-2xl border border-ink-100 bg-white p-4 transition-all hover:border-brand-200 hover:shadow-md lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
                Platform GMV · last 14 days
              </p>
              <p className="mt-0.5 font-display text-xl font-bold text-ink-900">
                {formatINR(stats?.monthlyGmv ?? 0)}
              </p>
            </div>
            <TrendingUp className="h-4 w-4 text-ink-400" />
          </div>
          <div className="mt-2">
            <Sparkline
              values={stats?.dailyGmv?.length ? stats.dailyGmv : [0]}
              color="#0e2358"
              height={56}
            />
          </div>
        </Link>

        <Link href="/dashboard/admin/services" className="rounded-2xl border border-ink-100 bg-white p-4 transition-all hover:border-brand-200 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
                Vendor Balances
              </p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-ink-400" />
          </div>
          <p className="mt-2 font-display text-xl font-bold text-ink-900">
            {formatINR(stats?.vendorBalanceTotal ?? 0)}
          </p>
          <p className="text-[11px] text-ink-500">Total across tracked rails</p>
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Link href="/dashboard/payout-approvals" className="rounded-2xl border border-ink-100 bg-white p-4 transition-all hover:border-brand-200 hover:shadow-md">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
                Payout volume · last 14 days
              </p>
              <p className="mt-0.5 font-display text-xl font-bold text-ink-900">
                {formatINR(stats?.payout?.volumeMonth ?? 0)}
              </p>
            </div>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
              {stats?.payout?.successRate == null ? "no data" : `${stats.payout.successRate}% success`}
            </span>
          </div>
          <div className="mt-2">
            <Sparkline
              values={stats?.payout?.daily?.length ? stats.payout.daily : [0]}
              color="#7c3aed"
              height={48}
            />
          </div>
        </Link>

        <Link href="/dashboard/admin/audit" className="rounded-2xl border border-ink-100 bg-white p-4 transition-all hover:border-brand-200 hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
              Recent audit log
            </p>
            <ArrowRight className="h-3.5 w-3.5 text-ink-400" />
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {(stats?.auditEvents ?? []).slice(0, 3).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-ink-800">{e.action}</span>
                <span className="shrink-0 text-[10px] text-ink-400">{e.ts}</span>
              </li>
            ))}
            {(!stats?.auditEvents || stats.auditEvents.length === 0) && (
              <li className="text-xs text-ink-400">No events yet</li>
            )}
          </ul>
        </Link>
      </div>
    </div>
  );
}
