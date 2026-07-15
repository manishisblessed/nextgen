-- Per-brand MDR & settlement:
--   Brand              — teachway/lagoon/avika grouping with a default settlement mode
--   BrandMdrRate       — per (provider, paymentMode, amount band) MDR rate card
--   PosMachine.brandId — links a terminal to its brand
--   PosSettlementEntry.{brandId, provider, mdrRateId} — pricing context per capture

-- Brand
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "settlementMode" TEXT NOT NULL DEFAULT 'T1',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Brand_key_key" ON "Brand"("key");
CREATE INDEX "Brand_active_idx" ON "Brand"("active");

-- BrandMdrRate
CREATE TABLE "BrandMdrRate" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '*',
    "paymentMode" TEXT NOT NULL DEFAULT '*',
    "minAmount" DECIMAL(14,2) NOT NULL,
    "maxAmount" DECIMAL(14,2) NOT NULL,
    "mdrType" "RateType" NOT NULL DEFAULT 'PERCENT',
    "mdrValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "mdrValueT0" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandMdrRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BrandMdrRate_brandId_provider_active_idx" ON "BrandMdrRate"("brandId", "provider", "active");

ALTER TABLE "BrandMdrRate"
    ADD CONSTRAINT "BrandMdrRate_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PosMachine.brandId
ALTER TABLE "PosMachine" ADD COLUMN "brandId" TEXT;
CREATE INDEX "PosMachine_brandId_idx" ON "PosMachine"("brandId");
ALTER TABLE "PosMachine"
    ADD CONSTRAINT "PosMachine_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PosSettlementEntry pricing context
ALTER TABLE "PosSettlementEntry" ADD COLUMN "brandId" TEXT;
ALTER TABLE "PosSettlementEntry" ADD COLUMN "provider" TEXT;
ALTER TABLE "PosSettlementEntry" ADD COLUMN "mdrRateId" TEXT;
CREATE INDEX "PosSettlementEntry_brandId_idx" ON "PosSettlementEntry"("brandId");
ALTER TABLE "PosSettlementEntry"
    ADD CONSTRAINT "PosSettlementEntry_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
