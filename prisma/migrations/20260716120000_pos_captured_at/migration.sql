-- Capture time for POS settlement entries. The T+1 sweep settles by capture
-- date (not row-creation date) so pull-ingested captures settle on the correct
-- IST day. Null on legacy rows → sweep falls back to createdAt.
ALTER TABLE "PosSettlementEntry" ADD COLUMN "capturedAt" TIMESTAMP(3);

CREATE INDEX "PosSettlementEntry_status_capturedAt_idx" ON "PosSettlementEntry"("status", "capturedAt");
