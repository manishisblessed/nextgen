-- CreateEnum
CREATE TYPE "IncentiveLeg" AS ENUM ('INSTANT', 'T1');

-- AlterTable: per-tier instant (T+0) reward rate (0 = fall back to rewardValue)
ALTER TABLE "IncentiveTier" ADD COLUMN "rewardValueT0" DECIMAL(14,6) NOT NULL DEFAULT 0;

-- AlterTable: per-user instant (T+0) rate override
ALTER TABLE "UserIncentiveConfig" ADD COLUMN "rewardValueT0" DECIMAL(14,6);

-- AlterTable: add the settlement leg to payouts. Existing rows (if any) are
-- backfilled as T1 (the pre-split default reward leg), then the default is
-- dropped so the application always supplies the leg explicitly.
ALTER TABLE "IncentivePayout" ADD COLUMN "leg" "IncentiveLeg" NOT NULL DEFAULT 'T1';
ALTER TABLE "IncentivePayout" ALTER COLUMN "leg" DROP DEFAULT;

-- Replace the (user, scheme, period) unique with a per-leg unique so INSTANT and
-- T1 rewards for the same month are independent rows.
DROP INDEX "IncentivePayout_userId_schemeId_periodKey_key";
CREATE UNIQUE INDEX "IncentivePayout_userId_schemeId_periodKey_leg_key" ON "IncentivePayout"("userId", "schemeId", "periodKey", "leg");

-- CreateIndex
CREATE INDEX "IncentivePayout_leg_periodKey_idx" ON "IncentivePayout"("leg", "periodKey");
