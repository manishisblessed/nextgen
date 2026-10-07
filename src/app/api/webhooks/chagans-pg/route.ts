import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/security/audit";
import { logger } from "@/lib/logger";
import {
  parseChagansWebhook,
  isChagansWebhookIp,
  chagansWebhookIps,
} from "@/lib/partners/chagans-pg";
import { settleTopup } from "@/lib/wallet/topup";

/**
 * Chagans PartnerPG webhook — wallet top-up auto-credit.
 *
 * Chagans has NO status/polling API, so this webhook is the AUTHORITATIVE and
 * ONLY signal that credits a Chagan top-up. It is authenticated by SOURCE IP:
 * Chagans posts only from CHAGAN_WEBHOOK_IPS (Star 103.160.160.129, Comet
 * 34.126.212.125). A remote attacker cannot complete a TCP POST from a spoofed
 * source IP, and `clientIp()` resolves the real peer safely behind nginx
 * (right-most X-Forwarded-For / X-Real-IP, never the client-controlled left).
 *
 * Money-safety — even a request that clears the IP gate cannot mint phantom
 * balance: settleTopup() re-checks the state machine, cross-checks the verified
 * amount against the initiated amount (HOLD on mismatch), and credits
 * idempotently (`topup:<id>`). We credit ONLY on an explicit success status.
 *
 * nginx/firewall must also restrict inbound POSTs to this path to those IPs;
 * this in-app allow-list is defence-in-depth, not the only control.
 */
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);

  // 1) Source-IP authentication — reject anything not from Chagan's servers.
  if (!isChagansWebhookIp(ip)) {
    logger.warn({ action: "webhook.chagans_pg_rejected_ip", ip, allow: chagansWebhookIps().join(",") });
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  const rawBody = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseChagansWebhook(payload);

  // Resolve OUR Transaction. Chagans does NOT echo our merchant txnId in the
  // webhook — it returns its own `orderId` (CPG_…), which we stored as
  // `partnerTxnId` at create time. So the reliable key is partnerTxnId ===
  // orderId. (If a future payload ever echoes our TOPUP… ref, honour it.)
  let referenceId: string | null =
    parsed.txnId && parsed.txnId.startsWith("TOPUP") ? parsed.txnId : null;
  if (!referenceId && parsed.orderId) {
    const match = await prisma.transaction.findFirst({
      where: { partnerTxnId: parsed.orderId, service: "WALLET_TOPUP" },
      select: { refId: true },
    });
    referenceId = match?.refId ?? null;
  }

  // Log the FULL raw payload so the exact (undocumented) schema stays auditable.
  logger.info({
    action: "webhook.chagans_pg_received",
    ip,
    refId: referenceId ?? null,
    orderId: parsed.orderId ?? null,
    transactionId: parsed.transactionId ?? null,
    status: parsed.status,
    rawStatus: parsed.rawStatus ?? null,
    amount: parsed.amount ?? null,
    raw: rawBody.slice(0, 2000),
  });

  // Not one of our top-ups (or an init/no-order ping) — acknowledge so Chagan
  // stops retrying a payload we cannot act on.
  if (!referenceId) {
    return NextResponse.json({ ok: true, matched: false });
  }

  await prisma.auditLog.create({
    data: {
      action: "webhook.chagans_pg",
      entity: "Transaction",
      entityId: referenceId,
      ip,
      meta: {
        status: parsed.status,
        rawStatus: parsed.rawStatus ?? null,
        orderId: parsed.orderId ?? null,
        amount: parsed.amount ?? null,
        reference: parsed.reference ?? null,
      },
    },
  }).catch(() => {});

  try {
    if (parsed.status === "PAID") {
      // Credit via the trusted-webhook path: settleTopup re-checks state,
      // cross-checks the amount, and credits idempotently.
      const result = await settleTopup(referenceId!, {
        status: "PAID",
        amount: parsed.amount,
        reference: parsed.reference,
      });
      return NextResponse.json({ ok: true, matched: true, status: result.status });
    }

    if (parsed.status === "FAILED" || parsed.status === "EXPIRED") {
      const result = await settleTopup(referenceId!, { status: parsed.status });
      return NextResponse.json({ ok: true, matched: true, status: result.status });
    }

    // PENDING / UNKNOWN — do not credit; just acknowledge. A conclusive webhook
    // (or recon expiry) resolves it later.
    return NextResponse.json({ ok: true, matched: true, status: "PROCESSING" });
  } catch (err) {
    logger.warn({ action: "webhook.chagans_pg_settle_failed", refId: referenceId, err: String(err) });
    // Acknowledge so Chagan doesn't retry-storm; recon/next webhook converges.
    return NextResponse.json({ ok: true, matched: false });
  }
}
