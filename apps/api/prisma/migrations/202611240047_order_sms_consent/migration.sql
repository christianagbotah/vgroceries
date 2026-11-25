CREATE TABLE "OrderSmsConsent" (
    "orderId" TEXT NOT NULL,
    "recipientFingerprint" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    CONSTRAINT "OrderSmsConsent_pkey" PRIMARY KEY ("orderId"),
    CONSTRAINT "OrderSmsConsent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderSmsConsent_fingerprint_check" CHECK ("recipientFingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "OrderSmsConsent_policy_check" CHECK ("policyVersion" = 'order-sms-v1'),
    CONSTRAINT "OrderSmsConsent_revoked_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "recordedAt")
);
-- No backfill. Existing orders are not opted in.
