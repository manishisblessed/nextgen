-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WalletReason" ADD VALUE 'POS_SETTLEMENT';
ALTER TYPE "WalletReason" ADD VALUE 'PARENT_PUSH';
ALTER TYPE "WalletReason" ADD VALUE 'PARENT_PULL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "instantSettlement" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CommissionCredit" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "walletTxnId" TEXT,
    "schemeId" TEXT,
    "service" "ServiceCode" NOT NULL,
    "txnAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSettlementEntry" (
    "id" TEXT NOT NULL,
    "transactionRef" TEXT NOT NULL,
    "machineId" TEXT,
    "userId" TEXT NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "mdrAmount" DECIMAL(14,2) NOT NULL,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "walletTxnId" TEXT,
    "paymentMode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosSettlementEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkWalletTransfer" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkWalletTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionCredit_transactionId_idx" ON "CommissionCredit"("transactionId");

-- CreateIndex
CREATE INDEX "CommissionCredit_userId_createdAt_idx" ON "CommissionCredit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionCredit_userId_service_createdAt_idx" ON "CommissionCredit"("userId", "service", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PosSettlementEntry_transactionRef_key" ON "PosSettlementEntry"("transactionRef");

-- CreateIndex
CREATE INDEX "PosSettlementEntry_userId_createdAt_idx" ON "PosSettlementEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PosSettlementEntry_status_createdAt_idx" ON "PosSettlementEntry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NetworkWalletTransfer_fromId_createdAt_idx" ON "NetworkWalletTransfer"("fromId", "createdAt");

-- CreateIndex
CREATE INDEX "NetworkWalletTransfer_toId_createdAt_idx" ON "NetworkWalletTransfer"("toId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommissionCredit" ADD CONSTRAINT "CommissionCredit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionCredit" ADD CONSTRAINT "CommissionCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSettlementEntry" ADD CONSTRAINT "PosSettlementEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkWalletTransfer" ADD CONSTRAINT "NetworkWalletTransfer_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkWalletTransfer" ADD CONSTRAINT "NetworkWalletTransfer_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
