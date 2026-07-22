-- Revenue wallet + chain (DT/MD/SD) commission funded from MDR margin + TDS ledger.

-- AlterEnum: revenue wallet book.
ALTER TYPE "WalletType" ADD VALUE IF NOT EXISTS 'REVENUE';

-- AlterEnum: new wallet reasons for the revenue-wallet-funded commission flow.
ALTER TYPE "WalletReason" ADD VALUE IF NOT EXISTS 'MDR_MARGIN';
ALTER TYPE "WalletReason" ADD VALUE IF NOT EXISTS 'COMMISSION_PAYOUT';
ALTER TYPE "WalletReason" ADD VALUE IF NOT EXISTS 'TDS_WITHHELD';

-- AlterTable: User — company revenue wallet balance (platform account only).
ALTER TABLE "User" ADD COLUMN "revenueBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable: MdrSlab — vendor/acquirer cost per band (revenue = mdrValue − vendorCharge).
ALTER TABLE "MdrSlab" ADD COLUMN "vendorCharge" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "MdrSlab" ADD COLUMN "vendorChargeT0" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- CreateTable: TDS liability ledger.
CREATE TABLE "TdsLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT,
    "commissionCreditId" TEXT,
    "service" "ServiceCode" NOT NULL,
    "tier" TEXT NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "tdsRate" DECIMAL(6,4) NOT NULL DEFAULT 0.02,
    "tdsAmount" DECIMAL(14,2) NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TdsLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TdsLedgerEntry_idempotencyKey_key" ON "TdsLedgerEntry"("idempotencyKey");
CREATE INDEX "TdsLedgerEntry_userId_createdAt_idx" ON "TdsLedgerEntry"("userId", "createdAt");
CREATE INDEX "TdsLedgerEntry_transactionId_idx" ON "TdsLedgerEntry"("transactionId");
CREATE INDEX "TdsLedgerEntry_service_createdAt_idx" ON "TdsLedgerEntry"("service", "createdAt");

-- AddForeignKey
ALTER TABLE "TdsLedgerEntry" ADD CONSTRAINT "TdsLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
