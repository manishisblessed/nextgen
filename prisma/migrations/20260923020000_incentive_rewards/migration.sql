-- AlterEnum: add INCENTIVE to WalletReason
ALTER TYPE "WalletReason" ADD VALUE IF NOT EXISTS 'INCENTIVE';

-- CreateEnum
CREATE TYPE "IncentiveRail" AS ENUM ('QR', 'POS', 'PG', 'COMBINED');

-- CreateEnum
CREATE TYPE "IncentiveRewardType" AS ENUM ('CASHBACK_ON_MDR', 'CASHBACK_ON_VOLUME', 'FLAT');

-- CreateEnum
CREATE TYPE "IncentiveVolumeBasis" AS ENUM ('GROSS', 'NET');

-- CreateTable
CREATE TABLE "IncentiveScheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rail" "IncentiveRail" NOT NULL,
    "rewardType" "IncentiveRewardType" NOT NULL DEFAULT 'CASHBACK_ON_MDR',
    "volumeBasis" "IncentiveVolumeBasis" NOT NULL DEFAULT 'GROSS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveTier" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "label" TEXT,
    "minAmount" DECIMAL(14,2) NOT NULL,
    "maxAmount" DECIMAL(14,2) NOT NULL,
    "rewardType" "RateType" NOT NULL DEFAULT 'PERCENT',
    "rewardValue" DECIMAL(14,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIncentiveConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "minAmount" DECIMAL(14,2),
    "rewardValue" DECIMAL(14,6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIncentiveConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentivePayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "tierId" TEXT,
    "periodKey" TEXT NOT NULL,
    "rail" "IncentiveRail" NOT NULL,
    "measuredVolume" DECIMAL(14,2) NOT NULL,
    "mdrPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rewardAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "walletTxnId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncentivePayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveScheme_name_key" ON "IncentiveScheme"("name");

-- CreateIndex
CREATE INDEX "IncentiveScheme_active_rail_idx" ON "IncentiveScheme"("active", "rail");

-- CreateIndex
CREATE INDEX "IncentiveTier_schemeId_active_idx" ON "IncentiveTier"("schemeId", "active");

-- CreateIndex
CREATE INDEX "UserIncentiveConfig_schemeId_active_idx" ON "UserIncentiveConfig"("schemeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "UserIncentiveConfig_userId_schemeId_key" ON "UserIncentiveConfig"("userId", "schemeId");

-- CreateIndex
CREATE INDEX "IncentivePayout_schemeId_periodKey_idx" ON "IncentivePayout"("schemeId", "periodKey");

-- CreateIndex
CREATE INDEX "IncentivePayout_userId_createdAt_idx" ON "IncentivePayout"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncentivePayout_userId_schemeId_periodKey_key" ON "IncentivePayout"("userId", "schemeId", "periodKey");

-- AddForeignKey
ALTER TABLE "IncentiveTier" ADD CONSTRAINT "IncentiveTier_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "IncentiveScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIncentiveConfig" ADD CONSTRAINT "UserIncentiveConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIncentiveConfig" ADD CONSTRAINT "UserIncentiveConfig_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "IncentiveScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePayout" ADD CONSTRAINT "IncentivePayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentivePayout" ADD CONSTRAINT "IncentivePayout_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "IncentiveScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
