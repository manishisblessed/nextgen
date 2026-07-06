/**
 * NextGenPay background worker (PM2 process, separate from the Next.js server).
 *
 * Why a separate process: heavy / external / money-moving calls (BulkPe payout
 * initiation, status reconciliation) must NOT run inside an HTTP request. The
 * API enqueues a job and returns fast; this worker drains the queue from the
 * IP-whitelisted EC2 box and finalizes via the shared idempotent service.
 *
 * Run locally:   npm run worker
 * Run on EC2:    pm2 start ecosystem.config.js   (app: nextgenpay-worker)
 *
 * Env: needs DATABASE_URL/DIRECT_URL, APP_ENCRYPTION_KEY, PARTNER_PAYOUT_ENABLED
 * and BULKPE_* (see .env.example). We best-effort load a local .env via Node's
 * built-in loader; in production PM2/systemd supplies the environment.
 */
try {
  // Node 20.12+ : load .env without a dependency. Ignore if unavailable/missing.
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.();
} catch {
  /* env provided by the process manager */
}

import type PgBoss from "pg-boss";
import { getBoss, QUEUES } from "@/lib/queue";
import {
  processPayoutInitiate,
  reconcilePayout,
  reconcileStuckPayouts,
} from "@/lib/payout/service";
import { runMonthlyReKycSweep } from "@/lib/rekyc/sweep";
import { processKycVideoBaseline } from "@/lib/kyc/video/service";
import { runLedgerIntegrityAudit } from "@/lib/recon/integrity";
import { runDailyPayoutReconciliation } from "@/lib/recon/payouts";
import { sweepDisputeSlas } from "@/lib/disputes/service";
import { runSettlementAutosweep } from "@/lib/settlement/autosweep";
import { deliverWebhook } from "@/lib/platform/webhooks";
import { runAmlSweep } from "@/lib/aml/engine";
import { runAuditAnchorJob } from "@/lib/audit/anchor";
import { runKycVideoRetention } from "@/lib/kyc/video/retention";
import { productionSecretIssues } from "@/lib/env";
import { purgeExpiredRateLimits } from "@/lib/security/rateLimit";
import { prisma } from "@/lib/db";
import { captureError, sendOpsAlert } from "@/lib/monitoring/alerts";

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[worker]", ...args);
}

