import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { partnerStatus, moneyRailsOnMock } from "@/lib/partners";
import { isProd } from "@/lib/env";
import { readWorkerHeartbeat } from "@/lib/ops/telemetry";
import { sendOpsAlert } from "@/lib/monitoring/alerts";

export const fetchCache = "force-no-store";

export const dynamic = "force-dynamic";

// A worker that hasn't beaten in this long is considered DEAD. The worker beats
// every 2 min (topup.reconcile), so 10 min = ~5 missed beats.
const WORKER_STALE_SECONDS = Number(process.env.WORKER_STALE_SECONDS ?? 600);
// In-process throttle so a persistently-dead worker pages at most once per
// window even though uptime monitors hit /healthz constantly.
const WORKER_ALERT_THROTTLE_MS = 30 * 60_000;
let lastWorkerAlertAt = 0;

export async function GET() {
  let db = "down";
  try {
    await prisma.$queryRaw`select 1`;
    db = "up";
  } catch {
    db = "down";
  }

  // Money rails (upi/payout/aeps/dmt/bbps) must never run on a mock in prod —
  // that is how phantom wallet balance got minted. Surface it here so uptime
  // monitors alert on it, and fail `ok` in production if any are on mock.
  const railsOnMock = moneyRailsOnMock();
  const moneyRailsMisconfigured = isProd && railsOnMock.length > 0;

  // Background worker liveness. A dead worker silently stops settling
  // "paid but browser closed" payins, so we both surface it here (for uptime
  // monitors) and self-alert to the admin bell (the always-up web cluster is
  // the only process that can detect the worker being down).
  const hb = await readWorkerHeartbeat();
  const workerSeen = hb.at !== null;
  const workerStale = workerSeen && hb.ageSeconds !== null && hb.ageSeconds > WORKER_STALE_SECONDS;
  if (isProd && workerStale && Date.now() - lastWorkerAlertAt > WORKER_ALERT_THROTTLE_MS) {
    lastWorkerAlertAt = Date.now();
    void sendOpsAlert({
      title: "Background worker appears DOWN — payin settlement/recon stalled",
      severity: "critical",
      details: { lastBeatAt: hb.at ?? "never", ageSeconds: hb.ageSeconds ?? "n/a", lastJob: hb.job ?? "n/a" },
      href: "/dashboard/admin",
    });
  }

  return NextResponse.json({
    ok: db === "up" && !moneyRailsMisconfigured,
    db,
    // Presence booleans only (never values) — lets ops verify the runtime
    // actually received critical env vars (Amplify bakes them in at build).
    config: {
      nextauthSecret: Boolean(process.env.NEXTAUTH_SECRET),
      nextauthUrl: Boolean(process.env.NEXTAUTH_URL),
      databaseUrl: Boolean(process.env.DATABASE_URL),
      encryptionKey: Boolean(process.env.APP_ENCRYPTION_KEY),
    },
    partners: partnerStatus(),
    moneyRailsOnMock: railsOnMock,
    worker: {
      seen: workerSeen,
      stale: workerStale,
      lastBeatAt: hb.at,
      ageSeconds: hb.ageSeconds,
      lastJob: hb.job,
    },
    time: new Date().toISOString()
  });
}
