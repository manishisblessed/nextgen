"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  TransactionResult,
  type TxnResult,
} from "@/components/dashboard/TransactionResult";
import { TxnPinDialog } from "@/components/security/TxnPinDialog";
import { generateRefId, formatINR } from "@/lib/utils";

type Operator = {
  operatorId: string;
  operatorName: string;
  operatorCode: string;
  serviceName?: string;
};

/** Canonical IFSC: 4 letters, a 0, then 6 alphanumerics (e.g. ICIC0001234). */
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Transfer types accepted by the RechargeKit CC payment API. */
const TRANSFER_TYPES = [
  { value: "5", label: "IMPS (instant)" },
  { value: "6", label: "NEFT" },
] as const;

type ChargeQuote = {
  serviceCharge: number;
  gst: number;
  totalCharge: number;
  totalDebit: number;
  commission: number;
};

export function RechargekitDirectCCForm() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorCode, setOperatorCode] = useState("");
  const [loadingOps, setLoadingOps] = useState(true);

  const [mobile, setMobile] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [amount, setAmount] = useState("");
  const [transferType, setTransferType] = useState<string>("5");

  const [quote, setQuote] = useState<ChargeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [result, setResult] = useState<TxnResult>(null);

  const loadOperators = useCallback(async (refresh = false) => {
    setLoadingOps(true);
    try {
      const url = `/api/services/rechargekit-direct/operators${refresh ? "?refresh=true" : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && Array.isArray(data.operators)) {
        setOperators(data.operators);
        if (data.operators[0] && !refresh) {
          setOperatorCode(data.operators[0].operatorCode);
        }
      } else {
        setError(data.error ?? "Could not load operators");
      }
    } catch {
      setError("Could not load operators — check your connection");
    } finally {
      setLoadingOps(false);
    }
  }, []);

  useEffect(() => {
    loadOperators();
  }, [loadOperators]);

  const selectedOp = useMemo(
    () => operators.find((o) => o.operatorCode === operatorCode) ?? null,
    [operators, operatorCode]
  );

  // The direct operator list carries no IFSC, so we pre-fill the bank name from
  // the selected operator (still editable) and always collect the IFSC manually.
  useEffect(() => {
    if (!selectedOp) return;
    setBankName(selectedOp.operatorName);
  }, [selectedOp]);

  const inputsValid = useMemo(
    () =>
      /^\d{10}$/.test(mobile) &&
      /^\d{13,19}$/.test(cardNumber) &&
      IFSC_RE.test(ifsc) &&
      bankName.length >= 2 &&
      beneficiaryName.length >= 2 &&
      operatorCode.length > 0 &&
      (transferType === "5" || transferType === "6") &&
      Number(amount) > 0,
    [mobile, cardNumber, ifsc, bankName, beneficiaryName, operatorCode, transferType, amount]
  );

  // Fetch charges when amount changes
  useEffect(() => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const res = await fetch("/api/services/rechargekit-direct/charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt }),
        });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setQuote({
            serviceCharge: data.serviceCharge,
            gst: data.gst,
            totalCharge: data.totalCharge,
            totalDebit: data.totalDebit,
            commission: data.commission,
          });
        }
      } catch {
        /* swallow */
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [amount]);

  function resetForm() {
    setCardNumber("");
    setMobile("");
    setIfsc("");
    setBeneficiaryName("");
    setAmount("");
    setQuote(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputsValid) return;
    setError(null);
    setProcessing(null);
    setPinOpen(true);
  }

  async function payWithPin(pin: string): Promise<string | null> {
    setPaying(true);
    try {
      const res = await fetch("/api/services/rechargekit-direct/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-txn-pin": pin },
        body: JSON.stringify({
          mobileNo: mobile,
          accountNo: cardNumber,
          ifsc,
          bankName,
          beneficiaryName,
          amount: Number(amount),
          transferType,
          operatorCode,
          idempotencyKey: generateRefId("RKOD"),
        }),
      });
      const data = await res.json();

      if (data.txnPin) {
        return typeof data.error === "string"
          ? data.error
          : "PIN verification failed";
      }

      if (data.status === "PROCESSING") {
        setPinOpen(false);
        setProcessing(
          "Payment is being processed. Check your transaction history for the final status — do NOT re-submit."
        );
        resetForm();
        return null;
      }

      if (!res.ok || data.status !== "SUCCESS") {
        setPinOpen(false);
        const msg =
          typeof data.error === "string"
            ? data.error
            : "Payment failed — any debited amount is auto-refunded to your wallet";

        if (data.code === "INSUFFICIENT_BALANCE") {
          setError(
            `Insufficient wallet balance. Required: ${formatINR(data.required_amount ?? 0)}, Available: ${formatINR(data.wallet_balance ?? 0)}`
          );
        } else {
          setError(msg);
        }
        return null;
      }

      setPinOpen(false);
      setResult({
        refId: data.refId,
        service: `Offline CC Bill Payment — ${bankName}`,
        amount: Number(amount),
        customer: beneficiaryName,
        meta: {
          "Card ending": cardNumber.slice(-4),
          "Transfer type": transferType === "5" ? "IMPS" : "NEFT",
          ...(data.data?.operatorReference
            ? { "Operator ref": data.data.operatorReference }
            : {}),
          ...(data.data?.orderId ? { "Order ID": data.data.orderId } : {}),
        },
      });
      resetForm();
      return null;
    } catch {
      setPinOpen(false);
      // Network error — DO NOT retry pay. Check transaction history.
      setError(
        "Network error — check your transaction history before retrying. Do NOT re-submit the payment."
      );
      return null;
    } finally {
      setPaying(false);
    }
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-2xl border border-ink-100 bg-white p-6 sm:grid-cols-2"
      >
        {/* Operator selector */}
        <div className="sm:col-span-2">
          <Label htmlFor="operator">Card issuer / Bank</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Select
                id="operator"
                value={operatorCode}
                onChange={(e) => setOperatorCode(e.target.value)}
                disabled={loadingOps}
              >
                {loadingOps && <option value="">Loading operators…</option>}
                {operators.map((op) => (
                  <option key={op.operatorCode} value={op.operatorCode}>
                    {op.operatorName}
                  </option>
                ))}
              </Select>
            </div>
            <button
              type="button"
              onClick={() => loadOperators(true)}
              disabled={loadingOps}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink-200 text-ink-500 transition hover:bg-ink-50 hover:text-ink-700 disabled:opacity-50"
              title="Refresh operator list"
            >
              <RefreshCw className={`h-4 w-4 ${loadingOps ? "animate-spin" : ""}`} />
            </button>
          </div>
          {!loadingOps && operators.length > 0 && (
            <p className="mt-1 text-[11px] text-ink-400">
              {operators.length} operators available
            </p>
          )}
        </div>

        {/* Card number (full 16-digit) */}
        <div className="sm:col-span-2">
          <Label htmlFor="cardNumber">Credit card number (full)</Label>
          <Input
            id="cardNumber"
            required
            inputMode="numeric"
            maxLength={19}
            placeholder="Enter full 16-digit card number"
            value={cardNumber}
            onChange={(e) =>
              setCardNumber(e.target.value.replace(/\D/g, "").slice(0, 19))
            }
          />
          <p className="mt-1 text-[11px] text-ink-400">
            Your card number is sent securely and never stored
          </p>
        </div>

        {/* Mobile */}
        <div>
          <Label htmlFor="mobile">Registered mobile number</Label>
          <Input
            id="mobile"
            required
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit mobile"
            value={mobile}
            onChange={(e) =>
              setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
            }
          />
        </div>

        {/* IFSC — always collected manually for the direct rail. */}
        <div>
          <Label htmlFor="ifsc">Card IFSC code</Label>
          <Input
            id="ifsc"
            required
            placeholder="e.g. ICIC0000001"
            value={ifsc}
            onChange={(e) => setIfsc(e.target.value.toUpperCase().slice(0, 11))}
          />
          {ifsc.length > 0 && !IFSC_RE.test(ifsc) && (
            <p className="mt-1 text-[11px] text-rose-600">
              Enter a valid IFSC (format: ICIC0001234).
            </p>
          )}
        </div>

        {/* Bank name — pre-filled from operator, editable. */}
        <div>
          <Label htmlFor="bankName">Bank name</Label>
          <Input
            id="bankName"
            required
            placeholder="Bank name"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />
        </div>

        {/* Transfer type */}
        <div>
          <Label htmlFor="transferType">Transfer type</Label>
          <Select
            id="transferType"
            value={transferType}
            onChange={(e) => setTransferType(e.target.value)}
          >
            {TRANSFER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>

        {/* Beneficiary name */}
        <div className="sm:col-span-2">
          <Label htmlFor="beneficiaryName">Cardholder name</Label>
          <Input
            id="beneficiaryName"
            required
            placeholder="Name as printed on the card"
            value={beneficiaryName}
            onChange={(e) => setBeneficiaryName(e.target.value)}
          />
        </div>

        {/* Amount */}
        <div className="sm:col-span-2">
          <Label htmlFor="amount">Amount to pay (₹)</Label>
          <Input
            id="amount"
            required
            type="number"
            min={1}
            max={500000}
            placeholder="Enter amount in rupees"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {/* Charge preview */}
        {quote && Number(amount) > 0 && (
          <div className="sm:col-span-2 rounded-xl border border-ink-200 bg-ink-50/50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-600">Payment amount</span>
              <span className="font-medium text-ink-900">
                {formatINR(Number(amount))}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-ink-600">Service charge</span>
              <span className="font-medium text-ink-900">
                {formatINR(quote.serviceCharge)}
              </span>
            </div>
            {quote.gst > 0 && (
              <div className="mt-1 flex justify-between">
                <span className="text-ink-600">GST (18%)</span>
                <span className="font-medium text-ink-900">
                  {formatINR(quote.gst)}
                </span>
              </div>
            )}
            <hr className="my-2 border-ink-200" />
            <div className="flex justify-between font-semibold">
              <span className="text-ink-700">Total debit from wallet</span>
              <span className="text-ink-900">{formatINR(quote.totalDebit)}</span>
            </div>
            {quote.commission > 0 && (
              <p className="mt-2 text-xs text-emerald-600">
                Commission earned: {formatINR(quote.commission)} (net of 2% TDS)
              </p>
            )}
          </div>
        )}
        {quoteLoading && Number(amount) > 0 && (
          <p className="sm:col-span-2 text-center text-xs text-ink-400 animate-pulse">
            Calculating charges…
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Processing notice (pending, no status endpoint to poll) */}
        {processing && (
          <div className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            <span>{processing}</span>
          </div>
        )}

        {/* Submit */}
        <div className="sm:col-span-2">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={paying || !inputsValid}
            isLoading={paying}
          >
            Pay{" "}
            {quote
              ? formatINR(quote.totalDebit)
              : amount
                ? formatINR(Number(amount))
                : "credit card"}
          </Button>
          <p className="mt-2 text-center text-[11px] text-ink-400">
            Confirmed with your transaction PIN. Debited from your wallet —
            failed payments are auto-refunded.
          </p>
        </div>
      </form>

      <TxnPinDialog
        open={pinOpen}
        title="Pay credit card"
        detail={`${bankName} · Card ****${cardNumber.slice(-4)}`}
        amount={Number(amount) || undefined}
        busy={paying}
        onConfirm={payWithPin}
        onCancel={() => !paying && setPinOpen(false)}
      />
      <TransactionResult result={result} onClose={() => setResult(null)} />
    </>
  );
}
