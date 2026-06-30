"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Landmark,
  Wallet,
  Lock,
  Send,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { formatINR } from "@/lib/utils";

type PayoutMode = "IMPS" | "NEFT" | "RTGS" | "UPI";

type Payout = {
  id: string;
  beneficiaryName: string;
  accountLast4: string;
  mode: PayoutMode;
  amount: number;
  serviceCharge: number;
  gst: number;
  totalDebit: number;
  status:
    | "DRAFT"
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "PROCESSING"
    | "SUCCESS"
    | "FAILED"
    | "REJECTED"
    | "REVERSED";
  utr: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
};

type Balances = { walletBalance: number; heldBalance: number; spendable: number };

const STATUS_BADGE: Record<Payout["status"], "success" | "danger" | "warning" | "brand" | "default"> = {
  SUCCESS: "success",
  FAILED: "danger",
  REJECTED: "danger",
  REVERSED: "danger",
  PROCESSING: "brand",
  APPROVED: "brand",
  PENDING_APPROVAL: "warning",
  DRAFT: "default",
};

const STATUS_LABEL: Record<Payout["status"], string> = {
  SUCCESS: "Success",
  FAILED: "Failed",
  REJECTED: "Rejected",
  REVERSED: "Reversed",
  PROCESSING: "Processing",
  APPROVED: "Approved",
  PENDING_APPROVAL: "Pending approval",
  DRAFT: "Draft",
};

