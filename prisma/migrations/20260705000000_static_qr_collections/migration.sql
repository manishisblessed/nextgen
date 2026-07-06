-- CreateEnum
CREATE TYPE "QrClaimStatus" AS ENUM ('PENDING', 'AWAITING_SECOND_APPROVAL', 'APPROVED', 'REJECTED', 'CLAWED_BACK');

-- CreateTable
CREATE TABLE "StaticQr" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "upiVpa" TEXT,
    "imagePublicId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "disabledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaticQr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "qrId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "utr" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "screenshotPublicId" TEXT NOT NULL,
    "screenshotFormat" TEXT,
    "screenshotHash" TEXT NOT NULL,
    "status" "QrClaimStatus" NOT NULL DEFAULT 'PENDING',
    "firstApprovedById" TEXT,
    "firstApprovedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "portalVerified" BOOLEAN NOT NULL DEFAULT false,
    "settlementBatchId" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaticQr_active_idx" ON "StaticQr"("active");

-- CreateIndex
CREATE UNIQUE INDEX "QrClaim_utr_key" ON "QrClaim"("utr");

-- CreateIndex
CREATE UNIQUE INDEX "QrClaim_screenshotHash_key" ON "QrClaim"("screenshotHash");

-- CreateIndex
CREATE INDEX "QrClaim_userId_status_idx" ON "QrClaim"("userId", "status");

-- CreateIndex
CREATE INDEX "QrClaim_status_createdAt_idx" ON "QrClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "QrClaim_reconciledAt_idx" ON "QrClaim"("reconciledAt");

-- AddForeignKey
ALTER TABLE "StaticQr" ADD CONSTRAINT "StaticQr_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrClaim" ADD CONSTRAINT "QrClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrClaim" ADD CONSTRAINT "QrClaim_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "StaticQr"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrClaim" ADD CONSTRAINT "QrClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
