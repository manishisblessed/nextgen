/**
 * slip/builder.ts
 * ────────────────────────────────────────────────────────────────────
 * Universal transaction-slip HTML builder for NextGenPay.
 * Generates a beautiful, print-ready HTML receipt for every txn type:
 *   • General transactions (BBPS, Recharge, CC Bill, etc.)
 *   • POS transactions (SameDay / manual)
 *   • QR Claim settlements
 *   • Payout (IMPS) requests
 *   • Wallet top-ups / PG transactions
 *
 * The resulting HTML is self-contained (all styles inline, no CDN deps).
 * Open in a new tab → user can Ctrl+P / Save as PDF.
 */

export type SlipType = "txn" | "pos" | "qr" | "payout";

export type SlipField = { label: string; value: string };

export type SlipData = {
  type: SlipType;
  /** Accent colour for the header strip (hex or CSS color). */
  accent?: string;
  /** Human-readable title on the slip header */
  title: string;
  /** Short description under the title (service / mode) */
  subtitle?: string;
  /** Main amount */
  amount: number;
  /** ISO status string */
  status: "SUCCESS" | "PENDING" | "FAILED" | "PROCESSING" | "CAPTURED" | "APPROVED" | "REVERSED" | "REFUNDED";
  /** Unique reference / txn ID shown prominently */
  refId: string;
  /** The retailer / account holder name */
  retailerName?: string;
  /** Retailer code (e.g. RT0107) */
  retailerCode?: string;
  /** Key-value pairs shown in the body table */
  fields: SlipField[];
  /** Footer note */
  note?: string;
  /** When was the transaction created */
  createdAt?: string;
};

// ─── Palette helpers ────────────────────────────────────────────────────────

const STATUS_ACCENTS: Record<SlipData["status"], { bg: string; text: string; badge: string }> = {
  SUCCESS:    { bg: "linear-gradient(135deg,#059669,#047857)", text: "#fff", badge: "#d1fae5" },
  CAPTURED:   { bg: "linear-gradient(135deg,#059669,#047857)", text: "#fff", badge: "#d1fae5" },
  APPROVED:   { bg: "linear-gradient(135deg,#059669,#047857)", text: "#fff", badge: "#d1fae5" },
  PENDING:    { bg: "linear-gradient(135deg,#d97706,#b45309)", text: "#fff", badge: "#fef3c7" },
  PROCESSING: { bg: "linear-gradient(135deg,#2563eb,#1d4ed8)", text: "#fff", badge: "#dbeafe" },
  FAILED:     { bg: "linear-gradient(135deg,#dc2626,#b91c1c)", text: "#fff", badge: "#fee2e2" },
  REVERSED:   { bg: "linear-gradient(135deg,#7c3aed,#6d28d9)", text: "#fff", badge: "#ede9fe" },
  REFUNDED:   { bg: "linear-gradient(135deg,#7c3aed,#6d28d9)", text: "#fff", badge: "#ede9fe" },
};

const TYPE_ICONS: Record<SlipType, string> = {
  txn:    "💳",
  pos:    "🖥️",
  qr:     "📱",
  payout: "🏦",
};

