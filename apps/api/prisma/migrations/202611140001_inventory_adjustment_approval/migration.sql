CREATE TABLE "StockAdjustment" (
  "id" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "delta" DECIMAL(15,3) NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending_approval',
  "requestedBy" TEXT NOT NULL,
  "decidedBy" TEXT,
  "beforeQuantity" DECIMAL(15,3) NOT NULL,
  "afterQuantity" DECIMAL(15,3),
  "movementReceiptId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMPTZ(3),
  CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockAdjustment_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockAdjustment_status_check" CHECK ("status" IN ('pending_approval','approved','rejected')),
  CONSTRAINT "StockAdjustment_nonzero_delta_check" CHECK ("delta" <> 0),
  CONSTRAINT "StockAdjustment_quantity_nonnegative_check" CHECK ("beforeQuantity" >= 0 AND ("afterQuantity" IS NULL OR "afterQuantity" >= 0)),
  CONSTRAINT "StockAdjustment_terminal_check" CHECK (
    ("status"='pending_approval' AND "decidedBy" IS NULL AND "decidedAt" IS NULL AND "afterQuantity" IS NULL AND "movementReceiptId" IS NULL)
    OR ("status"='rejected' AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "afterQuantity" IS NULL AND "movementReceiptId" IS NULL)
    OR ("status"='approved' AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "afterQuantity" IS NOT NULL AND "movementReceiptId" IS NOT NULL)
  )
);
CREATE INDEX "StockAdjustment_locationId_status_createdAt_idx" ON "StockAdjustment"("locationId","status","createdAt");
CREATE INDEX "StockAdjustment_lotId_createdAt_idx" ON "StockAdjustment"("lotId","createdAt");
