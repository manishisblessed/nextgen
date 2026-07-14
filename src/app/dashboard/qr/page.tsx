"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  QrCode,
  IndianRupee,
  Clock,
  CheckCircle2,
  UploadCloud,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { formatINR } from "@/lib/utils";

type ActiveQr = {
  id: string;
  label: string;
  upiVpa: string | null;
  imageUrl: string;
  activatedAt: string;
};

type Claim = {
  id: string;
  qrLabel: string;
  amount: number;
  utr: string;
  paidAt: string;
  status: "PENDING" | "AWAITING_SECOND_APPROVAL" | "APPROVED" | "REJECTED" | "CLAWED_BACK";
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const STATUS_BADGE: Record<Claim["status"], { label: string; variant: "success" | "warning" | "danger" | "brand" }> = {
  PENDING: { label: "Under review", variant: "warning" },
  AWAITING_SECOND_APPROVAL: { label: "Under review", variant: "warning" },
  APPROVED: { label: "Credited", variant: "success" },
  REJECTED: { label: "Rejected", variant: "danger" },
  CLAWED_BACK: { label: "Reversed", variant: "danger" },
};

export default function QrCollectionsPage() {
  const [qr, setQr] = useState<ActiveQr | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  // Claim form
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [screenshot, setScreenshot] = useState<{ name: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [qrRes, clRes] = await Promise.all([fetch("/api/qr/active"), fetch("/api/qr/claims")]);
      if (qrRes.ok) setQr((await qrRes.json()).qr);
      if (clRes.ok) setClaims((await clRes.json()).claims ?? []);
    } catch {
      toast.error("Could not load QR data — check your connection.");
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
      toast.error("Screenshot must be under 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setScreenshot({ name: file.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  async function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!qr || !screenshot) return;
    setBusy(true);
    try {
      const res = await fetch("/api/qr/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrId: qr.id,
          amount: Number(amount),
          utr: utr.trim(),
          paidAt: new Date(paidAt).toISOString(),
          screenshotDataUrl: screenshot.dataUrl,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(typeof d.error === "string" ? d.error : "Claim submission failed — check the details");
        return;
      }
      toast.success(
        `Claim submitted for ${formatINR(d.claim.amount)} (UTR ${d.claim.utr}). It will be credited to your wallet after verification.`
      );
      setAmount("");
      setUtr("");
      setPaidAt("");
      setScreenshot(null);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch {
      toast.error("Network error — check 'My claims' before retrying to avoid duplicates.");
    } finally {
      setBusy(false);
    }
  }

  const pendingAmount = claims
    .filter((c) => c.status === "PENDING" || c.status === "AWAITING_SECOND_APPROVAL")
    .reduce((s, c) => s + c.amount, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const creditedThisMonth = claims
    .filter((c) => c.status === "APPROVED" && c.reviewedAt && new Date(c.reviewedAt) >= monthStart)
    .reduce((s, c) => s + c.amount, 0);

  const cols: Column<Claim>[] = [
    { key: "utr", header: "UTR", render: (r) => <span className="font-mono text-xs">{r.utr}</span> },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span>,
    },
    {
      key: "paidAt",
      header: "Paid at",
      render: (r) => new Date(r.paidAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    },
    { key: "qrLabel", header: "QR" },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const b = STATUS_BADGE[r.status];
        return (
          <div>
            <Badge variant={b.variant}>{b.label}</Badge>
            {r.reviewNote && <div className="mt-1 text-xs text-ink-500">{r.reviewNote}</div>}
          </div>
        );
      },
    },
    {
      key: "createdAt",
      header: "Submitted",
      render: (r) => new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="QR Collections"
        title="Collect on the shop QR"
        description="Take customer payments on the platform QR, then claim each payment with its UTR and screenshot — verified claims are credited to your wallet."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Under review" value={formatINR(pendingAmount)} icon={Clock} accent="accent" />
        <StatCard label="Credited this month" value={formatINR(creditedThisMonth)} icon={CheckCircle2} accent="emerald" />
        <StatCard label="Total claims" value={String(claims.length)} icon={IndianRupee} accent="brand" />
        <StatCard label="Active QR" value={qr ? "Live" : "—"} icon={QrCode} accent="violet" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* The QR to collect on */}
        <div className="rounded-2xl border border-ink-100 bg-gradient-to-br from-brand-50 to-accent-50 p-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <h3 className="font-display text-base font-semibold text-ink-900">Shop collection QR</h3>
            <button
              type="button"
              onClick={refresh}
              className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-white hover:text-ink-700"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          {qr ? (
            <>
              <p className="mt-1 text-xs text-ink-600">
                {qr.label}
                {qr.upiVpa ? (
                  <>
                    {" · "}
                    <span className="font-mono font-semibold">{qr.upiVpa}</span>
                  </>
                ) : null}
              </p>
              <div className="mx-auto mt-6 grid max-w-xs place-items-center rounded-2xl bg-white p-4 shadow-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.imageUrl} alt="Shop collection QR" className="w-full rounded-xl" />
              </div>
              <a
                href={qr.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-brand-700 shadow-sm"
              >
                <UploadCloud className="h-3.5 w-3.5 rotate-180" />
                Open full size / download
              </a>
              <p className="mt-3 text-[11px] text-ink-500">
                Works with PhonePe, Google Pay, Paytm &amp; every UPI app. After the customer pays,
                claim the payment on the right — it is settled to your wallet after verification.
              </p>
            </>
          ) : (
            <p className="mt-6 text-sm text-ink-600">
              {loading ? "Loading…" : "No collection QR is configured yet — contact your admin."}
            </p>
          )}
        </div>

        {/* Claim form */}
        <form onSubmit={submitClaim} className="space-y-4 rounded-2xl border border-ink-100 bg-white p-6">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <IndianRupee className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-display text-base font-semibold text-ink-900">Claim a payment</h3>
              <p className="text-xs text-ink-500">One claim per UPI payment — the UTR can never be claimed twice.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="claim-amount">Amount (₹)</Label>
              <Input
                id="claim-amount"
                type="number"
                required
                min={1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Exact amount received"
              />
            </div>
            <div>
              <Label htmlFor="claim-paidat">Paid on</Label>
              <Input
                id="claim-paidat"
                type="datetime-local"
                required
                value={paidAt}
                max={new Date().toISOString().slice(0, 16)}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="claim-utr">UPI UTR / reference number (12 digits)</Label>
            <Input
              id="claim-utr"
              required
              inputMode="numeric"
              minLength={12}
              maxLength={14}
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="e.g. 415023987654"
            />
            <p className="mt-1 text-xs text-ink-500">
              Shown in the customer&apos;s UPI app under &quot;UTR&quot; or &quot;UPI Ref No&quot;.
            </p>
          </div>

          <div>
            <Label htmlFor="claim-shot">Payment screenshot</Label>
            <input
              id="claim-shot"
              ref={fileRef}
              type="file"
              required
              accept="image/png,image/jpeg,image/webp"
              onChange={pickFile}
              className="block w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700"
            />
            {screenshot && <p className="mt-1 text-xs text-emerald-600">Attached: {screenshot.name}</p>}
          </div>

          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            Claims are verified against the payment provider&apos;s settlement data. Fraudulent or
            edited screenshots lead to permanent account termination and recovery action.
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={busy || !qr || !screenshot} isLoading={busy}>
            Submit claim{amount ? ` for ${formatINR(Number(amount) || 0)}` : ""}
          </Button>
        </form>
      </div>

      <DataTable
        title="My claims"
        description="Every payment you've claimed on the collection QR and its verification status."
        columns={cols}
        data={claims}
        loading={loading}
        empty="No claims yet — collect a payment on the QR and claim it here."
      />
    </div>
  );
}
