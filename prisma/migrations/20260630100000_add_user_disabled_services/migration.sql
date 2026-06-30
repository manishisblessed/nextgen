-- AlterTable
ALTER TABLE "User" ADD COLUMN "disabledServices" TEXT[] DEFAULT ARRAY[]::TEXT[];
