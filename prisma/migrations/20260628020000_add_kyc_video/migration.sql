-- Phase 14 — Onboarding liveness video + face baseline.
-- Fully ADDITIVE, non-destructive: one boolean column on "User" and one new
-- "KycVideo" table + enum. Existing rows backfill safely (hasLivenessVideo
-- defaults to false, so legacy network users are gated until they capture a
-- video; staff/admin are exempt in application code). Safe on a live DB.
--
-- The video bytes themselves are NEVER stored here — they live in a private
-- S3 bucket (Block Public Access, SSE-KMS, versioning). This table keeps only
-- the field-encrypted S3 key, a sha256 integrity digest, and the field-encrypted
-- eKYC Hub face-baseline reference. Biometric PII (DPDP/RBI): consentAt records
-- explicit capture consent.

-- CreateEnum: lifecycle of a liveness video / its baseline.
CREATE TYPE "KycVideoStatus" AS ENUM ('UPLOADED', 'BASELINE_READY', 'FAILED');

-- AlterTable: whether the user has a usable onboarding liveness video.
ALTER TABLE "User" ADD COLUMN "hasLivenessVideo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: encrypted reference + integrity hash for the S3-stored video.
CREATE TABLE "KycVideo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 's3',
    "storageKeyEnc" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "faceBaselineRefEnc" TEXT,
    "status" "KycVideoStatus" NOT NULL DEFAULT 'UPLOADED',
    "consentAt" TIMESTAMP(3) NOT NULL,
    "capturedIp" TEXT,
    "capturedUa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycVideo_pkey" PRIMARY KEY ("id")
);

-- One liveness video per user.
CREATE UNIQUE INDEX "KycVideo_userId_key" ON "KycVideo"("userId");
CREATE INDEX "KycVideo_status_idx" ON "KycVideo"("status");

ALTER TABLE "KycVideo" ADD CONSTRAINT "KycVideo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
