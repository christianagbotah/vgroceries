-- External notifications are deliberately OFF until provider credentials, consent,
-- encrypted recipient storage and idempotent dispatch are independently verified.
CREATE TABLE "CustomerMessageDelivery" (
  "id" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "recipientFingerprint" TEXT NOT NULL,
  "recipientEncrypted" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "providerMessageId" TEXT,
  "lastErrorCode" TEXT,
  "consentRecordedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerMessageDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerMessageDelivery_channel_check" CHECK ("channel" IN ('sms','email','whatsapp')),
  CONSTRAINT "CustomerMessageDelivery_status_check" CHECK ("status" IN ('pending','sending','delivered','failed','suppressed')),
  CONSTRAINT "CustomerMessageDelivery_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "CustomerMessageDelivery_sourceEventId_channel_recipientFing_key"
  ON "CustomerMessageDelivery"("sourceEventId","channel","recipientFingerprint");
CREATE INDEX "CustomerMessageDelivery_status_nextAttemptAt_idx"
  ON "CustomerMessageDelivery"("status","nextAttemptAt");
