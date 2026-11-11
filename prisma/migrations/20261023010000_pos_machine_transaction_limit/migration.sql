-- AlterTable: Add per-machine monthly transaction-volume cap to PosMachine
ALTER TABLE "PosMachine" ADD COLUMN "transactionLimit" DECIMAL(14,2);

-- AlterTable: Add per-user POS machine monthly cap to UserLimit
ALTER TABLE "UserLimit" ADD COLUMN "posMachineTransactionLimit" DECIMAL(14,2);
