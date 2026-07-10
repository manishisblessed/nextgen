"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { ReportActions } from "@/components/dashboard/ReportActions";
import { formatINR, generateRefId } from "@/lib/utils";
import { AlertCircle, Landmark, Plus, RefreshCw, Trash2 } from "lucide-react";

type SettlementRow = {
  id: string;
  cycle: string;
  counterparty: string;
  amount: number;
  txnCount: number;
  status: "Settled" | "In Bank" | "Reconciling";
  date: string;
};

type BankAccount = {
  id: string;
  accountNumber: string;
  ifscCode: string;
  accountHolderName: string;
  isVerified: boolean;
  verifiedName?: string;
};

type TransferRow = {
  id: string;
  referenceId: string;
  utr?: string;
  amount: number;
  charges?: number;
  totalDebited?: number;
  mode?: string;
  status: "SUCCESS" | "PENDING" | "FAILED";
  accountNumber?: string;
  accountHolderName?: string;
  createdAt?: string;
};

type ChargePreview = {
  amount: number;
  mode: string;
  schemeName: string;
  charges: number;
  gstAmount: number;
  totalCharge: number;
  totalDebit: number;
};

// ---------------------------------------------------------------------------
// Tab 1 — derived T+1 cycles (unchanged behaviour)
// ---------------------------------------------------------------------------

