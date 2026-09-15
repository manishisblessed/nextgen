-- Retailer-chosen settlement timing for an External POS slip.
-- "T1" = next-day sweep (default), "INSTANT" = credit at admin approval.
ALTER TABLE "PosManualSlip"
  ADD COLUMN "settlementPref" TEXT NOT NULL DEFAULT 'T1';

-- Admin queue filters slips by (settlementPref, status) for the Instant / Next Day tabs.
CREATE INDEX "PosManualSlip_settlementPref_status_idx"
  ON "PosManualSlip" ("settlementPref", "status");
