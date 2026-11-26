CREATE TABLE "OrderSmsStageReceipt" (
  "sourceEventId" TEXT PRIMARY KEY,
  "outcome" TEXT NOT NULL,
  "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderSmsStageReceipt_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderSmsStageReceipt_outcome_check" CHECK ("outcome" IN ('queued','ineligible','expired'))
);
