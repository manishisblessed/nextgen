-- POS machines (Same Day Solution) — local mirror + assignment layer.
-- Additive, non-destructive: new tables + indexes + one FK to "User".

-- CreateTable
CREATE TABLE "PosMachine" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "mid" TEXT,
    "tid" TEXT,
    "serial" TEXT,
    "model" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SAMEDAY',
    "status" TEXT NOT NULL DEFAULT 'active',
    "location" TEXT,
    "city" TEXT,
    "state" TEXT,
    "assignedUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosMachine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosAssignmentLog" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "byUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosAssignmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosMachine_externalId_key" ON "PosMachine"("externalId");

-- CreateIndex
CREATE INDEX "PosMachine_assignedUserId_idx" ON "PosMachine"("assignedUserId");

-- CreateIndex
CREATE INDEX "PosMachine_status_idx" ON "PosMachine"("status");

-- CreateIndex
CREATE INDEX "PosMachine_tid_idx" ON "PosMachine"("tid");

-- CreateIndex
CREATE INDEX "PosAssignmentLog_machineId_createdAt_idx" ON "PosAssignmentLog"("machineId", "createdAt");

-- AddForeignKey
ALTER TABLE "PosMachine" ADD CONSTRAINT "PosMachine_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosAssignmentLog" ADD CONSTRAINT "PosAssignmentLog_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "PosMachine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the Same Day POS service route (idempotent).
INSERT INTO "ServiceRoute" ("id", "key", "name", "type", "kind", "provider", "enabled", "note", "sortOrder", "updatedAt")
VALUES (
    'svcroute_pos_sameday',
    'pos_sameday',
    'POS (Same Day Solution)',
    'SERVICE',
    'POS',
    'SAMEDAY',
    true,
    'POS terminal inventory + transactions via Same Day Solution. Machines are read-only externally; assignment to users is managed locally.',
    60,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
