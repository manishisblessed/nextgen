-- Scheme Manager (named charge/commission slab groupings) — additive, non-destructive.

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('FLAT', 'PERCENT');

-- AlterTable: assign a scheme to a user (nullable; null = platform default scheme)
ALTER TABLE "User" ADD COLUMN "schemeId" TEXT;

-- CreateTable
CREATE TABLE "Scheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchemeSlab" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "service" "ServiceCode" NOT NULL,
    "minAmount" DECIMAL(14,2) NOT NULL,
    "maxAmount" DECIMAL(14,2) NOT NULL,
    "chargeType" "RateType" NOT NULL DEFAULT 'FLAT',
    "chargeValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "commissionType" "RateType" NOT NULL DEFAULT 'PERCENT',
    "commissionRetailer" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "commissionDistributor" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "commissionMaster" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchemeSlab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Scheme_name_key" ON "Scheme"("name");

-- CreateIndex
CREATE INDEX "Scheme_active_idx" ON "Scheme"("active");

-- CreateIndex
CREATE INDEX "Scheme_isDefault_idx" ON "Scheme"("isDefault");

-- CreateIndex
CREATE INDEX "SchemeSlab_schemeId_service_active_idx" ON "SchemeSlab"("schemeId", "service", "active");

-- CreateIndex
CREATE INDEX "User_schemeId_idx" ON "User"("schemeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "Scheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheme" ADD CONSTRAINT "Scheme_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeSlab" ADD CONSTRAINT "SchemeSlab_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "Scheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
