-- Phase 0 — Secure foundation (additive, non-destructive)

-- AlterEnum
ALTER TYPE "WalletReason" ADD VALUE 'PAYOUT';

-- CreateEnum
CREATE TYPE "ServiceRouteType" AS ENUM ('SERVICE', 'CONFIG', 'SETTING');

-- CreateEnum
CREATE TYPE "ServiceRouteKind" AS ENUM ('PG', 'POS', 'BBPS', 'PAYOUT', 'QR', 'UPI', 'RECHARGE', 'AEPS', 'DMT', 'TRAVEL', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "heldBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WalletTxn" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "ServiceRoute" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ServiceRouteType" NOT NULL DEFAULT 'SERVICE',
    "kind" "ServiceRouteKind" NOT NULL DEFAULT 'OTHER',
    "provider" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "balance" DECIMAL(14,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletTxn_idempotencyKey_key" ON "WalletTxn"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRoute_key_key" ON "ServiceRoute"("key");

-- CreateIndex
CREATE INDEX "ServiceRoute_type_enabled_idx" ON "ServiceRoute"("type", "enabled");

-- CreateIndex
CREATE INDEX "ServiceRoute_kind_enabled_idx" ON "ServiceRoute"("kind", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_scope_createdAt_idx" ON "IdempotencyKey"("scope", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");
