-- Per-machine rental plans: tie each POS rental plan to a specific machine
-- model/name (sourced from PosMachine.model, e.g. "AVIKA-AXIS"), so every
-- machine model has its own specific renting plan + security deposit that is
-- deducted with the rent at booking.
--
-- Additive and safe to apply while the app is running. The new column is
-- nullable so existing plans keep working. Because Postgres treats NULLs as
-- distinct in unique indexes, any number of legacy plans with a NULL
-- machineName remain valid; the constraint only enforces "one plan per model"
-- once a model is actually set.

ALTER TABLE "PosRentalPlan" ADD COLUMN IF NOT EXISTS "machineName" TEXT;

-- One plan per machine model, per owner (platform plans share the null-owner
-- scope). Enforces the "one machine → one plan" rule.
CREATE UNIQUE INDEX IF NOT EXISTS "PosRentalPlan_ownerId_machineName_key"
  ON "PosRentalPlan"("ownerId", "machineName");
