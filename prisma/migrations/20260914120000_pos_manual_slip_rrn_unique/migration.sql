-- Harden the manual-slip duplicate guard at the database level.
--
-- Application code already blocks re-submitting the same RRN for the same TID
-- while an earlier slip is PENDING or APPROVED, but two concurrent uploads can
-- both pass that check before either row is written. This PARTIAL UNIQUE index
-- closes that race: at most one PENDING/APPROVED slip may exist per (tid, rrn).
--
-- REJECTED slips are intentionally excluded so a retailer can re-upload after a
-- rejection, and NULL RRNs are excluded (no acquirer reference to dedupe on).
CREATE UNIQUE INDEX "PosManualSlip_tid_rrn_active_key"
  ON "PosManualSlip" ("tid", "rrn")
  WHERE "rrn" IS NOT NULL AND "status" IN ('PENDING', 'APPROVED');
