-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING_DECLARATION', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "HierarchyTransfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldParentId" TEXT NOT NULL,
    "newParentId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING_DECLARATION',
    "reason" TEXT,
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
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HierarchyTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HierarchyTransfer_userId_idx" ON "HierarchyTransfer"("userId");

-- CreateIndex
CREATE INDEX "HierarchyTransfer_newParentId_status_idx" ON "HierarchyTransfer"("newParentId", "status");

-- CreateIndex
CREATE INDEX "HierarchyTransfer_status_idx" ON "HierarchyTransfer"("status");

-- AddForeignKey
ALTER TABLE "HierarchyTransfer" ADD CONSTRAINT "HierarchyTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HierarchyTransfer" ADD CONSTRAINT "HierarchyTransfer_oldParentId_fkey" FOREIGN KEY ("oldParentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HierarchyTransfer" ADD CONSTRAINT "HierarchyTransfer_newParentId_fkey" FOREIGN KEY ("newParentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HierarchyTransfer" ADD CONSTRAINT "HierarchyTransfer_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
