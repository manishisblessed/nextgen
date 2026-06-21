-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'REGISTERED', 'VERIFIED', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'MASTER_ADMIN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowedTabs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "parentId" TEXT,
    "invitedById" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "name" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "registeredAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "inviteId" TEXT,
    "type" TEXT NOT NULL,
    "orderid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verifiedName" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_userId_key" ON "Invite"("userId");

-- CreateIndex
CREATE INDEX "Invite_token_idx" ON "Invite"("token");

-- CreateIndex
CREATE INDEX "Invite_invitedById_status_idx" ON "Invite"("invitedById", "status");

-- CreateIndex
CREATE INDEX "Invite_phone_idx" ON "Invite"("phone");

-- CreateIndex
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationResult_orderid_key" ON "VerificationResult"("orderid");

-- CreateIndex
CREATE INDEX "VerificationResult_userId_type_idx" ON "VerificationResult"("userId", "type");

-- CreateIndex
CREATE INDEX "VerificationResult_inviteId_type_idx" ON "VerificationResult"("inviteId", "type");
