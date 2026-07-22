-- Wallet lien: admin-placed freeze + eager recovery for chargebacks / fraud.

-- AlterEnum: new ledger reason for lien recovery sweeps.
ALTER TYPE "WalletReason" ADD VALUE IF NOT EXISTS 'LIEN';

-- CreateEnum: lien lifecycle.
DO $$ BEGIN
  CREATE TYPE "WalletLienStatus" AS ENUM ('ACTIVE', 'RECOVERED', 'RELEASED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable: User — frozen (invisible) lien balance.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lienBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable: WalletLien.
CREATE TABLE "WalletLien" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "recoveredAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reasonCode" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,
    "status" "WalletLienStatus" NOT NULL DEFAULT 'ACTIVE',
    "refType" TEXT,
    "refId" TEXT,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletLien_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletLien_targetUserId_status_idx" ON "WalletLien"("targetUserId", "status");
CREATE INDEX "WalletLien_status_createdAt_idx" ON "WalletLien"("status", "createdAt");
CREATE INDEX "WalletLien_refType_refId_idx" ON "WalletLien"("refType", "refId");

-- AddForeignKey
ALTER TABLE "WalletLien" ADD CONSTRAINT "WalletLien_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletLien" ADD CONSTRAINT "WalletLien_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
