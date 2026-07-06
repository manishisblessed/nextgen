"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  AlertCircle,
  ShieldAlert,
  FileDown,
  CheckCircle2,
  Flag,
  Eye,
  Link2,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type AlertRow = {
  id: string;
  rule: string;
  severity: string;
  status: string;
  dateKey: string;
  details: Record<string, unknown>;
  user: { id: string; name: string; email: string; phone: string; role: string };
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type AnchorRow = { dateKey: string; rowCount: number; rootHash: string; chainHash: string; createdAt: string };

const RULE_LABELS: Record<string, string> = {
  HIGH_VALUE: "High-value movement",
  AGG_DAILY_VOLUME: "Daily aggregate ≥ CTR line",
  STRUCTURING: "Structuring pattern",
  DORMANT_BURST: "Dormant account burst",
};

const STATUS_BADGE: Record<string, "default" | "success" | "warning" | "danger" | "brand"> = {
  OPEN: "danger",
  UNDER_REVIEW: "warning",
  CLEARED: "success",
  REPORTED: "brand",
};

const FILTERS = [
  { id: "open", label: "Open" },
  { id: "reported", label: "Reported (STR)" },
  { id: "cleared", label: "Cleared" },
  { id: "all", label: "All" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function monthAgo(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AmlPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AlertRow | null>(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);

  // Report export controls
  const [repFrom, setRepFrom] = useState(monthAgo());
  const [repTo, setRepTo] = useState(today());

  // Audit chain
  const [anchors, setAnchors] = useState<AnchorRow[]>([]);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ dateKey: string; ok: boolean; reason?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, cRes] = await Promise.all([
        fetch(`/api/admin/aml/alerts?status=${filter}`),
        fetch("/api/admin/audit/anchors"),
      ]);
      const aData = await aRes.json();
      if (!aRes.ok) throw new Error(aData.error || "Failed to load alerts");
      setAlerts(aData.alerts ?? []);
      if (cRes.ok) {
        const cData = await cRes.json();
        setAnchors(cData.anchors ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(action: "UNDER_REVIEW" | "CLEARED" | "REPORTED") {
    if (!selected) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/aml/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, action, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Action failed");
      setSelected(null);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  async function verifyAnchor(dateKey: string) {
    setVerifying(dateKey);
    setVerifyResult(null);
    try {
      const res = await fetch(`/api/admin/audit/anchors?verify=${dateKey}`);
      const data = await res.json();
      if (res.ok) setVerifyResult(data.verification);
    } finally {
      setVerifying(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance"
        title="AML monitoring"
        description="Transaction-monitoring alerts, STR/CTR exports and audit-chain integrity."
        actions={
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Report exports */}
      <div className="rounded-2xl border border-ink-100 bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>From</Label>
            <Input type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={repTo} onChange={(e) => setRepTo(e.target.value)} />
          </div>
          <a href={`/api/admin/aml/reports?type=ctr&from=${repFrom}&to=${repTo}`} download>
            <Button variant="secondary">
              <FileDown className="h-4 w-4" /> CTR candidates (CSV)
            </Button>
          </a>
          <a href={`/api/admin/aml/reports?type=str&from=${repFrom}&to=${repTo}`} download>
            <Button variant="secondary">
              <FileDown className="h-4 w-4" /> STR worksheet (CSV)
            </Button>
          </a>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          CTR: movements at/above the reporting threshold. STR: all alerts with evidence and review trail. Exports are audit-logged.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
              filter === f.id ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:border-ink-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Alert queue */}
      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Rule</th>
              <th className="px-5 py-3 font-semibold">User</th>
              <th className="px-5 py-3 font-semibold">Day</th>
              <th className="px-5 py-3 font-semibold">Severity</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Filed</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 text-ink-800">
            {alerts.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-ink-500">
                  No alerts in this view. The sweep runs hourly.
                </td>
              </tr>
            )}
            {alerts.map((a) => (
              <tr key={a.id} className="hover:bg-ink-50/40">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 font-semibold text-ink-900">
                    <ShieldAlert className={`h-4 w-4 ${a.severity === "HIGH" ? "text-rose-500" : "text-amber-500"}`} />
                    {RULE_LABELS[a.rule] ?? a.rule}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="font-medium text-ink-900">{a.user.name}</div>
                  <div className="text-xs text-ink-500">{a.user.phone} · {a.user.role}</div>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-ink-600">{a.dateKey}</td>
                <td className="px-5 py-3">
                  <Badge variant={a.severity === "HIGH" ? "danger" : "warning"}>{a.severity}</Badge>
                </td>
                <td className="px-5 py-3">
                  <Badge variant={STATUS_BADGE[a.status] ?? "default"}>{a.status}</Badge>
                </td>
                <td className="px-5 py-3 text-ink-500">{fmtDate(a.createdAt)}</td>
                <td className="px-5 py-3 text-right">
                  <Button variant="secondary" onClick={() => { setSelected(a); setNote(a.reviewNote ?? ""); }}>
                    <Eye className="h-4 w-4" /> Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Review drawer */}
      {selected && (
        <div className="rounded-2xl border border-brand-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-ink-900">
                {RULE_LABELS[selected.rule] ?? selected.rule} — {selected.user.name}
              </h3>
              <p className="mt-1 text-sm text-ink-600">
                {selected.user.email} · {selected.user.phone} · {selected.user.role} · IST day {selected.dateKey}
              </p>
              {selected.reviewedByName && (
                <p className="mt-1 text-xs text-ink-500">
                  Last review: {selected.reviewedByName} at {fmtDate(selected.reviewedAt)}
                </p>
              )}
            </div>
            <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
          </div>

          <div className="mt-4 rounded-xl bg-ink-900 p-4 font-mono text-xs text-ink-100 overflow-x-auto">
            <pre>{JSON.stringify(selected.details, null, 2)}</pre>
          </div>

          <div className="mt-4">
            <Label>Review note (required to clear or report)</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-ink-200 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none"
              placeholder="Findings, rationale, FIU-IND reference number if filed…"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => review("UNDER_REVIEW")} disabled={acting}>
              <Eye className="h-4 w-4" /> Mark under review
            </Button>
            <Button variant="secondary" onClick={() => review("CLEARED")} disabled={acting || !note.trim()}>
              <CheckCircle2 className="h-4 w-4" /> Clear (false positive)
            </Button>
            <Button onClick={() => review("REPORTED")} disabled={acting || !note.trim()}>
              <Flag className="h-4 w-4" /> Mark STR reported
            </Button>
          </div>
        </div>
      )}

      {/* Audit chain integrity */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
          <Link2 className="h-5 w-5 text-ink-400" /> Audit-chain anchors
        </h2>
        {verifyResult && (
          <div
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
              verifyResult.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {verifyResult.ok ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {verifyResult.ok
              ? `${verifyResult.dateKey}: audit history verified — hashes match the anchor.`
              : `${verifyResult.dateKey}: VERIFICATION FAILED (${verifyResult.reason}). Investigate immediately.`}
          </div>
        )}
        <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 text-left text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Day</th>
                <th className="px-5 py-3 font-semibold">Rows</th>
                <th className="px-5 py-3 font-semibold">Chain hash</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-ink-800">
              {anchors.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-ink-500">
                    No anchors yet — the first daily anchor is created at 00:20 IST.
                  </td>
                </tr>
              )}
              {anchors.map((an) => (
                <tr key={an.dateKey} className="hover:bg-ink-50/40">
                  <td className="px-5 py-3 font-mono text-xs">{an.dateKey}</td>
                  <td className="px-5 py-3 text-ink-600">{an.rowCount}</td>
                  <td className="px-5 py-3 font-mono text-[10px] text-ink-500">
                    {an.chainHash.slice(0, 24)}…
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="secondary" onClick={() => verifyAnchor(an.dateKey)} disabled={verifying === an.dateKey}>
                      <ShieldCheck className="h-4 w-4" /> {verifying === an.dateKey ? "Verifying…" : "Verify"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
