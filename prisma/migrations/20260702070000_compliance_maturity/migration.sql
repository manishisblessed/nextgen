-- AlterTable
ALTER TABLE "KycVideo" ADD COLUMN     "purgedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AmlAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dateKey" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmlAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditAnchor" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "firstRowId" TEXT,
    "lastRowId" TEXT,
    "rootHash" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,
    "chainHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmlAlert_status_createdAt_idx" ON "AmlAlert"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AmlAlert_userId_createdAt_idx" ON "AmlAlert"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AmlAlert_userId_rule_dateKey_key" ON "AmlAlert"("userId", "rule", "dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuditAnchor_dateKey_key" ON "AuditAnchor"("dateKey");

-- AddForeignKey
ALTER TABLE "AmlAlert" ADD CONSTRAINT "AmlAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmlAlert" ADD CONSTRAINT "AmlAlert_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only enforcement (Phase 5): audit history can never be rewritten or
-- deleted through the application role. Combined with the daily hash-chain
-- anchor (AuditAnchor), any tampering is both prevented and detectable.
CREATE OR REPLACE FUNCTION forbid_append_only_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditlog_append_only ON "AuditLog";
CREATE TRIGGER auditlog_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();

DROP TRIGGER IF EXISTS auditanchor_append_only ON "AuditAnchor";
CREATE TRIGGER auditanchor_append_only
  BEFORE UPDATE OR DELETE ON "AuditAnchor"
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();

