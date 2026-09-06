-- ⚠️  SECURITY-SENSITIVE MIGRATION — REVIEW BEFORE DEPLOY ⚠️
--
-- Relaxes identity uniqueness from DB-enforced (hard unique index) to
-- APPLICATION-enforced. This is required so a master-admin can grant
-- value-scoped IdentityException rows that permit the SAME PAN / Aadhaar /
-- bank account / GST / Udyam / shop name to onboard up to FOUR accounts — one
-- per network tier (SUPER_DISTRIBUTOR, MASTER_DISTRIBUTOR, DISTRIBUTOR,
-- RETAILER).
--
-- After this migration the DATABASE no longer guarantees identity uniqueness.
-- The ONLY guard is the application layer:
--   - src/app/api/onboard/[token]/verify/route.ts
--   - src/app/api/onboard/[token]/register/route.ts
--   - src/app/api/kyc/route.ts
-- via src/lib/security/identityExceptions.ts (assertIdentityAvailable).
-- These MUST stay airtight and fail-closed.
--
-- Rollback: to restore hard uniqueness, first resolve any intentional
-- duplicates, then recreate the UNIQUE indexes dropped below.

-- DropIndex (unique) → recreate as plain lookup index
DROP INDEX "Kyc_panNumber_key";
CREATE INDEX "Kyc_panNumber_idx" ON "Kyc"("panNumber");

DROP INDEX "Kyc_aadhaarNumber_key";
CREATE INDEX "Kyc_aadhaarNumber_idx" ON "Kyc"("aadhaarNumber");

DROP INDEX "Kyc_bankAccountNumber_key";
CREATE INDEX "Kyc_bankAccountNumber_idx" ON "Kyc"("bankAccountNumber");

DROP INDEX "Kyc_gstin_key";
CREATE INDEX "Kyc_gstin_idx" ON "Kyc"("gstin");

DROP INDEX "Kyc_msmeNumber_key";
CREATE INDEX "Kyc_msmeNumber_idx" ON "Kyc"("msmeNumber");

DROP INDEX "User_shopName_key";
CREATE INDEX "User_shopName_idx" ON "User"("shopName");
