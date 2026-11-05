-- L4: durable customer-only in-app inbox; no external delivery.
CREATE TABLE "Notification" (
 "id" TEXT NOT NULL,
 "recipientUserId" TEXT NOT NULL,
 "orderId" TEXT NOT NULL,
 "sourceEventId" TEXT NOT NULL,
 "kind" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "body" TEXT NOT NULL,
 "readAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Notification_kind_valid" CHECK ("kind" IN ('order','fulfilment','delivery'))
);
CREATE UNIQUE INDEX "Notification_sourceEventId_key" ON "Notification"("sourceEventId");
CREATE INDEX "Notification_recipientUserId_createdAt_id_idx" ON "Notification"("recipientUserId","createdAt","id");
ALTER TABLE "Notification"
 ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "Notification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "Notification_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "NotificationOutboxReceipt" (
 "sourceEventId" TEXT NOT NULL,
 "outcome" TEXT NOT NULL,
 "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "NotificationOutboxReceipt_pkey" PRIMARY KEY ("sourceEventId"),
 CONSTRAINT "NotificationOutboxReceipt_outcome_valid" CHECK ("outcome" IN ('created','no_recipient'))
);
ALTER TABLE "NotificationOutboxReceipt"
 ADD CONSTRAINT "NotificationOutboxReceipt_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
