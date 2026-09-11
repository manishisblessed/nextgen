"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, LifeBuoy, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Input";

export type RaiseTicketPayload = {
  /** Real Transaction.refId this ticket is about (validated server-side). */
  txnRefId: string;
  /** Auto-generated subject line. */
  subject: string;
  /** Human-readable transaction details, auto-filled from the report row. */
  detailsText: string;
  /** Dispute category — transaction reports use TRANSACTION. */
  category?: string;
};

type Props = {
  payload: RaiseTicketPayload | null;
  onClose: () => void;
};

/**
 * Raise-a-ticket modal launched from a report row. The transaction details are
 * pre-collected from the row (read-only preview) so the user only writes a short
 * remark. On submit it POSTs to /api/disputes with the details + remark stitched
 * into the description and the transaction linked via txnRefId.
 */
export function RaiseTicketModal({ payload, onClose }: Props) {
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ticketNo: string; id: string } | null>(null);

  // Reset local state whenever a new transaction is targeted.
  useEffect(() => {
    setRemark("");
    setError(null);
    setDone(null);
    setSubmitting(false);
  }, [payload?.txnRefId]);

  // Close on Escape.
  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payload, onClose]);

  if (!payload) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!payload) return;
    const note = remark.trim();
    if (!note) {
      setError("Add a short remark describing the problem.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const description = `${payload.detailsText}\n\nCustomer remark:\n${note}`;
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: payload.category ?? "TRANSACTION",
          subject: payload.subject.slice(0, 140),
          description: description.slice(0, 4000),
          txnRefId: payload.txnRefId,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof d.error === "string" ? d.error : "Could not raise the ticket — try again.");
        return;
      }
      setDone({ ticketNo: d.ticketNo, id: d.id });
    } catch {
      setError("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-100 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <LifeBuoy className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3 className="font-display text-base font-semibold text-ink-900">Raise a ticket</h3>
              <p className="text-xs text-ink-500">
                For transaction <span className="font-mono">{payload.txnRefId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="mt-3 font-display text-lg font-semibold text-ink-900">Ticket raised</p>
            <p className="mt-1 text-sm text-ink-600">
              Your ticket <span className="font-mono font-semibold">{done.ticketNo}</span> is with our
              support team. You can track replies from Support Tickets.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Link href="/dashboard/disputes">
                <Button variant="outline">
                  <ExternalLink className="h-4 w-4" /> View my tickets
                </Button>
              </Link>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-4">
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Auto-filled transaction details */}
            <div>
              <Label>Transaction details (auto-filled)</Label>
              <pre className="mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl border border-ink-100 bg-ink-50/60 p-3 font-sans text-xs leading-relaxed text-ink-700">
                {payload.detailsText}
              </pre>
              <p className="mt-1 text-[11px] text-ink-400">
                These details are attached automatically — you don&apos;t need to type them again.
              </p>
            </div>

            {/* User remark */}
            <div className="mt-4">
              <Label htmlFor="remark">Your remark</Label>
              <textarea
                id="remark"
                required
                minLength={3}
                maxLength={2000}
                rows={4}
                autoFocus
                className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                placeholder="Tell us what went wrong (e.g. amount debited but payment failed, no confirmation received)…"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" isLoading={submitting} disabled={submitting || !remark.trim()}>
                {submitting ? "Raising…" : "Raise ticket"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
