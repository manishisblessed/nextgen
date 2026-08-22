import { prisma } from "@/lib/db";
import { handlePosCapture } from "@/lib/settlement/pos";
import { upsertMirrorFromWebhook } from "@/lib/pos/mirror";
import { toNumber } from "@/lib/money";

/**
 * Manual POS slip lifecycle — the no-API (e.g. Yes Bank) acquirer flow.
 *
 * Acquirers without a capture webhook/API can't feed the automatic POS pipeline
 * (webhook/sweep → mirror → settlement). Instead the retailer uploads the
 * physical slip for a terminal ASSIGNED to them, and an admin verifies it. This
 * module owns the two admin actions and the ONE integration point that splices a
 * verified slip back into the SHARED settlement engine so payin, MDR pricing,
 * instant/T+1 settlement, commission and 2% TDS all behave exactly like an
 * API-sourced capture.
 */

/** File formats the retailer may upload as slip evidence. */
export const MANUAL_SLIP_FORMATS = ["jpg", "jpeg", "png", "pdf"] as const;
/** data: URL prefixes accepted for those formats. */
export const MANUAL_SLIP_DATAURL_RE =
  /^data:(image\/(png|jpe?g)|application\/pdf);base64,/;

/** Canonical settlement/mirror key for a slip — shared by mirror + settlement. */
export function manualSlipRef(tid: string, slipId: string): string {
  return `MPOS:${tid}:${slipId}`;
}

export class ManualSlipError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "ManualSlipError";
  }
}

export type ManualSlipStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * Approve a PENDING slip (any admin — no second approval needed).
 *
 * Ordering is deliberate so nothing dangling is ever left behind on failure:
 *   1. handlePosCapture() prices MDR off the terminal's brand rate card (or the
 *      retailer's scheme) and creates the PENDING PosSettlementEntry. It does
 *      NOT move money or touch payin. If the capture can't be priced/settled
 *      (NO_SCHEME / SKIPPED) we abort BEFORE creating any display/payin state so
 *      the admin can fix the rate and re-approve.
 *   2. Only once the money side exists do we upsert the CAPTURED mirror row so
 *      the txn appears in POS Fleet and the company payin book is credited —
 *      matching the automatic flow's "payin at mirror ingest" contract.
 *   3. Stamp the slip APPROVED with its transactionRef + settlement entry id.
 */
export async function approveManualSlip(slipId: string, adminId: string) {
  const slip = await prisma.posManualSlip.findUnique({ where: { id: slipId } });
  if (!slip) throw new ManualSlipError("Slip not found", 404);
  if (slip.status !== "PENDING")
    throw new ManualSlipError(`Slip already ${slip.status.toLowerCase()}`, 409);

  // Re-validate the terminal is STILL assigned to the uploader and active — the
  // assignment could have been recalled between upload and review.
  const machine = await prisma.posMachine.findUnique({
    where: { id: slip.machineId },
    select: { tid: true, assignedUserId: true, status: true, brandId: true },
  });
  if (!machine || machine.assignedUserId !== slip.uploaderUserId)
    throw new ManualSlipError(
      "This terminal is no longer assigned to the retailer — reject the slip instead.",
      409
    );

  const transactionRef = manualSlipRef(slip.tid, slip.id);
  const grossAmount = toNumber(slip.grossAmount);
  const paymentMode = slip.paymentMode ?? "CARD";
  const capturedAt = slip.txnTime ?? new Date();

  // 1) Price + create the settlement entry via the SHARED engine. Pass the
  // EXACT machineId (not just the TID) — PosMachine.tid is not unique, so a
  // TID-only lookup could bind the capture to a different machine/retailer.
  const capture = await handlePosCapture({
    transactionRef,
    machineId: slip.machineId,
    terminalId: slip.tid,
    grossAmount,
    paymentMode,
    cardType: slip.cardType ?? undefined,
    brandType: slip.brandType ?? undefined,
    capturedAt,
  });

  if (capture.status === "NO_SCHEME")
    throw new ManualSlipError(
      "Can't price this terminal yet — add a brand MDR rate (or assign the retailer a scheme) for it, then approve again.",
      422
    );
  if (capture.status === "SKIPPED")
    throw new ManualSlipError(
      "Capture not settleable (retailer inactive or amount resolves to zero net).",
      422
    );

  // 2) Surface it in POS Fleet + credit company payin (first CAPTURED).
  await upsertMirrorFromWebhook({
    transactionRef,
    terminalId: slip.tid,
    grossAmount,
    paymentMode,
    status: "CAPTURED",
    rrn: slip.rrn,
    authCode: slip.authCode,
    cardType: slip.cardType,
    cardBrand: slip.brandType,
    txnTime: capturedAt,
    source: "MANUAL",
    raw: { source: "MANUAL_SLIP", slipId: slip.id },
  });

  // 3) Link the slip to what it became.
  const entry = await prisma.posSettlementEntry.findUnique({
    where: { transactionRef },
    select: { id: true },
  });
  const updated = await prisma.posManualSlip.update({
    where: { id: slip.id },
    data: {
      status: "APPROVED",
      transactionRef,
      settlementEntryId: entry?.id ?? null,
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectionReason: null,
    },
  });

  await auditManualSlip(adminId, "pos.manual_slip.approve", slip.id, {
    transactionRef,
    captureStatus: capture.status,
    grossAmount,
    netAmount: capture.netAmount ?? null,
    settlementEntryId: entry?.id ?? null,
  });

  return { slip: updated, capture };
}

/** Reject a PENDING slip with a reason shown to the retailer for re-upload. */
export async function rejectManualSlip(slipId: string, adminId: string, reason: string) {
  const trimmed = reason.trim();
  if (!trimmed) throw new ManualSlipError("A rejection reason is required.", 400);

  const slip = await prisma.posManualSlip.findUnique({ where: { id: slipId } });
  if (!slip) throw new ManualSlipError("Slip not found", 404);
  if (slip.status !== "PENDING")
    throw new ManualSlipError(`Slip already ${slip.status.toLowerCase()}`, 409);

  const updated = await prisma.posManualSlip.update({
    where: { id: slip.id },
    data: {
      status: "REJECTED",
      rejectionReason: trimmed,
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  });

  await auditManualSlip(adminId, "pos.manual_slip.reject", slip.id, { reason: trimmed });

  return { slip: updated };
}

async function auditManualSlip(
  adminId: string,
  action: string,
  entityId: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { userId: adminId, action, entity: "PosManualSlip", entityId, meta: meta as never },
    });
  } catch {
    // Audit is best-effort — never fail the review on a log write.
  }
}
