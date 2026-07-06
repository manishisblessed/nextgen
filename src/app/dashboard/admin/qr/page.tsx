"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  QrCode,
  Clock,
  ShieldCheck,
  Banknote,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { formatINR } from "@/lib/utils";

type Overview = {
  pendingCount: number;
  pendingAmount: number;
  awaitingSecondCount: number;
  awaitingSecondAmount: number;
  outstandingReceivableCount: number;
  outstandingReceivable: number;
};

type ClaimRow = {
  id: string;
  retailer: { id: string; name: string; phone: string; shopName: string | null };
  qrLabel: string;
  qrVpa: string | null;
  amount: number;
  utr: string;
  paidAt: string;
  status: "PENDING" | "AWAITING_SECOND_APPROVAL" | "APPROVED" | "REJECTED" | "CLAWED_BACK";
  firstApprovedById: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  screenshotUrl: string;
};

type QrRow = {
  id: string;
  label: string;
  upiVpa: string | null;
  imageUrl: string;
  active: boolean;
  claimCount: number;
  createdBy: string;
  createdAt: string;
  disabledAt: string | null;
};

// ---------------------------------------------------------------------------
// Tab 1 — claims review queue
// ---------------------------------------------------------------------------

function ReviewQueueTab() {
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [threshold, setThreshold] = useState(10000);
  const [statusFilter, setStatusFilter] = useState<"REVIEWABLE" | "ALL">("REVIEWABLE");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Review panel state
  const [selected, setSelected] = useState<ClaimRow | null>(null);
  const [portalVerified, setPortalVerified] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/qr/claims?status=${statusFilter}`);
      if (res.ok) {
        const d = await res.json();
        setClaims(d.claims ?? []);
        setOverview(d.overview ?? null);
        if (d.secondApprovalThreshold) setThreshold(d.secondApprovalThreshold);
      }
    } catch {
      setError("Could not load the review queue.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openReview(c: ClaimRow) {
    setSelected(c);
    setPortalVerified(false);
    setNote("");
    setError(null);
    setNotice(null);
  }

  async function act(action: "approve" | "reject") {
    if (!selected) return;
    if (action === "reject" && note.trim().length < 3) {
      setError("A rejection note is required (shown to the retailer).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/qr/claims/${selected.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "approve" ? { portalVerified, note: note.trim() || undefined } : { note: note.trim() }
        ),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(typeof d.error === "string" ? d.error : "Action failed");
        return;
      }
      setNotice(
        d.status === "APPROVED"
          ? `Approved — ${formatINR(selected.amount)} credited to ${selected.retailer.name}'s wallet.`
          : d.status === "AWAITING_SECOND_APPROVAL"
            ? `First approval recorded — a DIFFERENT admin must approve this ${formatINR(selected.amount)} claim before money moves.`
            : "Claim rejected."
      );
      setSelected(null);
      refresh();
    } catch {
      setError("Network error — refresh the queue before retrying.");
    } finally {
      setBusy(false);
    }
  }

  const cols: Column<ClaimRow>[] = [
    {
      key: "retailer",
      header: "Retailer",
      render: (r) => (
        <div>
          <div className="font-medium">{r.retailer.name}</div>
          <div className="text-xs text-ink-500">{r.retailer.shopName ?? r.retailer.phone}</div>
        </div>
      ),
    },
    { key: "utr", header: "UTR", render: (r) => <span className="font-mono text-xs">{r.utr}</span> },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => (
        <div>
          <span className="font-semibold">{formatINR(r.amount)}</span>
          {r.amount > threshold && (
            <div className="text-[10px] font-semibold uppercase text-violet-600">2-admin</div>
          )}
        </div>
      ),
    },
    {
      key: "paidAt",
      header: "Paid at",
      render: (r) => new Date(r.paidAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div>
          <Badge
            variant={
              r.status === "APPROVED"
                ? "success"
                : r.status === "PENDING"
                  ? "warning"
                  : r.status === "AWAITING_SECOND_APPROVAL"
                    ? "brand"
                    : "danger"
            }
          >
            {r.status === "AWAITING_SECOND_APPROVAL" ? "NEEDS 2ND APPROVAL" : r.status}
          </Badge>
          {r.reviewedBy && <div className="mt-1 text-xs text-ink-500">by {r.reviewedBy}</div>}
        </div>
      ),
    },
    {
      key: "id",
      header: "",
      align: "right",
      render: (r) =>
        r.status === "PENDING" || r.status === "AWAITING_SECOND_APPROVAL" ? (
          <Button variant="outline" onClick={() => openReview(r)} className="h-8 px-3 text-xs">
            Review
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      {overview && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Pending review"
            value={`${overview.pendingCount + overview.awaitingSecondCount} · ${formatINR(overview.pendingAmount + overview.awaitingSecondAmount)}`}
            icon={Clock}
            accent="accent"
          />
          <StatCard
            label="Needs 2nd approval"
            value={`${overview.awaitingSecondCount} · ${formatINR(overview.awaitingSecondAmount)}`}
            icon={ShieldCheck}
            accent="violet"
          />
          <StatCard
            label="Outstanding receivable (credited, unsettled by provider)"
            value={formatINR(overview.outstandingReceivable)}
            icon={Banknote}
            accent="brand"
          />
        </div>
      )}

      {(error || notice) && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error ?? notice}</span>
        </div>
      )}

      {/* Review panel */}
      {selected && (
        <div className="rounded-2xl border-2 border-brand-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">Reviewing claim</p>
              <p className="mt-1 font-display text-xl font-bold text-ink-900">
                {formatINR(selected.amount)} · UTR <span className="font-mono">{selected.utr}</span>
              </p>
              <p className="mt-1 text-sm text-ink-600">
                {selected.retailer.name} ({selected.retailer.shopName ?? selected.retailer.phone}) · paid{" "}
                {new Date(selected.paidAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} on{" "}
                {selected.qrLabel}
                {selected.qrVpa ? (
                  <>
                    {" "}
                    → <span className="font-mono">{selected.qrVpa}</span>
                  </>
                ) : null}
              </p>
              {selected.status === "AWAITING_SECOND_APPROVAL" && (
                <p className="mt-2 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  Second approval — must be a different admin than the first approver.
                </p>
              )}
            </div>
            <a
              href={selected.screenshotUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-ink-300"
            >
              <ExternalLink className="h-4 w-4" />
              Open screenshot (signed, 5 min)
            </a>
          </div>

          <div className="mt-4 space-y-3 rounded-xl bg-ink-50/60 p-4">
            <p className="text-xs font-semibold text-ink-700">Verification checklist</p>
            <ul className="space-y-1 text-xs text-ink-600">
              <li>1. Screenshot shows a SUCCESSFUL payment to the correct VPA{selected.qrVpa ? ` (${selected.qrVpa})` : ""}.</li>
              <li>2. Amount, date/time and UTR typed above match what is visible in the image.</li>
              <li>3. The UTR exists in the provider&apos;s merchant portal with the same amount.</li>
            </ul>
            <label className="flex items-start gap-2 rounded-xl border border-ink-200 bg-white p-3 text-sm">
              <input
                type="checkbox"
                checked={portalVerified}
                onChange={(e) => setPortalVerified(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span>
                I verified this UTR and amount in the <strong>provider&apos;s merchant portal</strong>. This
                attestation is recorded against my account in the audit log.
              </span>
            </label>
            <div>
              <Label htmlFor="review-note">Note {`(required to reject)`}</Label>
              <Input
                id="review-note"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Verified in portal / UTR not found in portal"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => act("approve")} disabled={busy || !portalVerified}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                {busy
                  ? "Working…"
                  : selected.amount > threshold && selected.status === "PENDING"
                    ? "Approve (stage for 2nd admin)"
                    : `Approve & credit ${formatINR(selected.amount)}`}
              </Button>
              <Button variant="outline" onClick={() => act("reject")} disabled={busy}>
                <XCircle className="mr-1 h-4 w-4" />
                Reject
              </Button>
              <Button variant="ghost" onClick={() => setSelected(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(
            [
              { id: "REVIEWABLE", label: "Awaiting action" },
              { id: "ALL", label: "All claims" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                statusFilter === f.id
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-ink-100 bg-white text-ink-600 hover:border-ink-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading} className="h-8 px-2">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <DataTable
        title={loading ? "Loading…" : "Claims (oldest first)"}
        columns={cols}
        data={claims}
        empty="Nothing awaiting review."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — static QR management
// ---------------------------------------------------------------------------

function QrManageTab() {
  const [qrs, setQrs] = useState<QrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [vpa, setVpa] = useState("");
  const [image, setImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/qr");
      if (res.ok) setQrs((await res.json()).qrs ?? []);
    } catch {
      setError("Could not load QR codes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("QR image must be under 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage({ name: file.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  async function createQr(e: React.FormEvent) {
    e.preventDefault();
    if (!image) return;
    if (
      qrs.some((q) => q.active) &&
      !window.confirm("Activating a new QR will disable the current one for ALL retailers immediately. Continue?")
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          upiVpa: vpa.trim() || undefined,
          dataUrl: image.dataUrl,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(typeof d.error === "string" ? d.error : "Upload failed — check the fields");
        return;
      }
      setNotice(`"${d.label}" is now the live QR for all retailers.`);
      setLabel("");
      setVpa("");
      setImage(null);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch {
      setError("Network error while uploading the QR.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(qr: QrRow) {
    const msg = qr.active
      ? "Disable this QR? Retailers will have NO live QR until you activate another one."
      : "Activate this QR? The currently live QR (if any) will be disabled.";
    if (!window.confirm(msg)) return;
    setError(null);
    const res = await fetch(`/api/admin/qr/${qr.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !qr.active }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.error === "string" ? d.error : "Could not update the QR");
      return;
    }
    refresh();
  }

  const cols: Column<QrRow>[] = [
    {
      key: "imageUrl",
      header: "QR",
      render: (r) => (
        <a href={r.imageUrl} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.imageUrl} alt={r.label} className="h-12 w-12 rounded-lg border border-ink-100 object-cover" />
        </a>
      ),
    },
    { key: "label", header: "Label" },
    {
      key: "upiVpa",
      header: "VPA",
      render: (r) => (r.upiVpa ? <span className="font-mono text-xs">{r.upiVpa}</span> : "—"),
    },
    { key: "claimCount", header: "Claims", align: "right" },
    {
      key: "active",
      header: "Status",
      render: (r) => <Badge variant={r.active ? "success" : "default"}>{r.active ? "Live" : "Disabled"}</Badge>,
    },
    {
      key: "createdAt",
      header: "Uploaded",
      render: (r) => (
        <div>
          <div>{new Date(r.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</div>
          <div className="text-xs text-ink-500">by {r.createdBy}</div>
        </div>
      ),
    },
    {
      key: "id",
      header: "",
      align: "right",
      render: (r) => (
        <Button variant="outline" onClick={() => toggle(r)} className="h-8 px-3 text-xs">
          {r.active ? "Disable" : "Activate"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {(error || notice) && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error ?? notice}</span>
        </div>
      )}

      <form onSubmit={createQr} className="rounded-2xl border border-ink-100 bg-white p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <QrCode className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">Upload &amp; activate a new QR</h3>
            <p className="text-xs text-ink-500">
              Goes live for every retailer instantly; the previous QR is disabled in the same step (old payments on it
              can still be claimed).
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="qr-label">Label</Label>
            <Input
              id="qr-label"
              required
              minLength={2}
              maxLength={120}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Provider QR — July 2026"
            />
          </div>
          <div>
            <Label htmlFor="qr-vpa">UPI VPA in the QR (recommended)</Label>
            <Input
              id="qr-vpa"
              value={vpa}
              onChange={(e) => setVpa(e.target.value)}
              placeholder="merchant@bank"
            />
            <p className="mt-1 text-xs text-ink-500">Shown to reviewers to eyeball-match screenshots.</p>
          </div>
          <div>
            <Label htmlFor="qr-image">QR image (PNG/JPEG/WebP)</Label>
            <input
              id="qr-image"
              ref={fileRef}
              type="file"
              required
              accept="image/png,image/jpeg,image/webp"
              onChange={pickFile}
              className="block w-full rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700"
            />
            {image && <p className="mt-1 text-xs text-emerald-600">Attached: {image.name}</p>}
          </div>
        </div>

        <Button type="submit" className="mt-4" disabled={busy || !image || !label.trim()}>
          {busy ? "Uploading…" : "Upload & make live"}
        </Button>
      </form>

      <DataTable
        title={loading ? "Loading…" : "QR history"}
        description="Old QRs are kept (never deleted) so historical claims stay traceable."
        columns={cols}
        data={qrs}
        empty="No QR uploaded yet — retailers currently have nothing to collect on."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function AdminQrPage() {
  const [tab, setTab] = useState<"queue" | "manage">("queue");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="QR Collections"
        description="Manage the shop collection QR and verify retailer settlement claims. Money moves only after the UTR is confirmed in the provider portal."
      />

      <div className="flex gap-2">
        {(
          [
            { id: "queue", label: "Review queue" },
            { id: "manage", label: "QR codes" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${
              tab === t.id
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-ink-100 bg-white text-ink-700 hover:border-ink-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "queue" ? <ReviewQueueTab /> : <QrManageTab />}
    </div>
  );
}
