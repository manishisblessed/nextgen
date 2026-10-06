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
  const referenceId = parsed.txnId;

  // Log the FULL raw payload once so the exact (undocumented) schema can be
  // confirmed/finalised after the first live webhook. Truncated to stay sane.
  logger.info({
    action: "webhook.chagans_pg_received",
    ip,
    refId: referenceId ?? null,
    orderId: parsed.orderId ?? null,
    status: parsed.status,
    rawStatus: parsed.rawStatus ?? null,
    amount: parsed.amount ?? null,
    raw: rawBody.slice(0, 2000),
  });

  // Chagans is wired for wallet top-ups (TOPUP…). Acknowledge anything else so
  // Chagan stops retrying payloads we cannot act on.
  const isTopup = !!referenceId && referenceId.startsWith("TOPUP");
  if (!isTopup) {
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
