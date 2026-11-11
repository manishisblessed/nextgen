-- AddColumn: refundEligibleAt on Transaction (deferred double-checked refund hold)
ALTER TABLE "Transaction" ADD COLUMN "refundEligibleAt" TIMESTAMP(3);
