CREATE TABLE "OrderEmailConsent" (
  "orderId" TEXT PRIMARY KEY,
  "recipientFingerprint" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "OrderEmailConsent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderEmailConsent_verified_check" CHECK ("verifiedAt" IS NULL OR "verifiedAt" >= "recordedAt"),
  CONSTRAINT "OrderEmailConsent_revoked_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "recordedAt")
);
CREATE TABLE "OrderEmailStageReceipt" (
  "sourceEventId" TEXT PRIMARY KEY,
  "outcome" TEXT NOT NULL,
  "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderEmailStageReceipt_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderEmailStageReceipt_outcome_check" CHECK ("outcome" IN ('queued','ineligible','expired'))
);
