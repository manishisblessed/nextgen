-- Security hardening: brute-force lockout + device/anomaly tracking.
-- Fully additive, non-destructive: new nullable/defaulted columns on "User"
-- and one new "LoginAttempt" table. Safe to apply on a live database.

-- AlterTable: device / session-context tracking for anomaly detection
ALTER TABLE "User" ADD COLUMN "lastLoginIp" TEXT;
ALTER TABLE "User" ADD COLUMN "lastLoginUserAgent" TEXT;
ALTER TABLE "User" ADD COLUMN "knownDevices" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable: per-identifier failed-login tracking (account lockout)
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),
    "lastIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginAttempt_identifier_key" ON "LoginAttempt"("identifier");
CREATE INDEX "LoginAttempt_lockedUntil_idx" ON "LoginAttempt"("lockedUntil");
