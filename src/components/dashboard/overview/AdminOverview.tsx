"use client";

import Link from "next/link";
import {
  ShieldCheck,
  Users,
  Banknote,
  ServerCog,
  ArrowRight,
  Activity,
  AlertTriangle
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { auditEvents, kycRequests, systemMetrics } from "@/lib/data";
import type { Session } from "@/lib/auth";
import { formatINR } from "@/lib/utils";

export function AdminOverview({ session }: { session: Session }) {
  const pendingKyc = kycRequests.filter((k) => k.status === "Awaiting Review");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Platform admin · {session.email}</p>
          <h1 className="heading-md mt-1">Payprism Control Tower</h1>
          <p className="mt-1 text-sm text-ink-600">
            Real-time view of users, switches, settlements and risk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/admin/system">
            <Button variant="outline">
              <Activity className="h-4 w-4" />
              Status page
            </Button>
          </Link>
          <Link href="/dashboard/admin/kyc">
            <Button>
              Review KYC ({pendingKyc.length})
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Users" value="38,412" delta="+1,284" trend="up" icon={Users} accent="brand" />
        <StatCard label="KYC in Queue" value={`${pendingKyc.length}`} delta="-2" trend="down" icon={ShieldCheck} accent="accent" />
        <StatCard label="Settled Today" value={formatINR(84272340)} delta="+5.4%" trend="up" icon={Banknote} accent="emerald" />
        <StatCard label="System Uptime (30d)" value="99.97%" delta="-0.01%" trend="down" icon={ServerCog} accent="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-ink-100 bg-white p-5 lg:col-span-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
                Platform GMV · last 14 days
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-ink-900">
                {formatINR(184000000)}
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              +9.8%
            </span>
          </div>
          <div className="mt-4">
            <Sparkline
              values={[12000000, 12400000, 13100000, 13420000, 13280000, 14010000, 14620000, 14820000, 15110000, 15420000, 15880000, 16040000, 16320000, 16480000]}
              color="#0e2358"
              height={80}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
              Live alerts
            </p>
          </div>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="rounded-xl bg-amber-50 p-3 text-amber-900">
              <p className="font-semibold">DTH · Tata Play degraded</p>
              <p className="text-xs text-amber-800">Failover route active · 9 mins</p>
            </li>
            <li className="rounded-xl bg-rose-50 p-3 text-rose-900">
              <p className="font-semibold">Velocity rule fired</p>
              <p className="text-xs text-rose-800">Retailer PPIR3217 · 18 AePS in 12 mins</p>
            </li>
            <li className="rounded-xl bg-brand-50 p-3 text-brand-900">
              <p className="font-semibold">Settlement scheduled</p>
              <p className="text-xs text-brand-800">T+1 · ₹84.27 Cr · 11:00 PM IST</p>
            </li>
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h3 className="font-display text-base font-semibold text-ink-900">
                Service health
              </h3>
              <p className="text-xs text-ink-500">P95 latency &amp; error rate · last hour</p>
            </div>
            <Link href="/dashboard/admin/system" className="text-xs font-semibold text-brand-700 hover:underline">
              Open ops
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Service</th>
                <th className="px-5 py-3 font-semibold text-right">Uptime</th>
                <th className="px-5 py-3 font-semibold text-right">P95</th>
                <th className="px-5 py-3 font-semibold text-right">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-ink-800">
              {systemMetrics.map((m) => (
                <tr key={m.service} className="hover:bg-ink-50/40">
                  <td className="px-5 py-3 font-semibold">{m.service}</td>
                  <td className="px-5 py-3 text-right">{m.uptime}</td>
                  <td className="px-5 py-3 text-right">{m.p95ms} ms</td>
                  <td className="px-5 py-3 text-right">{m.errorRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
            {auditEvents.slice(0, 6).map((e) => (
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
          </ul>
        </div>
      </div>
    </div>
  );
}
