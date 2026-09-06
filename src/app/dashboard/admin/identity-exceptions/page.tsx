"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X, Ban, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useStepUp } from "@/components/security/StepUpProvider";

type ExcUser = { id: string; name: string; userCode: string | null; role: string } | null;

type ExceptionRow = {
  id: string;
  field: string;
  value: string;
  role: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  reason: string;
  linkedUser: ExcUser;
  account: ExcUser;
  approvedBy: ExcUser;
  approvedAt: string | null;
  inviteId: string | null;
  createdAt: string;
};

const FIELD_LABEL: Record<string, string> = {
  PAN: "PAN",
  AADHAAR: "Aadhaar",
  BANK_ACCOUNT: "Bank account",
  GSTIN: "GST",
  MSME: "Udyam",
  SHOP_NAME: "Shop name",
};

const STATUS_BADGE: Record<string, { label: string; variant: "warning" | "success" | "danger" | "default" }> = {
  PENDING: { label: "Pending", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "danger" },
  REVOKED: { label: "Revoked", variant: "default" },
};

/** Mask an identity value for display (keep last 4). */
function maskValue(field: string, value: string): string {
  if (field === "SHOP_NAME") return value;
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.max(2, value.length - 4))}${value.slice(-4)}`;
}

export default function IdentityExceptionsPage() {
  const { fetchWithStepUp } = useStepUp();
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/identity-exceptions?status=${filter}`);
      if (res.ok) setRows((await res.json()).exceptions ?? []);
      else toast.error("Could not load identity exceptions.");
    } catch {
      toast.error("Could not load identity exceptions.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function act(row: ExceptionRow, action: "approve" | "reject" | "revoke") {
    setBusyId(row.id);
    try {
      const res = await fetchWithStepUp(`/api/admin/identity-exceptions/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof d.error === "string" ? d.error : "Action failed");
        return;
      }
      toast.success(`Exception ${action}d.`);
      refresh();
    } catch {
      toast.error("Network error — try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Master Admin"
        title="Identity Exceptions"
        description="Approve, per identity value and tier, when the same PAN / Aadhaar / bank / GST / Udyam / shop name may onboard more than one account (max 4 — one per tier)."
      />

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(
            [
              { id: "PENDING", label: "Pending" },
              { id: "ALL", label: "All" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                filter === f.id ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={refresh} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-3">Identity</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Collides with</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-400">
                  No exceptions {filter === "PENDING" ? "awaiting review" : "found"}.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const b = STATUS_BADGE[r.status];
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-800">{FIELD_LABEL[r.field] ?? r.field}</div>
                      <div className="font-mono text-xs text-ink-500">{maskValue(r.field, r.value)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="default">{r.role.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {r.linkedUser ? (
                        <div>
                          <div className="text-ink-800">{r.linkedUser.name}</div>
                          <div className="text-xs text-ink-500">
                            {r.linkedUser.userCode ?? r.linkedUser.role}
                          </div>
                        </div>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="truncate text-ink-600" title={r.reason}>
                        {r.reason}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={b.variant}>{b.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {r.status !== "APPROVED" && (
                          <Button size="sm" disabled={busyId === r.id} onClick={() => act(r, "approve")}>
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Approve
                          </Button>
                        )}
                        {r.status === "PENDING" && (
                          <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => act(r, "reject")}>
                            <X className="mr-1 h-3.5 w-3.5" />
                            Reject
                          </Button>
                        )}
                        {r.status === "APPROVED" && (
                          <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => act(r, "revoke")}>
                            <Ban className="mr-1 h-3.5 w-3.5" />
                            Revoke
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
