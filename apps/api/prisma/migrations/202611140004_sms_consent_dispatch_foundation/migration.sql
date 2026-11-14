-- Opt-in status only. Existing customers must not be subscribed retroactively.
ALTER TABLE "Order" ADD COLUMN "smsUpdatesOptIn" BOOLEAN NOT NULL DEFAULT false;

-- Durable one-event/one-message decision and provider delivery evidence.
CREATE TABLE "SmsDispatch" (
  "id" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "orderId" TEXT,
  "recipientPhone" TEXT,
  "body" TEXT,
  "state" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "failureCode" TEXT,
  "attemptedAt" TIMESTAMPTZ(3),
  "acceptedAt" TIMESTAMPTZ(3),
  "lastStatusAt" TIMESTAMPTZ(3),
  "deliveryConfirmedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SmsDispatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SmsDispatch_sourceEventId_key" UNIQUE ("sourceEventId"),
  CONSTRAINT "SmsDispatch_providerMessageId_key" UNIQUE ("providerMessageId"),
  CONSTRAINT "SmsDispatch_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SmsDispatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SmsDispatch_state_check" CHECK ("state" IN ('suppressed','pending','in_flight','accepted','delivered','failed','rejected','unknown'))
);
CREATE INDEX "SmsDispatch_state_createdAt_idx" ON "SmsDispatch"("state", "createdAt");
CREATE INDEX "SmsDispatch_orderId_createdAt_idx" ON "SmsDispatch"("orderId", "createdAt");
