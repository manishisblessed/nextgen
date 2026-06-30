-- Phase 13 — Monthly Re-KYC gate (identity re-verification).
-- Fully ADDITIVE, non-destructive: three nullable/defaulted columns on "User"
-- and one new "ReKycLog" table + enum. Existing rows backfill safely
-- (reKycRequired defaults to false, the date columns to NULL). Safe on a live DB.

-- CreateEnum: outcome of a single re-verification attempt.
CREATE TYPE "ReKycStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- AlterTable: monthly re-KYC state on the user.
ALTER TABLE "User" ADD COLUMN "reKycRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lastReKycAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "reKycDueAt" TIMESTAMP(3);

-- Index to speed admin/status filtering on the gate flag.
CREATE INDEX "User_reKycRequired_idx" ON "User"("reKycRequired");

-- CreateTable: re-KYC attempt audit trail (no raw PII).
CREATE TABLE "ReKycLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" "ReKycStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerRef" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReKycLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReKycLog_userId_createdAt_idx" ON "ReKycLog"("userId", "createdAt");
CREATE INDEX "ReKycLog_status_createdAt_idx" ON "ReKycLog"("status", "createdAt");

ALTER TABLE "ReKycLog" ADD CONSTRAINT "ReKycLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