const inr2 = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PayoutPage() {
  const [rows, setRows] = useState<Payout[]>([]);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [fetching, setFetching] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setFetching(true);
      setError(null);
      const res = await fetch("/api/payout");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setRows(json.payouts);
      setBalances(json.balances);
    } catch {
      setError("Could not load payouts.");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const reportRows = rows.map((r) => ({
    id: r.id,
    beneficiary: r.beneficiaryName,
    account: `****${r.accountLast4}`,
    mode: r.mode,
    amount: r.amount,
    charge: r.serviceCharge,
    gst: r.gst,
    total: r.totalDebit,
    status: STATUS_LABEL[r.status],
    utr: r.utr ?? "—",
    date: new Date(r.createdAt).toLocaleString("en-IN"),
  }));

  const cols: Column<Payout>[] = [
    {
      key: "beneficiaryName",
      header: "Beneficiary",
      render: (r) => (
        <div>
          <div className="font-semibold text-ink-900">{r.beneficiaryName}</div>
          <div className="font-mono text-xs text-ink-500">****{r.accountLast4} · {r.mode}</div>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span>,
    },
    {
      key: "totalDebit",
      header: "Total debit",
      align: "right",
      render: (r) => (
        <div className="text-right">
          <div className="font-semibold">{inr2(r.totalDebit)}</div>
          <div className="text-[11px] text-ink-500">+{inr2(r.serviceCharge + r.gst)} fees</div>
        </div>
      ),
    },
    {
      key: "utr",
      header: "UTR",
      render: (r) =>
        r.utr ? (
          <span className="font-mono text-xs">{r.utr}</span>
        ) : (
          <span className="text-xs text-ink-400">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div>
          <Badge variant={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
          {r.status === "FAILED" && r.failureReason && (
            <div className="mt-1 max-w-[200px] truncate text-[11px] text-rose-600" title={r.failureReason}>
              {r.failureReason}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "When",
      render: (r) => (
        <span className="whitespace-nowrap text-xs text-ink-500">
          {new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payouts"
        title="Send a payout"
        description="Disburse to any bank account or UPI ID via BulkPe. The beneficiary receives the full amount; service charge + 18% GST are added on top."
        actions={
          <>
            <ReportActions
              filename="payouts"
              title="JMP NextGenPay · Payouts"
              subtitle="My payouts"
              columns={[
                { key: "id", header: "Payout ID" },
                { key: "beneficiary", header: "Beneficiary" },
                { key: "account", header: "Account" },
                { key: "mode", header: "Mode" },
                { key: "amount", header: "Amount (INR)" },
                { key: "charge", header: "Service charge" },
                { key: "gst", header: "GST" },
                { key: "total", header: "Total debit" },
                { key: "status", header: "Status" },
                { key: "utr", header: "UTR" },
                { key: "date", header: "When" },
              ]}
              rows={reportRows}
            />
            <Button variant="outline" onClick={fetchData} disabled={fetching}>
              <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={() => setShowNew((s) => !s)}>
              <Plus className="h-4 w-4" /> New payout
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Spendable"
          value={balances ? formatINR(balances.spendable) : "—"}
          icon={Wallet}
          accent="emerald"
        />
        <StatCard
          label="Wallet balance"
          value={balances ? formatINR(balances.walletBalance) : "—"}
          icon={Landmark}
          accent="brand"
        />
        <StatCard
          label="On hold"
          value={balances ? formatINR(balances.heldBalance) : "—"}
          icon={Lock}
          accent="violet"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {showNew && (
        <NewPayoutForm
          spendable={balances?.spendable ?? 0}
          onCancel={() => setShowNew(false)}
          onSubmitted={() => {
            setShowNew(false);
            fetchData();
          }}
        />
      )}

      <DataTable
        title={fetching ? "Loading…" : `${rows.length} payout${rows.length === 1 ? "" : "s"}`}
        columns={cols}
        data={rows}
        empty={fetching ? "Loading payouts…" : "No payouts yet. Click 'New payout' to send one."}
      />
    </div>
  );
}

type Quote = { serviceCharge: number; gst: number; totalDebit: number; gstPercent: number };

function NewPayoutForm({
  spendable,
  onSubmitted,
  onCancel,
}: {
  spendable: number;
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<PayoutMode>("IMPS");
  const [amount, setAmount] = useState("1000");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [vpa, setVpa] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);

  const isUpi = mode === "UPI";
  // Stable idempotency key for this form instance — regenerated after a submit.
  const idemKey = useRef<string>(crypto.randomUUID());

  const amountNum = Number(amount) || 0;

  useEffect(() => {
    if (!amountNum || amountNum <= 0) {
      setQuote(null);
      return;
    }
    let active = true;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/payout/quote?amount=${amountNum}&mode=${mode}`);
        if (!res.ok) throw new Error();
        const json = (await res.json()) as Quote;
        if (active) setQuote(json);
      } catch {
        if (active) setQuote(null);
      } finally {
        if (active) setQuoting(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [amountNum, mode]);

  const insufficient = useMemo(
    () => quote != null && quote.totalDebit > spendable,
    [quote, spendable]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (insufficient) {
      setError("Total debit exceeds your spendable balance.");
      return;
    }
    setSubmitting(true);
    try {
      // Mint a single-use submit nonce so a captured/cached POST cannot be
      // replayed (server consumes it on first use).
      const nonceRes = await fetch("/api/security/nonce");
      if (!nonceRes.ok) throw new Error("Could not start a secure session. Please retry.");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const res = await fetch("/api/payout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idemKey.current,
          "x-submit-nonce": nonce,
        },
        body: JSON.stringify({
          mode,
          amount: amountNum,
          beneficiaryName,
          accountNumber: isUpi ? undefined : accountNumber,
          confirmAccountNumber: isUpi ? undefined : confirmAccountNumber,
          ifsc: isUpi ? undefined : ifsc,
          vpa: isUpi ? vpa : undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const fieldErrors = json.error?.fieldErrors as Record<string, string[]> | undefined;
        const firstField = fieldErrors ? Object.values(fieldErrors)[0]?.[0] : undefined;
        const msg =
          typeof json.error === "string"
            ? json.error
            : (json.error?.formErrors?.[0] as string | undefined) ??
              firstField ??
              "Failed to submit payout";
        throw new Error(msg);
      }
      idemKey.current = crypto.randomUUID();
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/60 to-white p-5"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label>Transfer mode</Label>
          <Select value={mode} onChange={(e) => setMode(e.target.value as PayoutMode)}>
            <option value="IMPS">IMPS (instant)</option>
            <option value="NEFT">NEFT</option>
            <option value="RTGS">RTGS</option>
            <option value="UPI">UPI</option>
          </Select>
        </div>
        <div>
          <Label>Amount to beneficiary (₹)</Label>
          <Input
            type="number"
            required
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <Label>Beneficiary name</Label>
          <Input
            required
            value={beneficiaryName}
            onChange={(e) => setBeneficiaryName(e.target.value)}
            placeholder="As per bank records"
          />
        </div>

        {isUpi ? (
          <div className="md:col-span-3">
            <Label>UPI ID</Label>
            <Input
              required
              value={vpa}
              onChange={(e) => setVpa(e.target.value.trim())}
              placeholder="name@bank"
            />
          </div>
        ) : (
          <>
            <div>
              <Label>Account number</Label>
              <Input
                required
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="9–18 digits"
              />
            </div>
            <div>
              <Label>Confirm account number</Label>
              <Input
                required
                inputMode="numeric"
                value={confirmAccountNumber}
                onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="Re-enter account number"
              />
            </div>
            <div>
              <Label>IFSC</Label>
              <Input
                required
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                placeholder="HDFC0001234"
                maxLength={11}
              />
            </div>
          </>
        )}
      </div>

      {/* Live charge preview */}
      <div className="mt-4 rounded-xl border border-ink-100 bg-white/70 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-600">Beneficiary receives</span>
          <span className="font-semibold text-ink-900">{inr2(amountNum)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-ink-600">Service charge</span>
          <span className="text-ink-800">{quote ? inr2(quote.serviceCharge) : "—"}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-ink-600">GST{quote ? ` (${quote.gstPercent}%)` : ""}</span>
          <span className="text-ink-800">{quote ? inr2(quote.gst) : "—"}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2 text-sm">
          <span className="font-semibold text-ink-900">
            Total debit{quoting && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
          </span>
          <span className="font-display text-lg font-bold text-brand-700">
            {quote ? inr2(quote.totalDebit) : "—"}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-ink-500">
          Spendable balance: {inr2(spendable)} · Funds are held on submit and debited only after the
          payout settles.
        </p>
      </div>

      {(error || insufficient) && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error ?? "Total debit exceeds your spendable balance."}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || insufficient || !quote}>
          <Send className="h-4 w-4" />
          {submitting ? "Submitting…" : "Submit for approval"}
        </Button>
      </div>
    </form>
  );
}