async function main() {
  const boss = await getBoss();
  log("pg-boss started; registering handlers…");

  // QUEUES.PAYOUT_INITIATE — call BulkPe for an APPROVED payout.
  await boss.work<{ payoutRequestId: string }>(QUEUES.PAYOUT_INITIATE, async (jobs) => {
    for (const job of jobs) {
      const { payoutRequestId } = job.data;
      log(`payout.initiate ${payoutRequestId}`);
      await processPayoutInitiate(payoutRequestId);
    }
  });

  // QUEUES.PAYOUT_RECONCILE — per-row reconcile (data.payoutRequestId) OR the
  // scheduled sweep (no data) that polls all stuck PROCESSING rows.
  await boss.work<{ payoutRequestId?: string }>(QUEUES.PAYOUT_RECONCILE, async (jobs) => {
    for (const job of jobs) {
      const data = job.data ?? {};
      if (data.payoutRequestId) {
        log(`payout.reconcile ${data.payoutRequestId}`);
        await reconcilePayout(data.payoutRequestId);
      } else {
        const { scanned } = await reconcileStuckPayouts();
        if (scanned > 0) log(`reconcile sweep: ${scanned} stuck payout(s) checked`);
      }
    }
  });

  // Fallback for missed webhooks: poll every 5 minutes. `schedule` is
  // idempotent by queue name, so re-running on restart is safe.
  await boss.schedule(QUEUES.PAYOUT_RECONCILE, "*/5 * * * *");

  // QUEUES.REKYC_MONTHLY — flag all ACTIVE network users for re-verification.
  // The sweep is internally idempotent, so a duplicate/retried delivery is safe.
  await boss.work(QUEUES.REKYC_MONTHLY, async () => {
    const { flagged, dueAt } = await runMonthlyReKycSweep();
    log(`rekyc.monthly: flagged ${flagged} network user(s); due ${dueAt.toISOString()}`);
  });

  // Run at 00:00 on the 1st of every month, in the server's operating timezone
  // (Asia/Kolkata / IST). `schedule` is keyed by queue name, so re-scheduling on
  // each worker restart simply overwrites the existing cron — no duplicates.
  await boss.schedule(QUEUES.REKYC_MONTHLY, "0 0 1 * *", {}, { tz: "Asia/Kolkata" });

  // QUEUES.KYC_VIDEO_BASELINE — Phase 14. After a network user uploads their
  // liveness video, extract a face frame (ffmpeg) and register the eKYC Hub
  // baseline. Idempotent per KycVideo id; safe on retry/duplicate delivery.
  await boss.work<{ kycVideoId: string }>(QUEUES.KYC_VIDEO_BASELINE, async (jobs) => {
    for (const job of jobs) {
      const { kycVideoId } = job.data;
      log(`kyc.video.baseline ${kycVideoId}`);
      await processKycVideoBaseline(kycVideoId);
    }
  });

  // QUEUES.RECON_DAILY — nightly money-safety sweep. Each stage is isolated so
  // one failure never blocks the others; every failure is captured + alerted.
  await boss.work(QUEUES.RECON_DAILY, async () => {
    log("recon.daily: starting…");

    try {
      const audit = await runLedgerIntegrityAudit();
      log(
        `recon.daily: ledger audit checked ${audit.usersChecked} user(s), ` +
          `${audit.findings.length} mismatch(es)`
      );
    } catch (e) {
      await captureError(e, { where: "recon.daily/ledger-audit", severity: "critical" });
    }

    try {
      const payout = await runDailyPayoutReconciliation();
      log(
        `recon.daily: payout recon drained=${payout.drained} stuck=${payout.stuck} ` +
          `verified=${payout.verified} mismatches=${payout.mismatches}` +
          (payout.skipped ? " (skipped — partner disabled)" : "")
      );
    } catch (e) {
      await captureError(e, { where: "recon.daily/payout-recon", severity: "critical" });
    }

    try {
      const purgedRl = await purgeExpiredRateLimits();
      const purgedIdem = await prisma.idempotencyKey.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      log(
        `recon.daily: housekeeping purged ${purgedRl} rate-limit row(s), ` +
          `${purgedIdem.count} idempotency row(s)`
      );
    } catch (e) {
      await captureError(e, { where: "recon.daily/housekeeping" });
    }
  });

  // 02:30 IST daily — after the day's settlement window, before business hours.
  await boss.schedule(QUEUES.RECON_DAILY, "30 2 * * *", {}, { tz: "Asia/Kolkata" });

  // QUEUES.DISPUTE_SLA — Phase 3. Stamp SLA breaches once, escalate priority,
  // alert ops. Sweep is idempotent (slaBreachedAt filter), so duplicate
  // deliveries are harmless.
  await boss.work(QUEUES.DISPUTE_SLA, async () => {
    const { breached } = await sweepDisputeSlas();
    if (breached > 0) log(`dispute.sla: ${breached} SLA breach(es) flagged`);
  });
  await boss.schedule(QUEUES.DISPUTE_SLA, "*/30 * * * *");

  // QUEUES.SETTLEMENT_AUTOSWEEP — Phase 3. Daily 19:30 IST (after the day's
  // trade, before the IMPS evening rush). Internally idempotent per IST day.
  await boss.work(QUEUES.SETTLEMENT_AUTOSWEEP, async () => {
    const result = await runSettlementAutosweep();
    log(
      result.swept
        ? `settlement.autosweep: swept ₹${result.amount}`
        : `settlement.autosweep: skipped (${result.reason})`
    );
  });
  await boss.schedule(QUEUES.SETTLEMENT_AUTOSWEEP, "30 19 * * *", {}, { tz: "Asia/Kolkata" });

  // QUEUES.WEBHOOK_DELIVER — Phase 4. Signed partner webhook deliveries;
  // per-job retryLimit set at enqueue time, terminal failures alert ops.
  await boss.work<{ deliveryId: string }>(QUEUES.WEBHOOK_DELIVER, async (jobs) => {
    for (const job of jobs) {
      await deliverWebhook(job.data.deliveryId);
    }
  });

  // QUEUES.AML_SWEEP — Phase 5. Hourly transaction-monitoring sweep over the
  // current IST day. Idempotent per (user, rule, day) via the unique key.
  await boss.work(QUEUES.AML_SWEEP, async () => {
    const { scannedUsers, newAlerts } = await runAmlSweep();
    if (newAlerts > 0) log(`aml.sweep: ${newAlerts} new alert(s) across ${scannedUsers} user(s)`);
  });
  await boss.schedule(QUEUES.AML_SWEEP, "15 * * * *");

  // QUEUES.AUDIT_ANCHOR — Phase 5. Anchor yesterday's audit rows into the
  // hash chain and spot-verify the previous anchor. 00:20 IST daily.
  await boss.work(QUEUES.AUDIT_ANCHOR, async () => {
    await runAuditAnchorJob();
    log("audit.anchor: done");
  });
  await boss.schedule(QUEUES.AUDIT_ANCHOR, "20 0 * * *", {}, { tz: "Asia/Kolkata" });

  // QUEUES.KYC_VIDEO_RETENTION — Phase 5. Purge raw liveness videos past the
  // retention window (opt-in via KYC_VIDEO_RETENTION_ENABLED). 01:30 IST daily.
  await boss.work(QUEUES.KYC_VIDEO_RETENTION, async () => {
    const r = await runKycVideoRetention();
    if (!r.skipped) log(`kyc.video.retention: purged ${r.purged}, failed ${r.failed}`);
  });
  await boss.schedule(QUEUES.KYC_VIDEO_RETENTION, "30 1 * * *", {}, { tz: "Asia/Kolkata" });

  // Phase 5 — secrets hardening: loudly flag weak/missing production secrets
  // at startup (never crashes the worker; ops gets one alert per boot).
  const secretIssues = productionSecretIssues();
  if (secretIssues.length > 0) {
    log(`SECRETS WARNING: ${secretIssues.join(" | ")}`);
    await sendOpsAlert({
      title: "Production secrets hardening issues detected",
      severity: "critical",
      details: { issues: secretIssues.join("; ") },
    });
  }

  log(
    "ready · handlers: payout.initiate, payout.reconcile (*/5 * * * *), rekyc.monthly (0 0 1 * * IST), kyc.video.baseline, recon.daily (30 2 * * * IST), dispute.sla (*/30 * * * *), settlement.autosweep (30 19 * * * IST), webhook.deliver, aml.sweep (15 * * * *), audit.anchor (20 0 * * * IST), kyc.video.retention (30 1 * * * IST)"
  );
}

async function shutdown(signal: string) {
  log(`${signal} received — draining and stopping…`);
  try {
    const boss: PgBoss = await getBoss();
    await boss.stop({ wait: true });
  } catch {
    /* already stopped */
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal:", e);
  await sendOpsAlert({
    title: "Background worker crashed at startup",
    severity: "critical",
    details: { error: String(e).slice(0, 300) },
  }).catch(() => {});
  process.exit(1);
});
