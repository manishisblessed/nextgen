"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type NeedsReviewItem = {
  id: string;
  refId: string;
  userId: string;
  status: string;
  service: string;
  partner: string | null;
  partnerTxnId: string | null;
  amount: number;
  fee: number;
  operator: string | null;
  customer: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  refs: string[];
  createdAt: string;
  updatedAt: string;
  refundEligibleAt: string | null;
  user: { phone: string; userCode: string | null } | null;
};

type LiveStatus = {
  found: boolean;
  refId?: string;
  status?: string;
  rail?: string;
  pollable?: boolean;
  providerStatus?: string;
  requestId?: string | null;
  matchedRef?: string | null;
  amount?: number | null;
  candidates?: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function istFull(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** "Refund in Xm" / "Refund ready" label for cooling-off window rows. */
function etaLabel(iso: string): string {
  const remaining = Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000);
  if (remaining <= 0) return "Refund ready";
  if (remaining < 60) return `Refund in ${remaining}m`;
  const hrs = Math.floor(remaining / 60);
  return `Refund in ${hrs}h ${remaining % 60}m`;
}

function serviceName(code: string) {
  const map: Record<string, string> = {
    BILL_ELECTRICITY: "Electricity",
    BILL_WATER: "Water",
    BILL_GAS: "Gas",
    BILL_CREDIT_CARD: "Credit Card",
    BILL_EDUCATION: "Education",
    BILL_INSURANCE: "Insurance",
    RECHARGE_BROADBAND: "Broadband",
    RECHARGE_PREPAID: "Mobile Recharge",
  };
  return map[code] ?? code;
}

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={copy}
      title={`Copy ${value}`}
      className="inline-flex max-w-[14ch] items-center gap-1 overflow-hidden rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 font-mono text-[11px] text-ink-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <ClipboardCheck className="h-3 w-3 shrink-0 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3 shrink-0" />
      )}
    </button>
  );
}

function ProviderStatusBadge({ status }: { status: string }) {
  if (status === "SUCCESS")
    return <Badge variant="success">SUCCESS</Badge>;
  if (status === "FAILED" || status === "REFUNDED")
    return <Badge variant="danger">{status}</Badge>;
  if (status === "PENDING")
    return <Badge variant="warning">PENDING</Badge>;
  if (status === "UNRESOLVED")
    return <Badge variant="default" className="bg-orange-50 text-orange-700">UNRESOLVED</Badge>;
  if (status === "NOT_POLLED")
    return <Badge variant="default">NOT POLLED</Badge>;
  return <Badge variant="default">{status}</Badge>;
}

