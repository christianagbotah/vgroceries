CREATE TABLE "InternalTransferRequest" (
 "id" TEXT PRIMARY KEY, "destinationId" TEXT NOT NULL,
 "sourceId" TEXT, "requestedBy" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL, "note" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'requested',
 "version" INTEGER NOT NULL DEFAULT 1, "decidedBy" TEXT, "decisionNote" TEXT,
 "decidedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "InternalTransferRequest_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "InternalTransferRequest_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "InternalTransferRequest_state_check" CHECK (
 ("status" = 'requested' AND "version" = 1 AND "sourceId" IS NULL AND "decidedBy" IS NULL AND "decidedAt" IS NULL AND "decisionNote" IS NULL)
 OR ("status" = 'authorized' AND "version" = 2 AND "sourceId" IS NOT NULL AND "sourceId" <> "destinationId" AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionNote" IS NOT NULL)
 OR ("status" = 'rejected' AND "version" = 2 AND "sourceId" IS NULL AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionNote" IS NOT NULL AND length(trim("decisionNote")) > 0)
 )
);
CREATE UNIQUE INDEX "InternalTransferRequest_requestedBy_requestKey_key" ON "InternalTransferRequest"("requestedBy","requestKey");
CREATE INDEX "InternalTransferRequest_destinationId_status_createdAt_idx" ON "InternalTransferRequest"("destinationId","status","createdAt");
CREATE INDEX "InternalTransferRequest_sourceId_status_createdAt_idx" ON "InternalTransferRequest"("sourceId","status","createdAt");
CREATE TABLE "InternalTransferRequestLine" (
 "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL, "variantId" TEXT NOT NULL,
 "quantity" DECIMAL(15,3) NOT NULL CHECK ("quantity" > 0),
 CONSTRAINT "InternalTransferRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InternalTransferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "InternalTransferRequestLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InternalTransferRequestLine_requestId_variantId_key" ON "InternalTransferRequestLine"("requestId","variantId");
