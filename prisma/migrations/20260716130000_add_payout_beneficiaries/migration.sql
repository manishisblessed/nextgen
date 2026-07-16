-- CreateEnum
CREATE TYPE "PayoutBeneVerifyStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "PayoutBeneficiary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "verifiedName" TEXT,
    "contactMobile" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "PayoutBeneVerifyStatus" NOT NULL DEFAULT 'PENDING',
    "verificationOrderId" TEXT,
    "verificationUtr" TEXT,
    "verificationChargeInPaise" INTEGER,
    "verificationWalletTxnId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "PayoutBeneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutBeneficiary_userId_isVerified_idx" ON "PayoutBeneficiary"("userId", "isVerified");

-- CreateIndex
CREATE INDEX "PayoutBeneficiary_userId_verificationStatus_idx" ON "PayoutBeneficiary"("userId", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBeneficiary_userId_accountNumber_ifsc_key" ON "PayoutBeneficiary"("userId", "accountNumber", "ifsc");

-- AddForeignKey
ALTER TABLE "PayoutBeneficiary" ADD CONSTRAINT "PayoutBeneficiary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
