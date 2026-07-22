-- Button-driven settlement (POS + QR): retailers instant-settle chosen
-- transactions at the scheme's T0 rate; the rest auto-settle T+1 at the T1
-- rate. No double credit (status gate + ledger idempotency key).

-- ── POS: record HOW an entry settled (audit / reporting) ────────────────────
ALTER TABLE "PosSettlementEntry" ADD COLUMN "settledVia" TEXT;

-- ── QR: settlement split ────────────────────────────────────────────────────
-- New statuses: approval no longer credits face value; it makes the claim
-- SETTLEABLE. Money moves (net of scheme MDR) only at SETTLED.
ALTER TYPE "QrClaimStatus" ADD VALUE IF NOT EXISTS 'SETTLEABLE';
ALTER TYPE "QrClaimStatus" ADD VALUE IF NOT EXISTS 'SETTLED';

ALTER TABLE "QrClaim" ADD COLUMN "settleableAt" TIMESTAMP(3);
ALTER TABLE "QrClaim" ADD COLUMN "mdrAmount" DECIMAL(14,2);
ALTER TABLE "QrClaim" ADD COLUMN "netAmount" DECIMAL(14,2);
ALTER TABLE "QrClaim" ADD COLUMN "settledAt" TIMESTAMP(3);
ALTER TABLE "QrClaim" ADD COLUMN "settledVia" TEXT;
ALTER TABLE "QrClaim" ADD COLUMN "walletTxnId" TEXT;
ALTER TABLE "QrClaim" ADD COLUMN "settlementSchemeId" TEXT;
ALTER TABLE "QrClaim" ADD COLUMN "mdrSlabId" TEXT;

CREATE INDEX "QrClaim_status_settleableAt_idx" ON "QrClaim"("status", "settleableAt");
