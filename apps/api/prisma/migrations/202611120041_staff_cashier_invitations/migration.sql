-- One-time cashier invitation codes: raw code exists only in the one-time
-- administrator response and recipient's input. Persist only SHA-256 hashes.
-- Invitation acceptance is atomic and never elevates a non-cashier account.
CREATE TABLE "StaffInvitation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "acceptedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffInvitation_userId_key" ON "StaffInvitation"("userId");
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE INDEX "StaffInvitation_expiresAt_idx" ON "StaffInvitation"("expiresAt");
ALTER TABLE "StaffInvitation"
  ADD CONSTRAINT "StaffInvitation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
