-- AlterEnum: add PAYOUT to ServiceCode
ALTER TYPE "ServiceCode" ADD VALUE IF NOT EXISTS 'PAYOUT';
