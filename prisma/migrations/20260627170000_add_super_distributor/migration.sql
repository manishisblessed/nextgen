-- Additive migration: introduce SUPER_DISTRIBUTOR role and commission column.
-- Safe to apply while the app is running (no locks on data rows).

-- 1. Add the new enum value (Postgres supports appending safely).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_DISTRIBUTOR';

-- 2. Add the commission column for the super-distributor tier to SchemeSlab.
ALTER TABLE "SchemeSlab"
  ADD COLUMN IF NOT EXISTS "commissionSuperDistributor" DECIMAL(14, 4) NOT NULL DEFAULT 0;
