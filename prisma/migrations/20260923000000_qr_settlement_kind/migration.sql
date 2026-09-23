-- QR settlement kind: split the QR rail into two independent collection streams —
-- INSTANT (T0, auto-settled to the retailer wallet on admin approval) and T1
-- (next-day, settled by the daily T+1 cron). Admins upload/manage two separate
-- QR pools (one per kind); retailers pick the service (QR-Instant / QR-T+1),
-- collect on that pool, and the admin review queue splits by kind.
--
-- Additive and safe to apply while the app is running. Existing QRs and claims
-- default to T1 — exactly today's behavior (approve → SETTLEABLE → T+1 sweep) —
-- so nothing in flight changes.

-- Enum for the two settlement streams.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QrSettlementKind') THEN
    CREATE TYPE "QrSettlementKind" AS ENUM ('INSTANT', 'T1');
  END IF;
END
$$;

-- Tag every QR and every claim with its stream (existing rows → T1).
ALTER TABLE "StaticQr" ADD COLUMN IF NOT EXISTS "settlementKind" "QrSettlementKind" NOT NULL DEFAULT 'T1';
ALTER TABLE "QrClaim"  ADD COLUMN IF NOT EXISTS "settlementKind" "QrSettlementKind" NOT NULL DEFAULT 'T1';

-- Rotation now maintains "at most one active QR" PER kind; scope the queue
-- lookups (enabled + kind + priority) and the review-queue split (kind + status).
CREATE INDEX IF NOT EXISTS "StaticQr_enabled_settlementKind_priority_idx" ON "StaticQr"("enabled", "settlementKind", "priority");
CREATE INDEX IF NOT EXISTS "QrClaim_settlementKind_status_createdAt_idx" ON "QrClaim"("settlementKind", "status", "createdAt");
