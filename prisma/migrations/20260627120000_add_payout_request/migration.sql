-- Payouts (BulkPe) — additive, non-destructive.

-- CreateEnum
CREATE TYPE "PayoutMode" AS ENUM ('IMPS', 'NEFT', 'RTGS', 'UPI');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'SUCCESS', 'FAILED', 'REJECTED', 'REVERSED');

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifsc" TEXT,
    "accountLast4" TEXT NOT NULL,
    "mode" "PayoutMode" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "serviceCharge" DECIMAL(14,2) NOT NULL,
    "gst" DECIMAL(14,2) NOT NULL,
    "totalDebit" DECIMAL(14,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "remarks" TEXT,
    "bulkpeReferenceId" TEXT NOT NULL,
    "bulkpeTxnId" TEXT,
    "utr" TEXT,
    "failureReason" TEXT,
    "request" JSONB,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRequest_bulkpeReferenceId_key" ON "PayoutRequest"("bulkpeReferenceId");

-- CreateIndex
CREATE INDEX "PayoutRequest_userId_status_idx" ON "PayoutRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "PayoutRequest_status_createdAt_idx" ON "PayoutRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutRequest_checkerId_status_idx" ON "PayoutRequest"("checkerId", "status");

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the BulkPe payout service route (idempotent).
INSERT INTO "ServiceRoute" ("id", "key", "name", "type", "kind", "provider", "enabled", "note", "sortOrder", "updatedAt")
VALUES (
    'svcroute_payout_bulkpe',
    'payout_bulkpe',
    'Payout (BulkPe)',
    'SERVICE',
    'PAYOUT',
    'BULKPE',
    true,
    'Bank/UPI disbursals via BulkPe. Requires a static Elastic IP whitelisted with BulkPe.',
    50,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
