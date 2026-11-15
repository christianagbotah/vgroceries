-- Cashier customer identity, captured immutably at sale completion.
-- Default old receipts to walk-in; does NOT manufacture customer accounts.
ALTER TABLE "PosCashSale"
  ADD COLUMN "customerMode" TEXT NOT NULL DEFAULT 'walk_in',
  ADD COLUMN "customerUserId" TEXT,
  ADD COLUMN "customerName" TEXT NOT NULL DEFAULT 'Walk-in Customer',
  ADD COLUMN "customerPhone" TEXT;
ALTER TABLE "PosCashSale"
  ADD CONSTRAINT "PosCashSale_customerUserId_fkey"
  FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PosCashSale"
  ADD CONSTRAINT "PosCashSale_customerMode_check"
  CHECK ("customerMode" IN ('walk_in','existing','named'));
CREATE INDEX "PosCashSale_customerUserId_createdAt_idx"
  ON "PosCashSale"("customerUserId","createdAt");