/** Safe HTML-escape */
function he(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format INR */
function fmt(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export function buildSlipHtml(data: SlipData, logoUrl = ""): string {
  const accent = STATUS_ACCENTS[data.status] ?? STATUS_ACCENTS.PENDING;
  const icon = TYPE_ICONS[data.type];
  const now = data.createdAt
    ? new Date(data.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  const statusLabel =
    data.status === "CAPTURED" ? "Captured" :
    data.status === "APPROVED" ? "Approved" :
    data.status === "SUCCESS"  ? "Success" :
    data.status === "PENDING"  ? "Pending" :
    data.status === "PROCESSING" ? "Processing" :
    data.status === "FAILED"   ? "Failed" :
    data.status === "REVERSED" ? "Reversed" :
    data.status === "REFUNDED" ? "Refunded" : data.status;

  const logoHtml = logoUrl
    ? `<img src="${he(logoUrl)}" alt="NextGenPay" style="height:36px;width:auto;margin:0 auto;display:block">`
    : `<div style="font-weight:800;font-size:22px;color:#7c3aed;letter-spacing:-0.5px;text-align:center">NextGenPay</div>`;

  const fieldRows = data.fields
    .map(
      ({ label, value }) => `
      <tr>
        <td style="padding:8px 12px;color:#64748b;font-size:12px;font-weight:600;white-space:nowrap;vertical-align:top">${he(label)}</td>
        <td style="padding:8px 12px;color:#0f172a;font-size:12.5px;font-weight:600;text-align:right;word-break:break-word">${he(value)}</td>
      </tr>`
    )
    .join("");

  const retailerHtml =
    data.retailerName
      ? `<tr>
          <td style="padding:8px 12px;color:#64748b;font-size:12px;font-weight:600">Retailer</td>
          <td style="padding:8px 12px;color:#0f172a;font-size:12.5px;font-weight:600;text-align:right">
            ${he(data.retailerName)}
            ${data.retailerCode ? `<span style="margin-left:6px;font-size:11px;color:#7c3aed;font-weight:700">${he(data.retailerCode)}</span>` : ""}
          </td>
        </tr>`
      : "";

  const noteHtml = data.note
    ? `<div style="margin:0 0 16px;padding:10px 14px;background:#f8fafc;border-left:3px solid #7c3aed;border-radius:0 8px 8px 0;font-size:11.5px;color:#475569;line-height:1.5">${he(data.note)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Transaction Slip — ${he(data.refId)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 32px 16px 60px;
    }
    .slip {
      width: 100%;
      max-width: 440px;
      background: #fff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 4px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06);
    }
    .logo-bar {
      padding: 18px 24px 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .header {
      padding: 28px 24px 24px;
      text-align: center;
      color: #fff;
    }
    .header-icon {
      font-size: 28px;
      margin-bottom: 6px;
    }
    .header-status {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
      margin-bottom: 10px;
      text-transform: uppercase;
    }
    .header-title {
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header-subtitle {
      font-size: 11.5px;
      opacity: 0.85;
      margin-bottom: 14px;
    }
    .header-amount {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -1px;
      line-height: 1;
    }
    .ref-bar {
      background: rgba(255,255,255,0.15);
      border-radius: 10px;
      padding: 8px 14px;
      margin-top: 14px;
      font-size: 11.5px;
      font-family: 'Courier New', monospace;
      word-break: break-all;
      letter-spacing: 0.3px;
    }
    .ref-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      opacity: 0.75;
      margin-bottom: 2px;
    }
    .body {
      padding: 20px 0 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    tr + tr {
      border-top: 1px solid #f8fafc;
    }
    .divider {
      border-top: 1.5px dashed #e2e8f0;
      margin: 16px 12px;
    }
    .date-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px 18px;
      font-size: 11.5px;
      color: #94a3b8;
    }
    .footer {
      border-top: 1.5px dashed #e2e8f0;
      padding: 16px 24px 20px;
      text-align: center;
    }
    .footer-brand {
      font-size: 13px;
      font-weight: 700;
      color: #059669;
      margin-bottom: 4px;
    }
    .footer-legal {
      font-size: 10px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .actions {
      display: flex;
      gap: 10px;
      padding: 0 24px 24px;
      justify-content: center;
    }
    button {
      flex: 1;
      padding: 10px 0;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    .btn-print {
      background: #7c3aed;
      color: #fff;
    }
    .btn-close {
      background: #f1f5f9;
      color: #475569;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .slip { box-shadow: none; border-radius: 0; max-width: 100%; }
      .actions { display: none !important; }
      @page { margin: 12mm; }
    }
    @media (max-width: 480px) {
      body { padding: 0; }
      .slip { border-radius: 0; min-height: 100vh; }
    }
  </style>
</head>
<body>
  <div class="slip">
    <!-- Logo -->
    <div class="logo-bar">${logoHtml}</div>

    <!-- Coloured header -->
    <div class="header" style="background:${accent.bg}">
      <div class="header-icon">${icon}</div>
      <div class="header-status" style="background:rgba(255,255,255,0.25)">${statusLabel}</div>
      <div class="header-title">${he(data.title)}</div>
      ${data.subtitle ? `<div class="header-subtitle">${he(data.subtitle)}</div>` : ""}
      <div class="header-amount">${fmt(data.amount)}</div>
      <div class="ref-bar">
        <div class="ref-label">Reference ID</div>
        ${he(data.refId)}
      </div>
    </div>

    <!-- Body -->
    <div class="body">
      <table>
        ${retailerHtml}
        ${fieldRows}
      </table>

      <div class="divider"></div>
      <div class="date-row">
        <span>Date &amp; Time</span>
        <span style="color:#0f172a;font-weight:600">${now}</span>
      </div>
    </div>

    <!-- Note -->
    ${noteHtml ? `<div style="padding:0 12px 4px">${noteHtml}</div>` : ""}

    <!-- Footer -->
    <div class="footer">
      <div class="footer-brand">Pay by NextGenPay${data.retailerCode ? ` · ${he(data.retailerCode)}` : ""}</div>
      <div class="footer-legal">
        JMP NEXTGENPAY PRIVATE LIMITED · CIN: U66190GJ2025PTC170905<br>
        This is a system-generated receipt. For disputes contact support@nxtgpay.com
      </div>
    </div>

    <!-- Action buttons (hidden on print) -->
    <div class="actions">
      <button class="btn-print" onclick="window.print()">🖨️ Download / Print</button>
      <button class="btn-close" onclick="window.close()">✕ Close</button>
    </div>
  </div>
</body>
</html>`;
}
