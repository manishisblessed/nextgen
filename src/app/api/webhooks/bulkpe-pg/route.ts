import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyBulkpeWebhook } from "@/lib/partners/bulkpe";
import { settleTopup } from "@/lib/wallet/topup";

/**
 * BulkPe Simple PG (collect) webhook — wallet top-up auto-credit.
 *
 * Configure in the BulkPe dashboard alongside the payout webhook:
 *   URL    : https://app.jmpnextgenpay.com/api/webhooks/bulkpe-pg
 *   Secret : BULKPE_WEBHOOK_SECRET (env)
 *
 * Defense in depth: the webhook body is only used to LOCATE our transaction
 * (referenceId). The actual settlement re-verifies the payment state with
 * BulkPe via pg1CheckTxnStatus before any wallet credit — so even a replayed
 * or forged-but-signed payload cannot mint money.
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

  const data = (payload.data && typeof payload.data === "object"
    ? (payload.data as Record<string, unknown>)
    : payload) as Record<string, unknown>;

  const referenceId = pick(data, ["referenceId", "reference_id"]);

  // Only top-up references are ours to settle; acknowledge everything else so
  // BulkPe stops retrying payloads we cannot act on.
  if (!referenceId || !referenceId.startsWith("TOPUP")) {
    return NextResponse.json({ ok: true, matched: false });
  }

  await prisma.auditLog.create({
    data: {
      action: "webhook.bulkpe_pg",
      entity: "Transaction",
      entityId: referenceId,
      meta: { status: pick(data, ["status", "state"]) ?? null },
    },
  });

  try {
    const result = await settleTopup(referenceId);
    return NextResponse.json({ ok: true, matched: true, status: result.status });
  } catch {
    // Unknown reference or provider hiccup — acknowledge; the user-facing
    // status poll and recon will converge the state.
    return NextResponse.json({ ok: true, matched: false });
  }
}
