-- Migration: Knteer Payout-2 rail
-- Adds the KNTEER_PAYOUT service code, rail/knteerBeneficiaryId/gstRate columns
-- to PayoutRequest, and creates the knteer_beneficiaries table.

-- 1. Extend the ServiceCode enum (Postgres: ADD VALUE is auto-committed).
ALTER TYPE "ServiceCode" ADD VALUE IF NOT EXISTS 'KNTEER_PAYOUT';

-- 2. Add rail tag to PayoutRequest (default = SETTLEMENT for existing rows).
ALTER TABLE "PayoutRequest"
  ADD COLUMN IF NOT EXISTS "rail"              TEXT    NOT NULL DEFAULT 'SETTLEMENT',
  ADD COLUMN IF NOT EXISTS "knteerBeneficiaryId" TEXT,
  ADD COLUMN IF NOT EXISTS "gstRate"           INTEGER NOT NULL DEFAULT 0;

-- 3. Cooldown index: fast lookup of recent KNTEER transfers per user/account.
CREATE INDEX IF NOT EXISTS "PayoutRequest_userId_rail_accountLast4_status_createdAt_idx"
  ON "PayoutRequest" ("userId", "rail", "accountLast4", "status", "createdAt");

-- 4. Create the knteer_beneficiaries table.
CREATE TABLE IF NOT EXISTS "knteer_beneficiaries" (
  "id"                 TEXT         NOT NULL,
  "userId"             TEXT         NOT NULL,
  "accountNumber"      TEXT         NOT NULL,
  "accountLast4"       TEXT         NOT NULL,
  "ifscCode"           TEXT         NOT NULL,
  "accountHolderName"  TEXT         NOT NULL,
  "bankName"           TEXT         NOT NULL,
  "mobile"             TEXT         NOT NULL,
  "referenceId"        TEXT,
  "registrationType"   TEXT         NOT NULL DEFAULT 'register',
  "verificationCharge" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "isRegistered"       BOOLEAN      NOT NULL DEFAULT TRUE,
  "isBankVerified"     BOOLEAN      NOT NULL DEFAULT FALSE,
  "email"              TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knteer_beneficiaries_pkey" PRIMARY KEY ("id")
);

-- 5. FK: knteer_beneficiaries.userId → User.id
ALTER TABLE "knteer_beneficiaries"
  ADD CONSTRAINT "knteer_beneficiaries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. FK: PayoutRequest.knteerBeneficiaryId → knteer_beneficiaries.id
ALTER TABLE "PayoutRequest"
  ADD CONSTRAINT "PayoutRequest_knteerBeneficiaryId_fkey"
  FOREIGN KEY ("knteerBeneficiaryId") REFERENCES "knteer_beneficiaries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Unique constraint: one entry per (userId, accountLast4, ifscCode).
CREATE UNIQUE INDEX IF NOT EXISTS "knteer_beneficiaries_userId_accountLast4_ifscCode_key"
  ON "knteer_beneficiaries" ("userId", "accountLast4", "ifscCode");

-- 8. Indexes.
CREATE INDEX IF NOT EXISTS "knteer_beneficiaries_userId_idx"
  ON "knteer_beneficiaries" ("userId");
CREATE INDEX IF NOT EXISTS "knteer_beneficiaries_ifscCode_idx"
  ON "knteer_beneficiaries" ("ifscCode");