// ─── Resolve step state machine ───────────────────────────────────────────────
// Step 1: confirmRef         — confirm which internal refId to resolve
// Step 2: needProviderRef    — ask for the provider-panel ref (or "not found")
// Step 3: confirmNotFound    — final "are you SURE this is not in provider panel?"
type Step = "idle" | "confirmRef" | "needProviderRef" | "confirmNotFound";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NeedsReviewPage() {
  const [items, setItems] = useState<NeedsReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [exposure, setExposure] = useState(0);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<NeedsReviewItem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Resolve flow
  const [step, setStep] = useState<Step>("idle");
  const [providerRef, setProviderRef] = useState("");
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Live status
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [liveStatusLoading, setLiveStatusLoading] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/transactions/needs-review?page=${p}`);
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
      setExposure(d.exposure ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  function openDetails(row: NeedsReviewItem) {
    setSelected(row);
    setDetailsOpen(true);
    setLiveStatus(null);
    setResolveError(null);
    setStep("idle");
  }

  async function fetchLiveStatus() {
    if (!selected) return;
    setLiveStatusLoading(true);
    setLiveStatus(null);
    try {
      const r = await fetch("/api/admin/transactions/status-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refId: selected.refId }),
      });
      const d = await r.json();
      setLiveStatus(d);
    } catch {
      setLiveStatus(null);
    } finally {
      setLiveStatusLoading(false);
    }
  }

  async function runResolve(opts: { providerRef?: string }) {
    if (!selected) return;
    setResolveBusy(true);
    setResolveError(null);
    try {
      const r = await fetch("/api/admin/transactions/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refId: selected.refId,
          providerRef: opts.providerRef || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setResolveError(d.error ?? "Resolve failed");
        return;
      }
      if (d.outcome === "unresolved") {
        setResolveError(
          "Provider couldn't confirm any reference — supply the ref from the provider panel."
        );
        return;
      }
      // Success — close modals and reload
      setDetailsOpen(false);
      setStep("idle");
      load(page);
    } catch {
      setResolveError("Network error — please retry.");
    } finally {
      setResolveBusy(false);
    }
  }

  async function runForceRefundNotFound() {
    if (!selected) return;
    setResolveBusy(true);
    setResolveError(null);
    try {
      const r = await fetch("/api/admin/transactions/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refId: selected.refId,
          forceRefundNotFound: true,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setResolveError(d.error ?? "Force refund failed");
        return;
      }
      setDetailsOpen(false);
      setStep("idle");
      load(page);
    } catch {
      setResolveError("Network error — please retry.");
    } finally {
      setResolveBusy(false);
    }
  }

  // ─── DataTable columns ────────────────────────────────────────────────────

  const columns: Column<NeedsReviewItem>[] = [
    {
      key: "refId",
      header: "Ref ID",
      render: (row) => (
        <div className="flex items-center gap-1">
          <CopyChip value={row.refId} />
        </div>
      ),
    },
    {
      key: "service",
      header: "Biller / Card",
      render: (row) => (
        <div className="min-w-0">
          <div className="text-xs font-semibold text-ink-800">
            {serviceName(row.service)}
          </div>
          {row.operator && (
            <div className="text-[11px] text-ink-500 truncate">{row.operator}</div>
          )}
          {row.customer && (
            <div className="font-mono text-[11px] text-ink-400 truncate">{row.customer}</div>
          )}
        </div>
      ),
    },
    {
      key: "refs",
      header: "Verify Refs",
      render: (row) =>
        row.refs.length === 0 ? (
          <span className="text-xs text-ink-400">None</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.refs.slice(0, 3).map((ref) => (
              <CopyChip key={ref} value={ref} />
            ))}
            {row.refs.length > 3 && (
              <span className="text-[11px] text-ink-400">
                +{row.refs.length - 3} more
              </span>
            )}
          </div>
        ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (row) => (
        <span className="font-semibold tabular-nums">
          ₹{row.amount.toFixed(2)}
        </span>
      ),
    },
    {
      key: "user",
      header: "Retailer",
      render: (row) => (
        <div className="min-w-0">
          <div className="text-xs text-ink-800">{row.user?.userCode ?? "—"}</div>
          <div className="text-[11px] text-ink-500">{row.user?.phone ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Date",
      render: (row) => (
        <span className="text-xs text-ink-600">{istFull(row.createdAt)}</span>
      ),
    },
    {
      key: "refundEligibleAt",
      header: "Status",
      render: (row) =>
        row.refundEligibleAt ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            <Clock className="h-3 w-3" />
            {etaLabel(row.refundEligibleAt)}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
            Held
          </span>
        ),
    },
    {
      key: "id",
      header: "",
      render: (row) => (
        <Button size="sm" variant="outline" onClick={() => openDetails(row)}>
          Details
        </Button>
      ),
    },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Admin / Transactions"
        title="Needs Review"
        description={`${total} transaction${total !== 1 ? "s" : ""} held for verification · Exposure ₹${exposure.toFixed(2)}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(page)}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        empty="No transactions pending review. ✓"
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => { setPage(p); load(p); }}
        className="mt-4"
      />

      {/* ─── Details Modal ─────────────────────────────────────────────── */}
      {selected && (
        <Modal
          open={detailsOpen}
          onClose={() => { setDetailsOpen(false); setStep("idle"); }}
          title={
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Transaction Details
            </span>
          }
          size="lg"
        >
          <div className="space-y-5 text-sm">
            {/* Summary row */}
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="warning">NEEDS REVIEW</Badge>
                <span className="font-mono text-xs text-ink-700">{selected.refId}</span>
                <span className="ml-auto font-semibold text-ink-900">
                  ₹{selected.amount.toFixed(2)}
                </span>
              </div>
              {selected.errorCode && (
                <p className="mt-2 text-xs text-amber-700">
                  {selected.errorCode} — {selected.errorMessage}
                </p>
              )}
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
              <div>
                <p className="text-ink-500 font-medium">Service</p>
                <p className="text-ink-900">{serviceName(selected.service)}</p>
              </div>
              <div>
                <p className="text-ink-500 font-medium">Partner</p>
                <p className="text-ink-900">{selected.partner ?? "—"}</p>
              </div>
              <div>
                <p className="text-ink-500 font-medium">Operator</p>
                <p className="text-ink-900">{selected.operator ?? "—"}</p>
              </div>
              <div>
                <p className="text-ink-500 font-medium">Customer / Number</p>
                <p className="text-ink-900 font-mono">{selected.customer ?? "—"}</p>
              </div>
              <div>
                <p className="text-ink-500 font-medium">Fee</p>
                <p className="text-ink-900">₹{selected.fee.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-ink-500 font-medium">Retailer</p>
                <p className="text-ink-900">{selected.user?.userCode ?? "—"} · {selected.user?.phone ?? "—"}</p>
              </div>
              <div>
                <p className="text-ink-500 font-medium">Partner Txn ID</p>
                <p className="text-ink-900 font-mono text-[11px]">{selected.partnerTxnId ?? "—"}</p>
              </div>
              <div>
                <p className="text-ink-500 font-medium">Created</p>
                <p className="text-ink-900">{istFull(selected.createdAt)}</p>
              </div>
            </div>

            {/* Verify Refs */}
            <div>
              <p className="text-xs font-semibold text-ink-500 mb-2">
                Provider Verify Refs — tap to copy, then check in provider panel
              </p>
              {selected.refs.length === 0 ? (
                <p className="text-xs text-ink-400 italic">
                  No refs found — supply the ref manually during resolve.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selected.refs.map((ref) => (
                    <CopyChip key={ref} value={ref} />
                  ))}
                </div>
              )}
            </div>

            {/* Live Status Panel */}
            <div className="rounded-xl border border-ink-100 bg-ink-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs font-semibold text-ink-700">Live Provider Status</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchLiveStatus}
                  disabled={liveStatusLoading}
                >
                  {liveStatusLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  {liveStatusLoading ? "Polling…" : "Fetch live status"}
                </Button>
              </div>

              {liveStatus ? (
                liveStatus.found === false ? (
                  <p className="text-xs text-ink-500">Transaction not found in provider.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div>
                      <p className="text-ink-500 font-medium">Provider Status</p>
                      <ProviderStatusBadge status={liveStatus.providerStatus ?? "—"} />
                    </div>
                    <div>
                      <p className="text-ink-500 font-medium">Rail</p>
                      <p className="text-ink-900 uppercase">{liveStatus.rail}</p>
                    </div>
                    {liveStatus.matchedRef && (
                      <div>
                        <p className="text-ink-500 font-medium">Matched Ref</p>
                        <CopyChip value={liveStatus.matchedRef} />
                      </div>
                    )}
                    {liveStatus.requestId && (
                      <div>
                        <p className="text-ink-500 font-medium">Pay Ref</p>
                        <CopyChip value={liveStatus.requestId} />
                      </div>
                    )}
                    {liveStatus.amount != null && (
                      <div>
                        <p className="text-ink-500 font-medium">Provider Amount</p>
                        <p className="text-ink-900 font-semibold tabular-nums">
                          ₹{liveStatus.amount.toFixed(2)}
                        </p>
                      </div>
                    )}
                    {liveStatus.providerStatus === "UNRESOLVED" && (
                      <div className="col-span-2">
                        <p className="text-xs text-orange-600">
                          Provider could not confirm any reference. If you have verified in the
                          provider panel that this transaction does not exist, use the
                          "Not found — refund" action below.
                        </p>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <p className="text-xs text-ink-400 italic">
                  Click "Fetch live status" to poll the provider in real-time.
                </p>
              )}
            </div>

            {/* Error banner */}
            {resolveError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
                {resolveError}
              </div>
            )}

            {/* Resolve actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={() => { setProviderRef(""); setStep("confirmRef"); }}
                disabled={resolveBusy}
              >
                <CheckCircle2 className="h-4 w-4" />
                Resolve / verify with provider
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Step 1: Confirm which refId to resolve ───────────────────── */}
      {selected && (
        <ConfirmDialog
          open={step === "confirmRef"}
          onClose={() => setStep("idle")}
          title="Resolve / verify with provider"
          description={
            <span>
              This will poll the provider's status API for{" "}
              <span className="font-mono font-semibold">{selected.refId}</span> and
              apply the authoritative outcome (settle SUCCESS or refund FAILED).
              Money moves only after the provider confirms — never on admin say-so alone.
            </span>
          }
          confirmLabel="Continue"
          tone="default"
          onConfirm={() => setStep("needProviderRef")}
        />
      )}

      {/* ─── Step 2: Optionally supply provider-panel ref ─────────────── */}
      {selected && (
        <ConfirmDialog
          open={step === "needProviderRef"}
          onClose={() => setStep("idle")}
          busy={resolveBusy}
          title="Provider panel reference (optional)"
          description={
            <span>
              Copy the Order ID / Request ID from the{" "}
              <span className="font-semibold">{selected.partner ?? "provider"}</span> panel
              and paste it below. Leave blank to let the system try stored refs.
            </span>
          }
          confirmLabel="Resolve now"
          cancelLabel="Cancel"
          tone="default"
          input={{
            label: "Provider ref (Order ID / Request ID)",
            placeholder: "P2N_PAY_... or SDS...",
            required: false,
          }}
          onConfirm={(ref) => {
            setProviderRef(ref);
            runResolve({ providerRef: ref || undefined });
          }}
          extraActions={
            <Button
              size="sm"
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
              disabled={resolveBusy}
              onClick={() => setStep("confirmNotFound")}
            >
              <XCircle className="h-4 w-4" />
              Not found — refund
            </Button>
          }
        />
      )}

      {/* ─── Step 3: Double-confirm "Not found — refund" ──────────────── */}
      {selected && (
        <ConfirmDialog
          open={step === "confirmNotFound"}
          onClose={() => setStep("idle")}
          busy={resolveBusy}
          tone="danger"
          title="Confirm: not found in provider panel?"
          description={
            <span>
              You are confirming that{" "}
              <span className="font-mono font-semibold">{selected.refId}</span> (
              ₹{selected.amount.toFixed(2)}) does NOT exist in the{" "}
              <span className="font-semibold">{selected.partner ?? "provider"}</span>{" "}
              panel. The held reserve will be{" "}
              <span className="font-semibold text-rose-700">refunded immediately</span>.
              This action is logged and irreversible.
            </span>
          }
          confirmLabel="Yes — refund now"
          cancelLabel="Go back"
          onConfirm={() => runForceRefundNotFound()}
        />
      )}
    </div>
  );
}
