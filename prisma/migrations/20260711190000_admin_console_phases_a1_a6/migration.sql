-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('PRIMARY', 'AEPS');

-- CreateEnum
CREATE TYPE "WalletOperationType" AS ENUM ('PUSH', 'PULL');

-- CreateEnum
CREATE TYPE "WalletOperationStatus" AS ENUM ('PENDING_APPROVAL', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MdrServiceKind" AS ENUM ('POS', 'PG', 'QR', 'UPI');

-- CreateEnum
CREATE TYPE "ReversalKind" AS ENUM ('TRANSACTION', 'SETTLEMENT', 'AEPS', 'WALLET_ENTRY');

-- CreateEnum
CREATE TYPE "ReversalStatus" AS ENUM ('PENDING_APPROVAL', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettlementRunStatus" AS ENUM ('SUCCESS', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "PosSubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PosInvoiceStatus" AS ENUM ('PAID', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "AepsMerchantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AepsAccountStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AepsSettlementStatus" AS ENUM ('PROCESSING', 'SUCCESS', 'FAILED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'FINANCE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WalletReason" ADD VALUE 'SETTLEMENT';
ALTER TYPE "WalletReason" ADD VALUE 'AEPS_SETTLEMENT';
ALTER TYPE "WalletReason" ADD VALUE 'RENTAL';

-- AlterTable
ALTER TABLE "PosMachine" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "company" TEXT,
ADD COLUMN     "condition" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'SYNC';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aepsBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "mdrSchemeId" TEXT;

-- AlterTable
ALTER TABLE "WalletTxn" ADD COLUMN     "walletType" "WalletType" NOT NULL DEFAULT 'PRIMARY';

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletOperation" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "WalletOperationType" NOT NULL,
    "walletType" "WalletType" NOT NULL DEFAULT 'PRIMARY',
    "amount" DECIMAL(14,2) NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,
    "status" "WalletOperationStatus" NOT NULL DEFAULT 'COMPLETED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedNote" TEXT,
    "walletTxnId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdrScheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MdrScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdrSlab" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "serviceKind" "MdrServiceKind" NOT NULL,
    "paymentMode" TEXT NOT NULL DEFAULT '*',
    "minAmount" DECIMAL(14,2) NOT NULL,
    "maxAmount" DECIMAL(14,2) NOT NULL,
    "mdrType" "RateType" NOT NULL DEFAULT 'PERCENT',
    "mdrValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "commissionType" "RateType" NOT NULL DEFAULT 'PERCENT',
    "commissionRetailer" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "commissionDistributor" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "commissionMaster" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "commissionSuperDistributor" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MdrSlab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLimit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletCap" DECIMAL(14,2),
    "dailyTxnAmountCap" DECIMAL(14,2),
    "dailyTxnCountCap" INTEGER,
    "settlementDailyCap" DECIMAL(14,2),
    "settlementPerTxnCap" DECIMAL(14,2),
    "settlementTier" TEXT,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reversal" (
    "id" TEXT NOT NULL,
    "kind" "ReversalKind" NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "refLabel" TEXT,
    "targetUserId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "direction" "WalletDirection" NOT NULL,
    "walletType" "WalletType" NOT NULL DEFAULT 'PRIMARY',
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReversalStatus" NOT NULL DEFAULT 'COMPLETED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedNote" TEXT,
    "walletTxnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reversal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettlementConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autoSettleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pausedUntil" TIMESTAMP(3),
    "pausedReason" TEXT,
    "keepBalance" DECIMAL(14,2),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettlementConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'CRON',
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SettlementRunStatus" NOT NULL,
    "detail" TEXT,
    "walletTxnDebitId" TEXT,
    "walletTxnCreditId" TEXT,
    "ranById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementAlert" (
    "id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" JSONB,
    "userId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosRentalPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyRent" DECIMAL(14,2) NOT NULL,
    "setupFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deposit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosRentalPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSubscription" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "PosSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "billingDay" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosRentalInvoice" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "PosInvoiceStatus" NOT NULL,
    "detail" TEXT,
    "walletTxnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosRentalInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AepsMerchant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMerchantId" TEXT,
    "status" "AepsMerchantStatus" NOT NULL DEFAULT 'PENDING',
    "meta" JSONB,
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AepsMerchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AepsSettlementAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "bankName" TEXT,
    "status" "AepsAccountStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "pennyDropVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AepsSettlementAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AepsSettlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "charge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" "AepsSettlementStatus" NOT NULL DEFAULT 'PROCESSING',
    "utr" TEXT,
    "detail" TEXT,
    "walletTxnDebitId" TEXT,
    "walletTxnCreditId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AepsSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "WalletOperation_walletTxnId_key" ON "WalletOperation"("walletTxnId");

-- CreateIndex
CREATE INDEX "WalletOperation_targetUserId_createdAt_idx" ON "WalletOperation"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletOperation_actorId_createdAt_idx" ON "WalletOperation"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletOperation_status_createdAt_idx" ON "WalletOperation"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MdrScheme_name_key" ON "MdrScheme"("name");

-- CreateIndex
CREATE INDEX "MdrScheme_active_idx" ON "MdrScheme"("active");

-- CreateIndex
CREATE INDEX "MdrScheme_isDefault_idx" ON "MdrScheme"("isDefault");

-- CreateIndex
CREATE INDEX "MdrSlab_schemeId_serviceKind_active_idx" ON "MdrSlab"("schemeId", "serviceKind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "UserLimit_userId_key" ON "UserLimit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Reversal_walletTxnId_key" ON "Reversal"("walletTxnId");

-- CreateIndex
CREATE INDEX "Reversal_targetUserId_createdAt_idx" ON "Reversal"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Reversal_status_createdAt_idx" ON "Reversal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Reversal_refType_refId_idx" ON "Reversal"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettlementConfig_userId_key" ON "UserSettlementConfig"("userId");

-- CreateIndex
CREATE INDEX "SettlementRun_userId_createdAt_idx" ON "SettlementRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SettlementRun_status_createdAt_idx" ON "SettlementRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRun_userId_dayKey_trigger_key" ON "SettlementRun"("userId", "dayKey", "trigger");

-- CreateIndex
CREATE INDEX "SettlementAlert_readAt_createdAt_idx" ON "SettlementAlert"("readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PosRentalPlan_name_key" ON "PosRentalPlan"("name");

-- CreateIndex
CREATE INDEX "PosSubscription_userId_status_idx" ON "PosSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "PosSubscription_machineId_idx" ON "PosSubscription"("machineId");

-- CreateIndex
CREATE INDEX "PosSubscription_status_billingDay_idx" ON "PosSubscription"("status", "billingDay");

-- CreateIndex
CREATE UNIQUE INDEX "PosRentalInvoice_walletTxnId_key" ON "PosRentalInvoice"("walletTxnId");

-- CreateIndex
CREATE INDEX "PosRentalInvoice_status_createdAt_idx" ON "PosRentalInvoice"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PosRentalInvoice_subscriptionId_periodKey_key" ON "PosRentalInvoice"("subscriptionId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "AepsMerchant_userId_key" ON "AepsMerchant"("userId");

-- CreateIndex
CREATE INDEX "AepsMerchant_status_idx" ON "AepsMerchant"("status");

-- CreateIndex
CREATE INDEX "AepsSettlementAccount_userId_status_idx" ON "AepsSettlementAccount"("userId", "status");

-- CreateIndex
CREATE INDEX "AepsSettlementAccount_status_createdAt_idx" ON "AepsSettlementAccount"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AepsSettlement_userId_createdAt_idx" ON "AepsSettlement"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AepsSettlement_status_createdAt_idx" ON "AepsSettlement"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PosMachine_source_idx" ON "PosMachine"("source");

-- CreateIndex
CREATE INDEX "User_mdrSchemeId_idx" ON "User"("mdrSchemeId");

-- CreateIndex
CREATE INDEX "WalletTxn_walletType_createdAt_idx" ON "WalletTxn"("walletType", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTxn_reason_createdAt_idx" ON "WalletTxn"("reason", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_mdrSchemeId_fkey" FOREIGN KEY ("mdrSchemeId") REFERENCES "MdrScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletOperation" ADD CONSTRAINT "WalletOperation_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletOperation" ADD CONSTRAINT "WalletOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletOperation" ADD CONSTRAINT "WalletOperation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdrSlab" ADD CONSTRAINT "MdrSlab_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "MdrScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLimit" ADD CONSTRAINT "UserLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reversal" ADD CONSTRAINT "Reversal_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reversal" ADD CONSTRAINT "Reversal_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettlementConfig" ADD CONSTRAINT "UserSettlementConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSubscription" ADD CONSTRAINT "PosSubscription_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "PosMachine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSubscription" ADD CONSTRAINT "PosSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSubscription" ADD CONSTRAINT "PosSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PosRentalPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosRentalInvoice" ADD CONSTRAINT "PosRentalInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PosSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AepsMerchant" ADD CONSTRAINT "AepsMerchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AepsSettlementAccount" ADD CONSTRAINT "AepsSettlementAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AepsSettlement" ADD CONSTRAINT "AepsSettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
