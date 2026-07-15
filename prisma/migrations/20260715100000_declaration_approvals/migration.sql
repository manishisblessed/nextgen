-- Baseline migration for the Successor Declaration Approval feature.
--
-- These objects were previously introduced via `prisma db push` and therefore
-- never captured in migration history. This migration reconciles that drift.
-- Every statement is IDEMPOTENT so it is a safe no-op on databases that already
-- have the objects (e.g. production, which was updated via db push) while still
-- fully provisioning a fresh database.

-- ── DocumentType: signed declaration document kinds ─────────────────────────
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SELF_DECLARATION';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SUCCESSOR_DECLARATION';

-- ── DeclarationStatus enum ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeclarationStatus') THEN
    CREATE TYPE "DeclarationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
  END IF;
END
$$;

-- ── DeclarationApproval table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DeclarationApproval" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approverRole" "Role" NOT NULL,
    "onboardeeRole" "Role" NOT NULL,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'PENDING',
    "declarationDocUrl" TEXT,
    "approverSignatureUrl" TEXT,
    "approverSelfieUrl" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalIp" TEXT,
    "approvalUserAgent" TEXT,
    "approvalLatitude" DOUBLE PRECISION,
    "approvalLongitude" DOUBLE PRECISION,
    "rejectedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeclarationApproval_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "DeclarationApproval_inviteId_idx" ON "DeclarationApproval"("inviteId");
CREATE INDEX IF NOT EXISTS "DeclarationApproval_approverId_status_idx" ON "DeclarationApproval"("approverId", "status");

-- ── Foreign keys (ADD CONSTRAINT has no IF NOT EXISTS — guard manually) ──────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeclarationApproval_requestedById_fkey'
  ) THEN
    ALTER TABLE "DeclarationApproval"
      ADD CONSTRAINT "DeclarationApproval_requestedById_fkey"
      FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DeclarationApproval_approverId_fkey'
  ) THEN
    ALTER TABLE "DeclarationApproval"
      ADD CONSTRAINT "DeclarationApproval_approverId_fkey"
      FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
