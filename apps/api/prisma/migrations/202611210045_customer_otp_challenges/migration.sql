-- OTP lifecycle storage; no plaintext phone or code and no implicit SMS sending.
CREATE TABLE "CustomerOtpChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "recipientFingerprint" TEXT NOT NULL,
  "recipientEncrypted" TEXT NOT NULL,
  "codeDigest" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerOtpChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerOtpChallenge_status_check" CHECK ("status" IN ('pending','consumed','expired','locked')),
  CONSTRAINT "CustomerOtpChallenge_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 5),
  CONSTRAINT "CustomerOtpChallenge_purpose_check" CHECK ("purpose" IN ('phone_verification','sensitive_action'))
);
CREATE INDEX "CustomerOtpChallenge_recipientFingerprint_purpose_createdAt_idx" ON "CustomerOtpChallenge"("recipientFingerprint","purpose","createdAt");
CREATE INDEX "CustomerOtpChallenge_status_expiresAt_idx" ON "CustomerOtpChallenge"("status","expiresAt");
