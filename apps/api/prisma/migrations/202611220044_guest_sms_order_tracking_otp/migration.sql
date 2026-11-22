-- Additive-only SMS proof store. No order, payment, or customer data is changed.
CREATE TABLE "OrderTrackingOtpChallenge" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "otpDigest" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "requestIpHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderTrackingOtpChallenge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderTrackingOtpChallenge_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 5),
    CONSTRAINT "OrderTrackingOtpChallenge_digest_check" CHECK ("otpDigest" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "OrderTrackingOtpChallenge_orderId_createdAt_idx" ON "OrderTrackingOtpChallenge"("orderId", "createdAt");
CREATE INDEX "OrderTrackingOtpChallenge_requestIpHash_createdAt_idx" ON "OrderTrackingOtpChallenge"("requestIpHash", "createdAt");
CREATE INDEX "OrderTrackingOtpChallenge_expiresAt_idx" ON "OrderTrackingOtpChallenge"("expiresAt");
ALTER TABLE "OrderTrackingOtpChallenge" ADD CONSTRAINT "OrderTrackingOtpChallenge_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
