-- Manual POS slip submissions (Yes Bank & other no-API acquirers).
-- Retailers upload a physical slip for a terminal assigned to them; an admin
-- approves/rejects. On approval the downstream money path (mirror -> payin ->
-- settlement -> commission/TDS) is shared with the automatic (API) POS flow.

CREATE TABLE "PosManualSlip" (
    "id" TEXT NOT NULL,
    "uploaderUserId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "tid" TEXT NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "paymentMode" TEXT NOT NULL DEFAULT 'CARD',
    "rrn" TEXT,
    "authCode" TEXT,
    "cardType" TEXT,
    "brandType" TEXT,
    "txnTime" TIMESTAMP(3),
    "slipPublicId" TEXT NOT NULL,
    "slipFormat" TEXT,
    "slipResourceType" TEXT NOT NULL DEFAULT 'image',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "transactionRef" TEXT,
    "settlementEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosManualSlip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosManualSlip_transactionRef_key" ON "PosManualSlip"("transactionRef");
CREATE INDEX "PosManualSlip_uploaderUserId_status_idx" ON "PosManualSlip"("uploaderUserId", "status");
CREATE INDEX "PosManualSlip_status_createdAt_idx" ON "PosManualSlip"("status", "createdAt");
CREATE INDEX "PosManualSlip_machineId_idx" ON "PosManualSlip"("machineId");
CREATE INDEX "PosManualSlip_tid_idx" ON "PosManualSlip"("tid");

ALTER TABLE "PosManualSlip"
    ADD CONSTRAINT "PosManualSlip_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosManualSlip"
    ADD CONSTRAINT "PosManualSlip_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
