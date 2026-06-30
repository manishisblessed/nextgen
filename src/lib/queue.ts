import PgBoss from "pg-boss";

/**
 * Async job queue (pg-boss, backed by Postgres — no extra infra on the EC2 box).
 *
 * Why a queue: payment "hits" (BulkPe payout, BBPS, etc.) must NOT be processed
 * synchronously inside the HTTP request. The API enqueues a job and returns fast;
 * a separate worker process (PM2) drains the queue, calls the provider (from the
 * IP-whitelisted box), and finalizes via webhook/poll. This is what lets us
 * absorb bursts without exhausting the request thread pool or DB connections.
 *
 * The worker entrypoint (registered via `boss.work(...)`) lands in Phase 2.
 */

/** Stable queue names. Add new rails here as they are built. */
export const QUEUES = {
  PAYOUT_INITIATE: "payout.initiate",
  PAYOUT_RECONCILE: "payout.reconcile",
  // Phase 13 — monthly Re-KYC sweep. Scheduled "0 0 1 * *" (Asia/Kolkata) in the
  // worker; flags every ACTIVE network user (RT/DT/MD/SD) for re-verification.
  REKYC_MONTHLY: "rekyc.monthly",
  // Phase 14 — onboarding liveness baseline. After a network user uploads their
  // liveness video, this job (worker, IP-whitelisted box) downloads it, verifies
  // duration via ffprobe, extracts a face frame via ffmpeg, and registers the
  // eKYC Hub baseline. Heavy/external work — never run inside the HTTP request.
  KYC_VIDEO_BASELINE: "kyc.video.baseline",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

let bossPromise: Promise<PgBoss> | null = null;

function connectionString(): string {
  // Prefer a direct (non-pooled) connection for pg-boss maintenance/polling.
  const cs = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) {
    throw new Error(
      "[queue] DIRECT_URL or DATABASE_URL must be set to use the job queue."
    );
  }
  return cs;
}

/**
 * Lazily construct, start, and memoize the pg-boss instance, and ensure all
 * known queues exist (required by pg-boss v10+ before send/work).
 */
export async function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss({
        connectionString: connectionString(),
        // pg-boss creates and manages its own "pgboss" schema.
        schema: "pgboss",
      });
      boss.on("error", (err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[queue] pg-boss error:", err);
      });
      await boss.start();
      for (const name of Object.values(QUEUES)) {
        await boss.createQueue(name);
      }
      return boss;
    })().catch((err) => {
      // Reset so a later call can retry instead of caching a failed start.
      bossPromise = null;
      throw err;
    });
  }
  return bossPromise;
}

export type EnqueueOptions = {
  /** Idempotency at the queue layer — pg-boss dedupes jobs sharing a singletonKey. */
  singletonKey?: string;
  /** Delay before the job becomes available, in seconds. */
  startAfterSec?: number;
  /** Retry attempts on failure. */
  retryLimit?: number;
  /** Backoff in seconds between retries. */
  retryDelaySec?: number;
};

/** Enqueue a job. Returns the job id (or null if deduped by singletonKey). */
export async function enqueue<T extends object>(
  queue: QueueName,
  data: T,
  opts: EnqueueOptions = {}
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(queue, data, {
    singletonKey: opts.singletonKey,
    startAfter: opts.startAfterSec,
    retryLimit: opts.retryLimit ?? 5,
    retryDelay: opts.retryDelaySec ?? 30,
    retryBackoff: true,
  });
}
