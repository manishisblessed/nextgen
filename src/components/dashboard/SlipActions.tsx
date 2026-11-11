"use client";

/**
 * SlipActions
 * ─────────────────────────────────────────────────────────────────────
 * A compact "View Slip" + "Download" button pair for any transaction row.
 *
 * Props:
 *   type  — "txn" | "pos" | "qr" | "payout"
 *   id    — the record identifier (refId / transactionRef / claim id / payout id)
 *
 * Clicking "View" opens the slip HTML in a new tab.
 * Clicking "Download" does the same (the slip has a print button for PDF).
 *
 * No fetching happens until the user clicks — zero cost at render time.
 */

import { Eye, Printer } from "lucide-react";
import { useCallback } from "react";

type SlipType = "txn" | "pos" | "qr" | "payout";

function slipUrl(type: SlipType, id: string): string {
  return `/api/slip?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
}

function openSlip(type: SlipType, id: string): void {
  const url = slipUrl(type, id);
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    // Fallback if popup blocked
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }
}

/**
 * Compact inline pair — "View" + "Print" icon buttons.
 * Designed to fit inside a DataTable action cell.
 */
export function SlipActions({
  type,
  id,
  className = "",
}: {
  type: SlipType;
  id: string;
  className?: string;
}) {
  const handleView = useCallback(() => openSlip(type, id), [type, id]);
  const handlePrint = useCallback(() => openSlip(type, id), [type, id]); // same page, user prints there

  if (!id) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        title="View slip"
        onClick={handleView}
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] font-semibold text-ink-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
      >
        <Eye className="h-3 w-3" />
        Slip
      </button>
      <button
        type="button"
        title="Download / Print slip"
        onClick={handlePrint}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
      >
        <Printer className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * Full-width slip button — used inside a modal or a detail panel.
 */
export function SlipButton({
  type,
  id,
  label = "View / Download Slip",
}: {
  type: SlipType;
  id: string;
  label?: string;
}) {
  const handleClick = useCallback(() => openSlip(type, id), [type, id]);

  if (!id) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
