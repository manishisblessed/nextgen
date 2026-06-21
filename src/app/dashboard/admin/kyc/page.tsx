"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Eye,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportActions } from "@/components/dashboard/ReportActions";

type KycDoc = {
  id: string;
  type: string;
  url: string;
  format: string | null;
  uploadedAt: string;
};

type KycRow = {
  id: string;
  status: "NOT_STARTED" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  panNumber: string | null;
  aadhaarLast4: string | null;
  gstin: string | null;
  rejectedReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    status: string;
    shopName: string | null;
    city: string | null;
    state: string | null;
  };
  documents: KycDoc[];
};

type Stats = { pending: number; approved: number; rejected: number };

const STATUS_MAP: Record<
  string,
  { label: string; variant: "warning" | "success" | "danger" | "default" }
> = {
  NOT_STARTED: { label: "Not started", variant: "default" },
  PENDING_REVIEW: { label: "Awaiting review", variant: "warning" },
  APPROVED: { label: "Verified", variant: "success" },
  REJECTED: { label: "Rejected", variant: "danger" },
};

const ROLE_LABEL: Record<string, string> = {
  RETAILER: "Retailer",
  DISTRIBUTOR: "Distributor",
  MASTER_DISTRIBUTOR: "Master Dist.",
  ADMIN: "Admin",
  SUPPORT: "Sub-admin",
};

const DOC_TYPE_LABEL: Record<string, string> = {
  PAN: "PAN Card",
  AADHAAR_FRONT: "Aadhaar (Front)",
  AADHAAR_BACK: "Aadhaar (Back)",
  SHOP_PHOTO: "Shop Photo",
  BANK_PROOF: "Bank Proof",
  GST_CERT: "GST Certificate",
  SELFIE: "Selfie",
  AGREEMENT: "Agreement",
  OTHER: "Other",
};

