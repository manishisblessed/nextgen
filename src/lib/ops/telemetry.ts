/**
 * Lightweight ops telemetry persisted in the PlatformSetting KV store (no
 * dedicated table / migration needed). Used to share liveness + PG gateway
 * health ACROSS processes — the background worker (PM2 fork) and the Next.js
 * web cluster run as separate processes with separate memory, so an in-process
 * cache alone can't give the web UI what the worker just probed.
 *
 * All writes/reads are best-effort and never throw: telemetry must not break
 * the money path it observes.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { logger } from "../logger";

const HEARTBEAT_KEY = "ops.worker_heartbeat";
const GATEWAY_HEALTH_KEY = "ops.pg_gateway_health";

// ---------------------------------------------------------------------------
// Worker heartbeat — proves the PM2 worker is alive so a dead worker (which
// would silently stop settling "paid but browser closed" payins) is detectable.
// ---------------------------------------------------------------------------

/** Stamp a fresh heartbeat. Call from a frequently-scheduled worker job. */
export async function recordWorkerHeartbeat(job?: string): Promise<void> {
  try {
    const value = { at: new Date().toISOString(), job: job ?? null } as Prisma.InputJsonValue;
    await prisma.platformSetting.upsert({
      where: { key: HEARTBEAT_KEY },
      create: { key: HEARTBEAT_KEY, value },
      update: { value },
    });
  } catch (err) {
    logger.warn({ action: "ops.heartbeat_write_failed", err: String(err) });
  }
}

export type WorkerHeartbeatView = { at: string | null; ageSeconds: number | null; job: string | null };

/** Read the last worker heartbeat and its age. Never throws. */
export async function readWorkerHeartbeat(): Promise<WorkerHeartbeatView> {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: HEARTBEAT_KEY } });
    const v = row?.value as { at?: string; job?: string } | null | undefined;
    if (!v?.at) return { at: null, ageSeconds: null, job: null };
    const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(v.at).getTime()) / 1000));
    return { at: v.at, ageSeconds, job: v.job ?? null };
  } catch {
    return { at: null, ageSeconds: null, job: null };
  }
}

// ---------------------------------------------------------------------------
// PG gateway health snapshot — the worker's periodic probe result, persisted so
// the web process (admin dashboard + user gateway picker) sees the same health
// without each cold web instance minting its own probe orders.
// ---------------------------------------------------------------------------

export type GatewayHealthEntry = {
  id: string;
  label: string;
  route: string;
  primary: boolean;
  healthy: boolean | null;
  detail: string;
  checkedAt: string | null;
};
export type GatewayHealthSnapshot = { at: string; gateways: GatewayHealthEntry[] };

/** Persist the latest gateway-health probe snapshot (from the worker). */
export async function persistGatewayHealth(snapshot: GatewayHealthSnapshot): Promise<void> {
  try {
    const value = snapshot as unknown as Prisma.InputJsonValue;
    await prisma.platformSetting.upsert({
      where: { key: GATEWAY_HEALTH_KEY },
      create: { key: GATEWAY_HEALTH_KEY, value },
      update: { value },
    });
  } catch (err) {
    logger.warn({ action: "ops.gateway_health_write_failed", err: String(err) });
  }
}

/** Read the last persisted gateway-health snapshot. Never throws. */
export async function readGatewayHealth(): Promise<GatewayHealthSnapshot | null> {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: GATEWAY_HEALTH_KEY } });
    const v = row?.value as GatewayHealthSnapshot | null | undefined;
    return v?.gateways ? v : null;
  } catch {
    return null;
  }
}
