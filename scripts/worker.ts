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

  log(
    "ready · handlers: payout.initiate, payout.reconcile (*/5 * * * *), rekyc.monthly (0 0 1 * * IST), kyc.video.baseline"
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

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal:", e);
  process.exit(1);
});