export default function AdminKycPage() {
  const [rows, setRows] = useState<KycRow[]>([]);
  const [stats, setStats] = useState<Stats>({
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [viewing, setViewing] = useState<KycRow | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      setFetching(true);
      setError(null);
      const res = await fetch("/api/kyc/queue");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setRows(json.kycs);
      setStats(json.stats);
    } catch {
      setError("Could not load KYC queue.");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  async function decide(id: string, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      const input = prompt("Rejection reason (required for the applicant):");
      if (input === null) return;
      reason = input || "Documents insufficient";
    }

    setDeciding(id);
    try {
      const res = await fetch(`/api/kyc/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? "Action failed");
        return;
      }
      await fetchQueue();
    } finally {
      setDeciding(null);
    }
  }

  const reportRows = rows.map((r) => ({
    id: r.id,
    name: r.user.name,
    email: r.user.email,
    role: ROLE_LABEL[r.user.role] ?? r.user.role,
    shop: r.user.shopName ?? "—",
    city: r.user.city ?? "—",
    pan: r.panNumber ?? "—",
    aadhaar: r.aadhaarLast4 ? `XXXX-${r.aadhaarLast4}` : "—",
    submitted: r.submittedAt
      ? new Date(r.submittedAt).toLocaleDateString("en-IN")
      : "—",
    status: STATUS_MAP[r.status]?.label ?? r.status,
  }));

  const cols: Column<KycRow>[] = [
    {
      key: "user",
      header: "Applicant",
      render: (r) => (
        <div>
          <div className="font-semibold text-ink-900">{r.user.name}</div>
          <div className="text-xs text-ink-500">
            {r.user.shopName ?? r.user.email}
            {r.user.city ? ` · ${r.user.city}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "role" as keyof KycRow,
      header: "Role",
      render: (r) => (
        <Badge
          variant={r.user.role === "DISTRIBUTOR" ? "brand" : "default"}
        >
          {ROLE_LABEL[r.user.role] ?? r.user.role}
        </Badge>
      ),
    },
    {
      key: "panNumber",
      header: "PAN",
      render: (r) => r.panNumber ?? "—",
    },
    {
      key: "aadhaarLast4",
      header: "Aadhaar",
      render: (r) =>
        r.aadhaarLast4 ? `XXXX-XXXX-${r.aadhaarLast4}` : "—",
    },
    {
      key: "submittedAt",
      header: "Submitted",
      render: (r) =>
        r.submittedAt
          ? new Date(r.submittedAt).toLocaleDateString("en-IN", {
              dateStyle: "medium",
            })
          : "—",
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const s = STATUS_MAP[r.status];
        return <Badge variant={s?.variant ?? "default"}>{s?.label ?? r.status}</Badge>;
      },
    },
    {
      key: "id",
      header: "",
      align: "right",
      render: (r) => {
        const busy = deciding === r.id;
        return (
          <div className="flex justify-end gap-1">
            <button
              onClick={() => setViewing(r)}
              className="grid h-8 w-8 place-items-center rounded-lg text-brand-700 hover:bg-brand-50"
              title="View documents"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              onClick={() => decide(r.id, "approve")}
              disabled={r.status !== "PENDING_REVIEW" || busy}
              className="grid h-8 w-8 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50 disabled:opacity-30"
              title="Approve"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => decide(r.id, "reject")}
              disabled={r.status !== "PENDING_REVIEW" || busy}
              className="grid h-8 w-8 place-items-center rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-30"
              title="Reject"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="KYC approvals"
        description="Review applicant documents, validate PAN/Aadhaar, and approve or reject."
        actions={
          <>
            <ReportActions
              filename="kyc-queue"
              title="JMP NextGenPay · KYC Queue"
              subtitle={`${rows.length} applicants`}
              columns={[
                { key: "id", header: "KYC ID" },
                { key: "name", header: "Applicant" },
                { key: "email", header: "Email" },
                { key: "role", header: "Role" },
                { key: "shop", header: "Shop / Firm" },
                { key: "city", header: "City" },
                { key: "pan", header: "PAN" },
                { key: "aadhaar", header: "Aadhaar" },
                { key: "submitted", header: "Submitted" },
                { key: "status", header: "Status" },
              ]}
              rows={reportRows}
            />
            <Button variant="outline" onClick={fetchQueue} disabled={fetching}>
              <RefreshCw
                className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button variant="outline" disabled>
              <ShieldCheck className="h-4 w-4" /> Auto-verify (DigiLocker)
            </Button>
          </>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Awaiting review" value={stats.pending} tone="warning" />
        <Stat label="Verified" value={stats.approved} tone="success" />
        <Stat label="Rejected" value={stats.rejected} tone="danger" />
      </div>

      <DataTable
        title="KYC queue"
        columns={cols}
        data={rows}
        empty={
          fetching
            ? "Loading KYC applications…"
            : "No KYC applications found."
        }
      />

      {viewing && (
        <DocViewerDialog kyc={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function DocViewerDialog({
  kyc,
  onClose,
}: {
  kyc: KycRow;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 bg-gradient-to-br from-brand-50/50 to-white px-6 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700">
              KYC Documents
            </p>
            <h3 className="mt-0.5 font-display text-lg font-bold text-ink-900">
              {kyc.user.name}
            </h3>
            <p className="text-xs text-ink-500">
              {kyc.user.email} · {ROLE_LABEL[kyc.user.role] ?? kyc.user.role}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoField label="PAN" value={kyc.panNumber ?? "—"} />
            <InfoField
              label="Aadhaar"
              value={
                kyc.aadhaarLast4 ? `XXXX-XXXX-${kyc.aadhaarLast4}` : "—"
              }
            />
            <InfoField label="GSTIN" value={kyc.gstin ?? "—"} />
            <InfoField
              label="Submitted"
              value={
                kyc.submittedAt
                  ? new Date(kyc.submittedAt).toLocaleDateString("en-IN", {
                      dateStyle: "long",
                    })
                  : "—"
              }
            />
          </div>

          <h4 className="mt-6 text-xs font-bold uppercase tracking-widest text-ink-500">
            Uploaded documents ({kyc.documents.length})
          </h4>
          {kyc.documents.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">
              No documents uploaded yet.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {kyc.documents.map((d) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-xl border border-ink-200 bg-ink-50/40 p-3 transition hover:border-brand-300"
                >
                  <p className="text-xs font-bold text-ink-700">
                    {DOC_TYPE_LABEL[d.type] ?? d.type}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-500">
                    {d.format?.toUpperCase()} ·{" "}
                    {new Date(d.uploadedAt).toLocaleDateString("en-IN")}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-brand-700 group-hover:underline">
                    View document →
                  </p>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/40 px-6 py-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white px-4 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "warning";
}) {
  const map = {
    success: "from-emerald-500 to-emerald-700 text-emerald-50",
    danger: "from-rose-500 to-rose-700 text-rose-50",
    warning: "from-amber-500 to-amber-700 text-amber-50",
  };
  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${map[tone]} p-5 shadow-soft`}
    >
      <p className="text-xs font-bold uppercase tracking-widest opacity-90">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}
