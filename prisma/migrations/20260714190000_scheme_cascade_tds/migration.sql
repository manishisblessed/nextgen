-- Hierarchical scheme cascade + TDS on commission credits.

-- AlterTable: Scheme — derivation links (ownerId = deriving network parent,
-- parentSchemeId = the scheme it was derived from).
ALTER TABLE "Scheme" ADD COLUMN     "ownerId" TEXT;
ALTER TABLE "Scheme" ADD COLUMN     "parentSchemeId" TEXT;

-- AlterTable: SchemeSlab — single commission value for the assigned user +
-- link back to the parent-scheme slab it was derived from.
ALTER TABLE "SchemeSlab" ADD COLUMN     "commissionValue" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "SchemeSlab" ADD COLUMN     "parentSlabId" TEXT;

-- AlterTable: MdrScheme — derivation links.
ALTER TABLE "MdrScheme" ADD COLUMN     "ownerId" TEXT;
ALTER TABLE "MdrScheme" ADD COLUMN     "parentSchemeId" TEXT;

-- AlterTable: MdrSlab — link back to the parent-scheme slab.
ALTER TABLE "MdrSlab" ADD COLUMN     "parentSlabId" TEXT;

-- AlterTable: CommissionCredit — TDS breakdown (amount = grossAmount - tdsAmount).
ALTER TABLE "CommissionCredit" ADD COLUMN     "grossAmount" DECIMAL(14,2);
ALTER TABLE "CommissionCredit" ADD COLUMN     "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Backfill legacy commissionValue from the per-tier columns: the assigned
-- user's tier is unknown per-slab, so leave commissionValue at 0 — admin
-- schemes are expected to be re-authored under the cascade model.

-- CreateIndex
CREATE INDEX "Scheme_ownerId_idx" ON "Scheme"("ownerId");
CREATE INDEX "Scheme_parentSchemeId_idx" ON "Scheme"("parentSchemeId");
CREATE INDEX "SchemeSlab_parentSlabId_idx" ON "SchemeSlab"("parentSlabId");
CREATE INDEX "MdrScheme_ownerId_idx" ON "MdrScheme"("ownerId");
CREATE INDEX "MdrScheme_parentSchemeId_idx" ON "MdrScheme"("parentSchemeId");
CREATE INDEX "MdrSlab_parentSlabId_idx" ON "MdrSlab"("parentSlabId");

-- AddForeignKey
ALTER TABLE "Scheme" ADD CONSTRAINT "Scheme_parentSchemeId_fkey" FOREIGN KEY ("parentSchemeId") REFERENCES "Scheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MdrScheme" ADD CONSTRAINT "MdrScheme_parentSchemeId_fkey" FOREIGN KEY ("parentSchemeId") REFERENCES "MdrScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
