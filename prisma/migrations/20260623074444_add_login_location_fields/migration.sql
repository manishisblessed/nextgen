-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginLat" DOUBLE PRECISION,
ADD COLUMN     "lastLoginLng" DOUBLE PRECISION,
ADD COLUMN     "twoFactorBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "twoFactorSecret" TEXT,
ADD COLUMN     "twoFactorVerifiedAt" TIMESTAMP(3);
