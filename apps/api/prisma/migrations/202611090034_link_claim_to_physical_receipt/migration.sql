-- R3b: immutable, optional evidence link between a staff physical receipt
-- and an independently accepted customer request. Neither money nor saleable
-- inventory changes here. All activation flags remain OFF by default.
ALTER TABLE "PhysicalReturnReceipt"
  ADD COLUMN "customerClaimId" TEXT
    REFERENCES "CustomerReturnClaim"(id) ON DELETE RESTRICT;
CREATE INDEX "PhysicalReturnReceipt_claim_date_idx"
  ON "PhysicalReturnReceipt"("customerClaimId","receivedAt");

CREATE FUNCTION verify_physical_customer_claim_link() RETURNS trigger AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW."customerClaimId" IS DISTINCT FROM OLD."customerClaimId" THEN
      RAISE EXCEPTION 'physical receipt claim provenance is immutable'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."customerClaimId" IS NOT NULL THEN
    -- The same original-order row serializes customer claim creation,
    -- physical return intake, and direct SQL writers.
    PERFORM 1 FROM "Order" WHERE id=NEW."orderId" FOR UPDATE;
    IF NOT EXISTS(
      SELECT 1 FROM "CustomerReturnClaim" c
      WHERE c.id=NEW."customerClaimId" AND c."orderId"=NEW."orderId"
        AND c.status='accepted'
    ) THEN
      RAISE EXCEPTION 'physical receipt needs accepted customer claim for source order'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER physical_receipt_claim_guard
  BEFORE INSERT OR UPDATE ON "PhysicalReturnReceipt"
  FOR EACH ROW EXECUTE FUNCTION verify_physical_customer_claim_link();

-- R3a's claim reservation already covers accepted return quantities. Once
-- staff physically receives linked goods they must not be counted twice in
-- the remaining customer request balance.
CREATE OR REPLACE FUNCTION verify_customer_claim_aggregate() RETURNS trigger AS $$
DECLARE exceeded BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "CustomerReturnClaimLine" WHERE "claimId"=NEW.id) THEN
    RAISE EXCEPTION 'customer claim requires at least one order line'
      USING ERRCODE='23514';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM "CustomerReturnClaimLine" line
    JOIN "OrderLine" original ON original.id=line."orderLineId"
    JOIN "CustomerReturnClaim" claim ON claim.id=line."claimId"
    WHERE claim.id=NEW.id AND (
      (SELECT COALESCE(sum(other_line.quantity),0)
         FROM "CustomerReturnClaimLine" other_line
         JOIN "CustomerReturnClaim" other_claim ON other_claim.id=other_line."claimId"
        WHERE other_claim."orderId"=claim."orderId"
          AND other_line."orderLineId"=line."orderLineId"
          AND other_claim.status IN ('requested','accepted'))
      +
      (SELECT COALESCE(sum(item.quantity),0)
         FROM "PhysicalReturnItem" item
         JOIN "PhysicalReturnReceipt" receipt ON receipt.id=item."receiptId"
        WHERE receipt."orderId"=claim."orderId"
          AND receipt."customerClaimId" IS NULL
          AND item."orderLineId"=line."orderLineId")
      >
      (SELECT COALESCE(sum(depleted.quantity),0)
        FROM "StockDepletion" dep
        JOIN "StockDepletionLine" depleted ON depleted."depletionId"=dep.id
       WHERE dep."claimType"='order' AND dep."claimId"=claim."orderId"
         AND depleted."claimLineId"=line."orderLineId")
    )
  ) INTO exceeded;
  IF exceeded THEN
    RAISE EXCEPTION 'active claims plus independent physical receipts exceed depleted stock'
      USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

-- An additional deferred receipt-level guard catches forged SQL inserts,
-- missing claimed source lines and aggregate oversubscription. The existing
-- R1 item guard separately caps ALL physical returns by original depletion.
CREATE FUNCTION verify_physical_claim_line_balance() RETURNS trigger AS $$
DECLARE source "PhysicalReturnReceipt"%ROWTYPE;
DECLARE claim_quantity DECIMAL(15,3);
DECLARE linked_quantity DECIMAL(15,3);
DECLARE active_quantity DECIMAL(15,3);
DECLARE unlinked_quantity DECIMAL(15,3);
DECLARE depleted_quantity DECIMAL(15,3);
BEGIN
  SELECT * INTO source FROM "PhysicalReturnReceipt" WHERE id=NEW."receiptId";
  IF source."customerClaimId" IS NOT NULL THEN
    SELECT line.quantity INTO claim_quantity
    FROM "CustomerReturnClaim" claim
    JOIN "CustomerReturnClaimLine" line ON line."claimId"=claim.id
    WHERE claim.id=source."customerClaimId" AND claim."orderId"=source."orderId"
      AND claim.status='accepted' AND line."orderLineId"=NEW."orderLineId";
    IF claim_quantity IS NULL THEN
      RAISE EXCEPTION 'linked physical item is not on the accepted customer request'
        USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(SUM(item.quantity),0) INTO linked_quantity
    FROM "PhysicalReturnItem" item
    JOIN "PhysicalReturnReceipt" receipt ON receipt.id=item."receiptId"
    WHERE receipt."customerClaimId"=source."customerClaimId"
      AND item."orderLineId"=NEW."orderLineId";
    IF linked_quantity>claim_quantity THEN
      RAISE EXCEPTION 'linked physical receipts exceed approved claim line quantity'
        USING ERRCODE='23514';
    END IF;
  END IF;

  SELECT COALESCE(SUM(line.quantity),0) INTO active_quantity
    FROM "CustomerReturnClaimLine" line
    JOIN "CustomerReturnClaim" claim ON claim.id=line."claimId"
   WHERE claim."orderId"=source."orderId"
     AND claim.status IN ('requested','accepted')
     AND line."orderLineId"=NEW."orderLineId";
  SELECT COALESCE(SUM(item.quantity),0) INTO unlinked_quantity
    FROM "PhysicalReturnItem" item
    JOIN "PhysicalReturnReceipt" receipt ON receipt.id=item."receiptId"
   WHERE receipt."orderId"=source."orderId"
     AND receipt."customerClaimId" IS NULL
     AND item."orderLineId"=NEW."orderLineId";
  SELECT COALESCE(SUM(line.quantity),0) INTO depleted_quantity
    FROM "StockDepletionLine" line
    JOIN "StockDepletion" dep ON dep.id=line."depletionId"
   WHERE dep."claimType"='order' AND dep."claimId"=source."orderId"
     AND line."claimLineId"=NEW."orderLineId";
  IF active_quantity+unlinked_quantity>depleted_quantity THEN
    RAISE EXCEPTION 'physical and accepted return quantities exceed depleted stock'
      USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER physical_claim_quantity_at_commit
  AFTER INSERT ON "PhysicalReturnItem" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_physical_claim_line_balance();
