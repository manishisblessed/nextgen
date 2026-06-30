-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'CANCEL_CHEQUE';
ALTER TYPE "DocumentType" ADD VALUE 'PASSBOOK';

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "aadhaarVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Kyc" ADD COLUMN     "aadhaarAddress" TEXT,
ADD COLUMN     "aadhaarDob" TEXT,
ADD COLUMN     "aadhaarGender" TEXT,
ADD COLUMN     "aadhaarMobile" TEXT,
ADD COLUMN     "aadhaarName" TEXT,
ADD COLUMN     "aadhaarNumber" TEXT,
ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankAccountStatus" TEXT,
ADD COLUMN     "bankIfsc" TEXT,
ADD COLUMN     "msmeNumber" TEXT,
ADD COLUMN     "nameMismatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "panName" TEXT;
