-- AlterTable
ALTER TABLE "PosAssignmentLog" ADD COLUMN     "assignedDate" TIMESTAMP(3),
ADD COLUMN     "deliveredDate" TIMESTAMP(3),
ADD COLUMN     "returnReason" TEXT,
ADD COLUMN     "returnedDate" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "transitDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PosAssignmentLog_status_createdAt_idx" ON "PosAssignmentLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PosAssignmentLog_toUserId_action_idx" ON "PosAssignmentLog"("toUserId", "action");

-- CreateIndex
CREATE INDEX "PosAssignmentLog_returnedDate_idx" ON "PosAssignmentLog"("returnedDate");

-- Backfill: stamp effective assignment dates and close superseded assignments
UPDATE "PosAssignmentLog" SET "assignedDate" = "createdAt" WHERE "assignedDate" IS NULL;
UPDATE "PosAssignmentLog" SET "status" = 'EVENT' WHERE "action" <> 'assign';
UPDATE "PosAssignmentLog" l
SET "status" = 'RETURNED',
    "returnedDate" = (SELECT MIN(n."createdAt") FROM "PosAssignmentLog" n WHERE n."machineId" = l."machineId" AND n."createdAt" > l."createdAt")
WHERE l."action" = 'assign'
  AND EXISTS (SELECT 1 FROM "PosAssignmentLog" n WHERE n."machineId" = l."machineId" AND n."createdAt" > l."createdAt");
