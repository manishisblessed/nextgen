-- Admin activity control + identity exceptions + TPIN login.
-- Additive-only migration (no destructive changes). The unique-index relaxation
-- for identity fields lives in a SEPARATE, isolated migration
-- (20260906130000_relax_identity_unique_indexes) so it can be reviewed and
-- rolled back independently.

-- ── User: TPIN-login / 2FA-exempt fields ────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN     "twoFactorExempt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "pinLoginEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "pinLoginRiskAcceptedAt" TIMESTAMP(3),
  ADD COLUMN     "pinLoginRiskAcceptedIp" TEXT;

-- ── QrClaim: structured multi-select rejection reasons ──────────────────────
ALTER TABLE "QrClaim"
  ADD COLUMN     "rejectionReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ── AuditLog: actor + geo snapshot columns ──────────────────────────────────
ALTER TABLE "AuditLog"
  ADD COLUMN     "actorName" TEXT,
  ADD COLUMN     "actorRole" TEXT,
  ADD COLUMN     "lat" DOUBLE PRECISION,
  ADD COLUMN     "lng" DOUBLE PRECISION,
  ADD COLUMN     "locationAccuracy" DOUBLE PRECISION,
  ADD COLUMN     "kind" TEXT;

CREATE INDEX "AuditLog_actorRole_createdAt_idx" ON "AuditLog"("actorRole", "createdAt");

-- ── IdentityException: master-admin controlled duplicate-identity exceptions ─
CREATE TYPE "IdentityField" AS ENUM ('PAN', 'AADHAAR', 'BANK_ACCOUNT', 'GSTIN', 'MSME', 'SHOP_NAME');
CREATE TYPE "IdentityExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

CREATE TABLE "IdentityException" (
    "id" TEXT NOT NULL,
    "field" "IdentityField" NOT NULL,
    "value" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "userId" TEXT,
    "inviteId" TEXT,
    "linkedUserId" TEXT,
    "status" "IdentityExceptionStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentityException_field_value_role_key" ON "IdentityException"("field", "value", "role");
CREATE INDEX "IdentityException_field_value_status_idx" ON "IdentityException"("field", "value", "status");
CREATE INDEX "IdentityException_inviteId_idx" ON "IdentityException"("inviteId");
CREATE INDEX "IdentityException_userId_idx" ON "IdentityException"("userId");
CREATE INDEX "IdentityException_status_createdAt_idx" ON "IdentityException"("status", "createdAt");
