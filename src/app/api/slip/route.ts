/**
 * GET /api/slip?type=txn|pos|qr|payout&id=<id>
 *
 * Universal transaction-slip endpoint.
 * Returns a self-contained, print-ready HTML page for any transaction.
 *
 * Query params:
 *   type  — "txn"    : general Transaction (BBPS/Recharge/CC Bill/PG top-up)
 *           "pos"    : POS swipe (PosTransactionMirror or PosSettlementEntry)
 *           "qr"     : QR Claim (StaticQr + QrClaim)
 *           "payout" : Payout request (IMPS)
 *   id    — the record identifier (refId for txn, transactionRef for pos,
 *             claim id for qr, payout id for payout)
 */

import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { buildSlipHtml, type SlipData, type SlipField } from "@/lib/slip/builder";
import { isAdminRole } from "@/lib/security/ownership";

export const dynamic = "force-dynamic";

// ─── helpers ─────────────────────────────────────────────────────────────────

function htmlResponse(html: string) {
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function fmtINR(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function logoUrl(req: Request): string {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}/logo.svg`;
}

// ─── GET /api/slip ────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  // Auth — every role can view slips for their OWN records.
  let user: { id: string; role: string; name?: string | null; userCode?: string | null };
  try {
    user = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError)
      return err(e.message, e.statusCode);
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const id   = (searchParams.get("id") ?? "").trim();

  if (!type || !id) return err("Missing type or id");

  const isAdmin = isAdminRole(user.role);
  const logo    = logoUrl(req);

  // ── GENERAL TRANSACTION ─────────────────────────────────────────────────
  if (type === "txn") {
    const txn = await prisma.transaction.findUnique({
      where: { refId: id },
      include: { user: { select: { name: true, userCode: true } } },
    });

    if (!txn) return err("Transaction not found", 404);
    // Access control: only the owner or admin
    if (!isAdmin && txn.userId !== user.id)
      return err("You do not have permission to view this slip", 403);

    const svc = txn.service
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");

    const serviceLabel = txn.operator ? `${svc} — ${txn.operator}` : svc;

    const status: SlipData["status"] =
      txn.status === "SUCCESS"   ? "SUCCESS" :
      txn.status === "FAILED"    ? "FAILED" :
      txn.status === "REFUNDED"  ? "REFUNDED" :
      txn.status === "INITIATED" || txn.status === "PROCESSING" ? "PENDING" : "PENDING";

    const fields: SlipField[] = [
      { label: "Service", value: serviceLabel },
    ];
    if (txn.customer) fields.push({ label: "Customer / Mobile", value: txn.customer });
    if (txn.partnerTxnId) fields.push({ label: "Operator Ref", value: txn.partnerTxnId });
    if (toNumber(txn.fee) > 0) fields.push({ label: "Service Fee", value: fmtINR(toNumber(txn.fee)) });
    if (toNumber(txn.gst) > 0) fields.push({ label: "GST", value: fmtINR(toNumber(txn.gst)) });
    if (toNumber(txn.commission) > 0) fields.push({ label: "Commission Earned", value: fmtINR(toNumber(txn.commission)) });

    const slip: SlipData = {
      type: "txn",
      title: serviceLabel,
      subtitle: txn.partner ?? undefined,
      amount: toNumber(txn.amount),
      status,
      refId: txn.refId,
      retailerName: txn.user?.name ?? undefined,
      retailerCode: txn.user?.userCode ?? undefined,
      fields,
      note: status === "PENDING"
        ? "This transaction is being processed. Check back shortly. Do not retry to avoid duplicate charges."
        : status === "FAILED"
          ? "This transaction did not complete. If your wallet was debited please raise a dispute."
          : undefined,
      createdAt: txn.createdAt.toISOString(),
    };

    return htmlResponse(buildSlipHtml(slip, logo));
  }

  // ── POS TRANSACTION ─────────────────────────────────────────────────────
  if (type === "pos") {
    // Try PosTransactionMirror first (SameDay live feed)
    const mirror = await prisma.posTransactionMirror.findUnique({
      where: { transactionRef: id },
    });

    // Resolve the retailer via settlement entry (mirror doesn't store userId)
    const settlement = await prisma.posSettlementEntry.findUnique({
      where: { transactionRef: id },
      include: { user: { select: { id: true, name: true, userCode: true } } },
    });

    if (!mirror && !settlement) return err("POS transaction not found", 404);

    // Access control
    if (!isAdmin && settlement && settlement.userId !== user.id)
      return err("You do not have permission to view this slip", 403);
    // If there's no settlement entry, only admins can view (orphaned mirror)
    if (!isAdmin && !settlement)
      return err("You do not have permission to view this slip", 403);

    const gross   = mirror ? toNumber(mirror.amount) : toNumber(settlement!.grossAmount);
    const mdr     = settlement ? toNumber(settlement.mdrAmount) : null;
    const net     = settlement ? toNumber(settlement.netAmount) : null;
    const settled = settlement?.status === "SETTLED";

    const txnTime = mirror?.txnTime ?? settlement?.capturedAt ?? settlement?.createdAt ?? new Date();

    const fields: SlipField[] = [
      { label: "Terminal (TID)", value: mirror?.terminalId ?? settlement?.transactionRef ?? id },
      { label: "Payment Mode", value: mirror?.paymentMode ?? settlement?.paymentMode ?? "CARD" },
    ];
    if (mirror?.cardBrand || mirror?.cardType)
      fields.push({ label: "Card", value: [mirror?.cardBrand, mirror?.cardType].filter(Boolean).join(" ") });
    if (mirror?.cardNumber) fields.push({ label: "Card No.", value: mirror.cardNumber });
    if (mirror?.rrn || settlement) fields.push({ label: "RRN", value: mirror?.rrn ?? "—" });
    if (mirror?.authCode) fields.push({ label: "Auth Code", value: mirror.authCode });
    if (mirror?.customerName) fields.push({ label: "Customer", value: mirror.customerName });
    if (mdr !== null && mdr > 0) fields.push({ label: "MDR Deducted", value: fmtINR(mdr) });
    if (net !== null) fields.push({ label: "Net Credited", value: fmtINR(net) });
    if (settlement?.mode) fields.push({ label: "Settlement Mode", value: settlement.mode });
    if (settled && settlement?.settledAt)
      fields.push({ label: "Settled On", value: new Date(settlement.settledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) });

    const posStatus: SlipData["status"] =
      mirror?.status === "CAPTURED"  ? "CAPTURED"  :
      mirror?.status === "REFUNDED"  ? "REFUNDED"  :
      mirror?.status === "VOIDED"    ? "REVERSED"  :
      mirror?.status === "FAILED"    ? "FAILED"    :
      settlement?.status === "SETTLED" ? "SUCCESS" :
      settlement?.status === "REVERSED" ? "REVERSED" :
      "PENDING";

    const slip: SlipData = {
      type: "pos",
      title: "POS Transaction Slip",
      subtitle: `Terminal ${mirror?.terminalId ?? "—"} · ${mirror?.paymentMode ?? settlement?.paymentMode ?? "CARD"}`,
      amount: gross,
      status: posStatus,
      refId: id,
      retailerName: settlement?.user?.name ?? undefined,
      retailerCode: settlement?.user?.userCode ?? undefined,
      fields,
      createdAt: txnTime.toISOString(),
    };

    return htmlResponse(buildSlipHtml(slip, logo));
  }

  // ── QR TRANSACTION ───────────────────────────────────────────────────────
  if (type === "qr") {
    const claim = await prisma.qrClaim.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, userCode: true } },
        qr:   { select: { label: true, upiVpa: true, settlementKind: true } },
      },
    });

    if (!claim) return err("QR claim not found", 404);
    if (!isAdmin && claim.userId !== user.id)
      return err("You do not have permission to view this slip", 403);

    const gross = toNumber(claim.amount);
    const mdr   = claim.mdrAmount ? toNumber(claim.mdrAmount) : null;
    const net   = claim.netAmount ? toNumber(claim.netAmount) : null;

    const fields: SlipField[] = [
      { label: "Settlement Stream", value: claim.qr.settlementKind === "INSTANT" ? "QR-Instant" : "QR T+1" },
      { label: "QR Label", value: claim.qr.label },
    ];
    if (claim.utr)      fields.push({ label: "UPI UTR", value: claim.utr });
    if (claim.cardLast4) fields.push({ label: "Card Last 4", value: `**** ${claim.cardLast4}` });
    if (claim.paidAt)   fields.push({ label: "Paid At", value: new Date(claim.paidAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) });
    if (mdr !== null && mdr > 0) fields.push({ label: "MDR Deducted", value: fmtINR(mdr) });
    if (net !== null)            fields.push({ label: "Net Credited", value: fmtINR(net) });
    if (claim.settledVia)        fields.push({ label: "Settled Via", value: claim.settledVia.replace("_", " ") });
    if (claim.settledAt)
      fields.push({ label: "Settled On", value: new Date(claim.settledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) });
    if (claim.reviewNote)        fields.push({ label: "Admin Note", value: claim.reviewNote });

    const qrStatus: SlipData["status"] =
      claim.status === "SETTLED"                    ? "SUCCESS"    :
      claim.status === "APPROVED"                   ? "APPROVED"   :
      claim.status === "SETTLEABLE"                 ? "APPROVED"   :
      claim.status === "REJECTED"                   ? "FAILED"     :
      claim.status === "CLAWED_BACK"                ? "REVERSED"   :
      claim.status === "AWAITING_SECOND_APPROVAL"   ? "PROCESSING" :
      "PENDING";

    const slip: SlipData = {
      type: "qr",
      title: "QR Payment Slip",
      subtitle: claim.qr.settlementKind === "INSTANT" ? "QR-Instant Settlement" : "QR T+1 Settlement",
      amount: gross,
      status: qrStatus,
      refId: id,
      retailerName: claim.user?.name ?? undefined,
      retailerCode: claim.user?.userCode ?? undefined,
      fields,
      note: qrStatus === "PENDING"
        ? "Your QR claim is pending admin verification. You will be notified once it is processed."
        : qrStatus === "FAILED"
          ? `Claim was rejected. ${claim.reviewNote ? `Reason: ${claim.reviewNote}` : "Please re-upload a valid screenshot."}`
          : undefined,
      createdAt: claim.createdAt.toISOString(),
    };

    return htmlResponse(buildSlipHtml(slip, logo));
  }

  // ── PAYOUT TRANSACTION ───────────────────────────────────────────────────
  if (type === "payout") {
    const payout = await prisma.payoutRequest.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, userCode: true } } },
    });

    if (!payout) return err("Payout not found", 404);
    if (!isAdmin && payout.userId !== user.id)
      return err("You do not have permission to view this slip", 403);

    const fields: SlipField[] = [
      { label: "Beneficiary Name", value: payout.beneficiaryName },
      { label: "Account (Last 4)", value: `**** ${payout.accountLast4}` },
      { label: "Transfer Mode", value: payout.mode },
    ];
    if (payout.utr)           fields.push({ label: "Bank UTR", value: payout.utr });
    if (payout.bulkpeTxnId)   fields.push({ label: "Provider Txn ID", value: payout.bulkpeTxnId });
    if (toNumber(payout.serviceCharge) > 0)
      fields.push({ label: "Service Charge", value: fmtINR(toNumber(payout.serviceCharge)) });
    if (toNumber(payout.gst) > 0)
      fields.push({ label: "GST (18%)", value: fmtINR(toNumber(payout.gst)) });
    fields.push({ label: "Total Debited", value: fmtINR(toNumber(payout.totalDebit)) });
    if (payout.completedAt)
      fields.push({ label: "Completed At", value: new Date(payout.completedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) });
    if (payout.remarks) fields.push({ label: "Remarks", value: payout.remarks });
    if (payout.failureReason) fields.push({ label: "Failure Reason", value: payout.failureReason });

    const payStatus: SlipData["status"] =
      payout.status === "SUCCESS"  ? "SUCCESS"  :
      payout.status === "FAILED"   ? "FAILED"   :
      payout.status === "REJECTED" ? "FAILED"   :
      payout.status === "REVERSED" ? "REVERSED" :
      payout.status === "PROCESSING" || payout.status === "APPROVED" ? "PROCESSING" :
      "PENDING";

    const slip: SlipData = {
      type: "payout",
      title: "Payout — Money Transfer",
      subtitle: `${payout.mode} · ${payout.beneficiaryName}`,
      amount: toNumber(payout.amount),
      status: payStatus,
      refId: payout.id,
      retailerName: payout.user?.name ?? undefined,
      retailerCode: payout.user?.userCode ?? undefined,
      fields,
      note: payStatus === "FAILED"
        ? (payout.failureReason ? `Transfer failed: ${payout.failureReason}` : "Transfer failed. Please retry or contact support.")
        : payStatus === "PROCESSING"
          ? "This payout is being processed by the bank. UTR will be shown once the transfer completes."
          : undefined,
      createdAt: payout.createdAt.toISOString(),
    };

    return htmlResponse(buildSlipHtml(slip, logo));
  }

  return err("Unknown slip type. Valid types: txn, pos, qr, payout");
}
