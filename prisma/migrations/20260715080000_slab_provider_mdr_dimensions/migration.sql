-- Slab dimensions (Same Day parity):
--   SchemeSlab.provider          — per-provider slabs (BBPS 1 vs BBPS 2, ...); NULL = any provider
--   MdrSlab.company/cardType/... — per-POS-company + card-dimension MDR rates; NULL = any
--   MdrSlab.mdrValueT0           — instant (T+0) settlement rate; 0 = unset, falls back to mdrValue

-- SchemeSlab: provider dimension
ALTER TABLE "SchemeSlab" ADD COLUMN "provider" TEXT;

-- MdrSlab: company/card dimensions + T+0 rate
ALTER TABLE "MdrSlab" ADD COLUMN "company" TEXT;
ALTER TABLE "MdrSlab" ADD COLUMN "cardType" TEXT;
ALTER TABLE "MdrSlab" ADD COLUMN "brandType" TEXT;
ALTER TABLE "MdrSlab" ADD COLUMN "classification" TEXT;
ALTER TABLE "MdrSlab" ADD COLUMN "mdrValueT0" DECIMAL(14,4) NOT NULL DEFAULT 0;
