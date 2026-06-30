import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyBulkpeWebhook } from "@/lib/partners/bulkpe";
import {
  finalizePayoutSuccess,
  finalizePayoutFailure,
  reversePayout,
} from "@/lib/payout/service";

/**
 * BulkPe payout webhook. Verifies the HMAC signature, then reconciles the
 * referenced PayoutRequest to its terminal ledger state. Idempotent: duplicate
 * deliveries are no-ops thanks to the conditional state claims in the service.
 *
 * We never trust the body before signature verification, and we always read the
 * RAW body (not the parsed object) so the HMAC matches byte-for-byte.
 */
export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-bulkpe-signature") ||
    req.headers.get("x-webhook-signature") ||
    req.headers.get("signature");

  if (!verifyBulkpeWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // BulkPe may nest the txn under `data`; support both flat and nested shapes.
  const data = (payload.data && typeof payload.data === "object"
    ? (payload.data as Record<string, unknown>)
    : payload) as Record<string, unknown>;

  const referenceId = pick(data, ["reference_id", "referenceId"]);
  const txnId = pick(data, ["transcation_id", "transaction_id", "txnId"]);
  const utr = pick(data, ["utr", "rrn"]);
  const statusRaw = (pick(data, ["status", "state"]) || "").toUpperCase();

  const row = await prisma.payoutRequest.findFirst({
    where: {
      OR: [
        ...(referenceId ? [{ bulkpeReferenceId: referenceId }] : []),
        ...(txnId ? [{ bulkpeTxnId: txnId }] : []),
      ],
    },
    select: { id: true },
  });

  // Acknowledge unknown references with 200 so BulkPe stops retrying a payload
  // we can't act on (avoids an infinite retry loop on stray events).
  if (!row) return NextResponse.json({ ok: true, matched: false });

  await prisma.auditLog.create({
    data: {
      action: "payout.webhook",
      entity: "PayoutRequest",
      entityId: row.id,
      meta: { status: statusRaw, utr: utr ?? null, txnId: txnId ?? null },
    },
  });

  if (["SUCCESS", "COMPLETED", "PAID"].includes(statusRaw)) {
    await finalizePayoutSuccess(row.id, { utr, bulkpeTxnId: txnId, response: payload });
  } else if (["REVERSED", "RETURNED"].includes(statusRaw)) {
    // Could be pre- or post-settlement; try reversal first, then failure.
    const r = await reversePayout(row.id, { response: payload, reason: `Webhook: ${statusRaw}` });
    if (!r.reversed) {
      await finalizePayoutFailure(row.id, { failureReason: `Webhook: ${statusRaw}`, response: payload });
    }
  } else if (["FAILED", "CANCELLED"].includes(statusRaw)) {
    await finalizePayoutFailure(row.id, { failureReason: `Webhook: ${statusRaw}`, response: payload });
  }
  // PROCESSING / INITIATED / unknown → no terminal action.

  return NextResponse.json({ ok: true, matched: true });
}
