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
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Session } from "@/lib/auth";
import { formatINR, formatNumber } from "@/lib/utils";

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
};

export function AdminOverview({ session }: { session: Session }) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      setStats(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const livePartners = stats?.serviceHealth.filter((s) => s.live).length ?? 0;
  const totalPartners = stats?.serviceHealth.length ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Platform admin · {session.email}</p>
          <h1 className="heading-md mt-1">NextGenPay Control Tower</h1>
          <p className="mt-1 text-sm text-ink-600">
            Real-time view of users, switches, settlements and risk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Link href="/dashboard/admin/system">
            <Button variant="outline">
              <Activity className="h-4 w-4" />
              Status page
            </Button>
          </Link>
          <Link href="/dashboard/admin/kyc">
            <Button>
              Review KYC ({stats?.pendingKyc ?? 0})
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Users" value={formatNumber(stats?.activeUsers ?? 0)} delta={`of ${formatNumber(stats?.totalUsers ?? 0)}`} trend="up" icon={Users} accent="brand" />
        <StatCard label="KYC in Queue" value={String(stats?.pendingKyc ?? 0)} delta="" trend="down" icon={ShieldCheck} accent="accent" />
        <StatCard label="Settled Today" value={formatINR(stats?.settledToday ?? 0)} delta={`${stats?.txnsToday ?? 0} txns`} trend="up" icon={Banknote} accent="emerald" />
        <StatCard label="Partners Live" value={`${livePartners} / ${totalPartners}`} delta="" trend="up" icon={ServerCog} accent="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-ink-100 bg-white p-5 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
                Platform GMV · last 14 days
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-ink-900">
                {formatINR(stats?.monthlyGmv ?? 0)}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Sparkline
              values={stats?.dailyGmv?.length ? stats.dailyGmv : [0]}
              color="#0e2358"
              height={80}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
              Partner status
            </p>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {stats?.serviceHealth.map((s) => (
              <li key={s.service} className={`flex items-center justify-between rounded-xl p-2.5 ${s.live ? "bg-emerald-50" : "bg-ink-50"}`}>
                <span className="font-semibold">{s.service}</span>
                <Badge variant={s.live ? "success" : "warning"}>{s.provider}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">
              Audit log
            </h3>
            <p className="text-xs text-ink-500">Recent privileged actions</p>
          </div>
          <Link href="/dashboard/admin/audit" className="text-xs font-semibold text-brand-700 hover:underline">
            Open log
          </Link>
        </div>
        <ul className="divide-y divide-ink-100 text-sm">
          {(stats?.auditEvents ?? []).map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-ink-50/40">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{e.action}</p>
                <p className="truncate text-xs text-ink-500">
                  {e.actor} → {e.target}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={e.severity === "info" ? "brand" : e.severity === "warn" ? "warning" : "danger"}>
                  {e.severity}
                </Badge>
                <span className="text-[10px] text-ink-400">{e.ts}</span>
              </div>
            </li>
          ))}
          {(!stats?.auditEvents || stats.auditEvents.length === 0) && (
            <li className="px-5 py-6 text-center text-ink-400">No audit events yet</li>
          )}
        </ul>
      </div>
    </div>
  );
}