function CyclesTab() {
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settlements");
      const data = await res.json();
      if (data.settlements) setSettlements(data.settlements);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettlements(); }, [fetchSettlements]);

  const cols: Column<SettlementRow>[] = [
    { key: "id", header: "Cycle ID", render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "cycle", header: "Cycle" },
    { key: "counterparty", header: "Counterparty" },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
    { key: "txnCount", header: "Txns", align: "right", render: (r) => r.txnCount.toLocaleString("en-IN") },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "Settled" ? "success" : r.status === "In Bank" ? "brand" : "warning"}>
          {r.status}
        </Badge>
      ),
    },
    { key: "date", header: "Date" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <ReportActions
          filename="settlements"
          title="JMP NextGenPay · Settlements"
          subtitle="T+1 nodal settlements ledger"
          columns={[
            { key: "id", header: "Cycle ID" },
            { key: "cycle", header: "Cycle" },
            { key: "counterparty", header: "Counterparty" },
            { key: "amount", header: "Amount (INR)" },
            { key: "txnCount", header: "Transactions" },
            { key: "status", header: "Status" },
            { key: "date", header: "Date" },
          ]}
          rows={settlements}
        />
        <Button variant="outline" onClick={fetchSettlements} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <DataTable
        title={loading ? "Loading..." : "Recent cycles"}
        columns={cols}
        data={settlements}
        empty="No settlement data yet."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — live bank transfers via the Same Day Settlement API
// ---------------------------------------------------------------------------

function BankTransfersTab() {
  const [configured, setConfigured] = useState(true);
  const [balance, setBalance] = useState<{ balance: number; isFrozen: boolean } | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Add-account form
  const [showAdd, setShowAdd] = useState(false);
  const [accForm, setAccForm] = useState({ accountNumber: "", ifscCode: "", accountHolderName: "" });
  const [addBusy, setAddBusy] = useState(false);

  // Transfer form
  const [transferForm, setTransferForm] = useState({ accountId: "", amount: "", mode: "IMPS", narration: "" });
  const [transferBusy, setTransferBusy] = useState(false);

  // Charge preview
  const [chargePreview, setChargePreview] = useState<ChargePreview | null>(null);
  const [chargeLoading, setChargeLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, accRes, listRes] = await Promise.all([
        fetch("/api/admin/settlement/status?balance=true"),
        fetch("/api/admin/settlement/accounts"),
        fetch("/api/admin/settlement/status?list=true&limit=20"),
      ]);
      if (balRes.status === 503) {
        setConfigured(false);
        return;
      }
      setConfigured(true);
      if (balRes.ok) setBalance(await balRes.json());
      if (accRes.ok) {
        const d = await accRes.json();
        setAccounts(d.accounts ?? []);
        setTransferForm((f) => (f.accountId ? f : { ...f, accountId: d.accounts?.[0]?.id ?? "" }));
      }
      if (listRes.ok) {
        const d = await listRes.json();
        setTransfers(d.transactions ?? []);
      }
    } catch {
      setError("Could not reach the settlement API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const amt = Number(transferForm.amount);
    if (!amt || amt <= 0) {
      setChargePreview(null);
      return;
    }
    setChargeLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/settlement/transfer?amount=${amt}&mode=${encodeURIComponent(transferForm.mode)}`
        );
        if (res.ok) {
          setChargePreview(await res.json());
        } else {
          setChargePreview(null);
        }
      } catch {
        setChargePreview(null);
      } finally {
        setChargeLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [transferForm.amount, transferForm.mode]);

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setAddBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/settlement/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accForm),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(typeof d.error === "string" ? d.error : "Account verification failed");
        return;
      }
      setNotice(
        d.verificationStatus === "SUCCESS"
          ? `Account verified — bank returned "${d.verifiedName ?? d.account.accountHolderName}" (₹4 verification charge applied).`
          : "Account added — penny-drop verification is pending. Refresh in a minute."
      );
      setShowAdd(false);
      setAccForm({ accountNumber: "", ifscCode: "", accountHolderName: "" });
      refresh();
    } catch {
      setError("Network error while adding the account.");
    } finally {
      setAddBusy(false);
    }
  }

  async function removeAccount(id: string) {
    if (!window.confirm("Deactivate this settlement account?")) return;
    setError(null);
    const res = await fetch(`/api/admin/settlement/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.error === "string" ? d.error : "Could not deactivate the account");
      return;
    }
    refresh();
  }

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(transferForm.amount);
    if (!transferForm.accountId || !amt || amt <= 0) return;
    const acc = accounts.find((a) => a.id === transferForm.accountId);
    const debitInfo = chargePreview
      ? ` — charges ${formatINR(chargePreview.totalCharge)}, total wallet debit ${formatINR(chargePreview.totalDebit)}`
      : "";
    if (
      !window.confirm(
        `Transfer ${formatINR(amt)} via ${transferForm.mode} to ${acc?.accountHolderName ?? "the selected account"} (${acc?.accountNumber ?? ""})${debitInfo}?`
      )
    )
      return;
    setTransferBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/settlement/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: transferForm.accountId,
          amount: amt,
          mode: transferForm.mode,
          narration: transferForm.narration || undefined,
          idempotencyKey: generateRefId("STLREQ"),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(typeof d.error === "string" ? d.error : "Transfer failed");
        return;
      }
      const t = d.transaction as TransferRow;
      setNotice(
        t.status === "SUCCESS"
          ? `Transfer successful${t.utr ? ` — UTR ${t.utr}` : ""}.`
          : `Transfer initiated (${t.status}) — reference ${t.referenceId}. Failed transfers auto-refund the partner wallet.`
      );
      setTransferForm((f) => ({ ...f, amount: "", narration: "" }));
      setChargePreview(null);
      refresh();
    } catch {
      setError("Network error — check the transfer list before retrying.");
    } finally {
      setTransferBusy(false);
    }
  }

  const transferCols: Column<TransferRow>[] = [
    { key: "referenceId", header: "Reference", render: (r) => <span className="font-mono text-xs">{r.referenceId}</span> },
    {
      key: "accountHolderName",
      header: "Beneficiary",
      render: (r) => (
        <div>
          <div className="font-medium">{r.accountHolderName ?? "—"}</div>
          <div className="text-xs text-ink-500">{r.accountNumber ?? ""}</div>
        </div>
      ),
    },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
    { key: "charges", header: "Charges", align: "right", render: (r) => <span className="text-xs text-ink-500">{r.charges != null ? formatINR(r.charges) : "—"}</span> },
    { key: "totalDebited", header: "Total Debit", align: "right", render: (r) => <span className="font-medium">{r.totalDebited != null ? formatINR(r.totalDebited) : "—"}</span> },
    { key: "mode", header: "Mode" },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "SUCCESS" ? "success" : r.status === "PENDING" ? "warning" : "danger"}>
          {r.status}
        </Badge>
      ),
    },
    { key: "utr", header: "UTR", render: (r) => <span className="font-mono text-xs">{r.utr ?? "—"}</span> },
    {
      key: "createdAt",
      header: "Date",
      render: (r) =>
        r.createdAt
          ? new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
          : "—",
    },
  ];

  if (!configured) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <p className="font-semibold">Settlement rail not configured</p>
        <p className="mt-1">
          Set <code className="rounded bg-amber-100 px-1">PARTNER_SETTLEMENT_ENABLED=&quot;true&quot;</code> and the{" "}
          <code className="rounded bg-amber-100 px-1">SAMEDAY_SETTLEMENT_API_KEY/SECRET</code> environment variables,
          have Same Day admin enable the Settlement toggle, and whitelist this server&apos;s IP.
        </p>
      </div>
    );
  }

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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Balance + accounts */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-ink-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">
                Partner wallet (Same Day)
              </p>
              <Button variant="outline" onClick={refresh} disabled={loading} className="h-8 px-2">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-ink-900">
              {balance ? formatINR(balance.balance) : loading ? "Loading…" : "—"}
            </p>
            {balance?.isFrozen && (
              <Badge variant="danger">Wallet frozen — contact Same Day admin</Badge>
            )}
          </div>

          <div className="rounded-2xl border border-ink-100 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-900">Verified accounts</p>
              <Button variant="outline" onClick={() => setShowAdd((s) => !s)} className="h-8 px-2">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {showAdd && (
              <form onSubmit={addAccount} className="mt-3 space-y-3 rounded-xl bg-ink-50/60 p-3">
                <div>
                  <Label htmlFor="acc-no">Account number</Label>
                  <Input
                    id="acc-no"
                    required
                    value={accForm.accountNumber}
                    onChange={(e) => setAccForm((f) => ({ ...f, accountNumber: e.target.value.replace(/\D/g, "") }))}
                  />
                </div>
                <div>
                  <Label htmlFor="acc-ifsc">IFSC</Label>
                  <Input
                    id="acc-ifsc"
                    required
                    placeholder="HDFC0003756"
                    value={accForm.ifscCode}
                    onChange={(e) => setAccForm((f) => ({ ...f, ifscCode: e.target.value.toUpperCase().trim() }))}
                  />
                </div>
                <div>
                  <Label htmlFor="acc-name">Account holder name</Label>
                  <Input
                    id="acc-name"
                    required
                    value={accForm.accountHolderName}
                    onChange={(e) => setAccForm((f) => ({ ...f, accountHolderName: e.target.value }))}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={addBusy}>
                  {addBusy ? "Verifying (penny drop)…" : "Add & verify (₹4)"}
                </Button>
              </form>
            )}

            <ul className="mt-3 space-y-2">
              {accounts.length === 0 && (
                <li className="text-xs text-ink-500">
                  {loading ? "Loading…" : "No verified accounts yet. Add one to enable transfers."}
                </li>
              )}
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-xl border border-ink-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {a.verifiedName || a.accountHolderName}
                    </p>
                    <p className="text-xs text-ink-500">
                      {a.accountNumber} · {a.ifscCode}
                    </p>
                    <Badge variant={a.isVerified ? "success" : "warning"}>
                      {a.isVerified ? "Verified" : "Pending verification"}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAccount(a.id)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Deactivate account"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Transfer form */}
        <div className="lg:col-span-2 rounded-2xl border border-ink-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Landmark className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900">New bank transfer</p>
              <p className="text-xs text-ink-500">
                Moves money from the Same Day partner wallet to a verified account. Failed transfers auto-refund.
              </p>
            </div>
          </div>

          <form onSubmit={submitTransfer} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="tr-acc">Beneficiary account</Label>
              <Select
                id="tr-acc"
                value={transferForm.accountId}
                onChange={(e) => setTransferForm((f) => ({ ...f, accountId: e.target.value }))}
              >
                {accounts.length === 0 && <option value="">No verified accounts</option>}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.verifiedName || a.accountHolderName) + " — " + a.accountNumber}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="tr-amt">Amount (₹)</Label>
              <Input
                id="tr-amt"
                type="number"
                required
                min={1}
                value={transferForm.amount}
                onChange={(e) => setTransferForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="tr-mode">Mode</Label>
              <Select
                id="tr-mode"
                value={transferForm.mode}
                onChange={(e) => setTransferForm((f) => ({ ...f, mode: e.target.value }))}
              >
                <option>IMPS</option>
                <option>NEFT</option>
                <option>RTGS</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="tr-note">Narration (optional)</Label>
              <Input
                id="tr-note"
                maxLength={120}
                value={transferForm.narration}
                onChange={(e) => setTransferForm((f) => ({ ...f, narration: e.target.value }))}
              />
            </div>
            {chargePreview && (
              <div className="sm:col-span-2 rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink-700">Charge breakdown</span>
                  {chargePreview.schemeName && (
                    <Badge variant="brand">{chargePreview.schemeName}</Badge>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-ink-600">
                  <span>Transfer amount</span>
                  <span className="text-right font-medium text-ink-900">{formatINR(chargePreview.amount)}</span>
                  <span>Service charge</span>
                  <span className="text-right">{formatINR(chargePreview.charges)}</span>
                  <span>GST (18%)</span>
                  <span className="text-right">{formatINR(chargePreview.gstAmount)}</span>
                  <span>Total charge</span>
                  <span className="text-right">{formatINR(chargePreview.totalCharge)}</span>
                  <span className="font-semibold text-ink-900">Total wallet debit</span>
                  <span className="text-right font-bold text-ink-900">{formatINR(chargePreview.totalDebit)}</span>
                </div>
              </div>
            )}
            {chargeLoading && !chargePreview && (
              <p className="sm:col-span-2 text-xs text-ink-400">Fetching charges…</p>
            )}

            <div className="sm:col-span-2">
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={transferBusy || !transferForm.accountId || !transferForm.amount}
              >
                {transferBusy
                  ? "Initiating transfer…"
                  : chargePreview
                    ? `Transfer ${formatINR(chargePreview.amount)} (total debit ${formatINR(chargePreview.totalDebit)})`
                    : `Transfer ${transferForm.amount ? formatINR(Number(transferForm.amount)) : ""}`}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <DataTable
        title={loading ? "Loading..." : "Recent bank transfers"}
        columns={transferCols}
        data={transfers}
        empty="No settlement transfers yet."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function AdminSettlementsPage() {
  const [tab, setTab] = useState<"transfers" | "cycles">("transfers");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Settlements"
        description="Live bank transfers from the Same Day partner wallet, plus derived T+1 settlement cycles."
      />

      <div className="flex gap-2">
        {(
          [
            { id: "transfers", label: "Bank transfers" },
            { id: "cycles", label: "T+1 cycles" },
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

      {tab === "transfers" ? <BankTransfersTab /> : <CyclesTab />}
    </div>
  );
}
