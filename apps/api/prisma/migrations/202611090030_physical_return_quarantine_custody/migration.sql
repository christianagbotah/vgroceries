-- Physical Returns R2a: non-sellable, immutable return quarantine custody.
-- Every stock lot must be linked to an inspected returned line, original depleted
-- source lot, inventory stock receipt and a matching stock movement.
-- Extend only the existing enumerated lot kind check. Keep all original
-- regular/returns_quarantine/damaged/disposal values and existing guards.
ALTER TABLE "StockLot" DROP CONSTRAINT lot_kind;
ALTER TABLE "StockLot" ADD CONSTRAINT lot_kind
  CHECK (kind IN ('regular','returns_quarantine','damaged','disposal','physical_return_quarantine'));

CREATE TABLE "PhysicalReturnCustody" (
  "itemId" TEXT NOT NULL REFERENCES "PhysicalReturnItem"(id) ON DELETE RESTRICT,
  "sourceLotId" TEXT NOT NULL REFERENCES "StockLot"(id) ON DELETE RESTRICT,
  "quarantineLotId" TEXT NOT NULL UNIQUE REFERENCES "StockLot"(id) ON DELETE RESTRICT,
  "stockReceiptId" TEXT NOT NULL REFERENCES "StockReceipt"(id) ON DELETE RESTRICT,
  quantity DECIMAL(15,3) NOT NULL,
  "custodyNote" TEXT NOT NULL,
  "recordedBy" TEXT NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "PhysicalReturnCustody_pkey" PRIMARY KEY ("itemId"),
  CONSTRAINT "PhysicalReturnCustody_positive_quantity" CHECK (quantity>0),
  CONSTRAINT "PhysicalReturnCustody_custody_note" CHECK (char_length(btrim("custodyNote")) BETWEEN 15 AND 1000)
);
CREATE INDEX "PhysicalReturnCustody_stockReceiptId_idx" ON "PhysicalReturnCustody"("stockReceiptId");

CREATE FUNCTION validate_physical_return_custody() RETURNS trigger AS $$
DECLARE
  source_count INTEGER;
  source_quantity DECIMAL(15,3);
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'return quarantine custody evidence is immutable'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "PhysicalReturnItem" item
      JOIN "PhysicalReturnReceipt" r ON r.id=item."receiptId"
      JOIN "StockLot" q ON q.id=NEW."quarantineLotId"
      JOIN "StockPosition" pos ON pos.id=q."positionId"
      JOIN "StockLot" source ON source.id=NEW."sourceLotId"
      JOIN "StockPosition" source_pos ON source_pos.id=source."positionId"
      JOIN "StockReceipt" receipt ON receipt.id=NEW."stockReceiptId"
    WHERE item.id=NEW."itemId"
      AND item.disposition='quarantine' AND item."inspectedAt" IS NOT NULL
      AND r.status='inspected' AND r."inspectedAt" IS NOT NULL
      AND NEW.quantity=item.quantity
      AND q.kind='physical_return_quarantine' AND q.quarantined=true
      AND q."receiptId"=receipt.id AND q.quantity=NEW.quantity
      AND pos."variantId"=item."variantId" AND pos."locationId"=r."locationId"
      AND source_pos."variantId"=item."variantId"
      AND source_pos."locationId"=r."locationId"
      AND q."expiryDate" IS NOT DISTINCT FROM source."expiryDate"
      AND q."unitCostMinor" IS NOT DISTINCT FROM source."unitCostMinor"
  ) THEN
    RAISE EXCEPTION 'return quarantine custody does not match inspected goods and stock source'
      USING ERRCODE='23514';
  END IF;
  SELECT count(DISTINCT dl."lotId"), COALESCE(sum(dl.quantity),0)
     INTO source_count,source_quantity
    FROM "PhysicalReturnItem" item
    JOIN "PhysicalReturnReceipt" r ON r.id=item."receiptId"
    JOIN "StockDepletion" d ON d."claimType"='order' AND d."claimId"=r."orderId"
    JOIN "StockDepletionLine" dl ON dl."depletionId"=d.id
      AND dl."claimLineId"=item."orderLineId" AND dl."variantId"=item."variantId"
    WHERE item.id=NEW."itemId";
  IF source_count<>1 OR NOT EXISTS (
    SELECT 1 FROM "PhysicalReturnItem" item
    JOIN "PhysicalReturnReceipt" r ON r.id=item."receiptId"
    JOIN "StockDepletion" d ON d."claimType"='order' AND d."claimId"=r."orderId"
    JOIN "StockDepletionLine" dl ON dl."depletionId"=d.id
      AND dl."claimLineId"=item."orderLineId" AND dl."lotId"=NEW."sourceLotId"
    WHERE item.id=NEW."itemId"
  ) OR NEW.quantity>source_quantity THEN
    RAISE EXCEPTION 'return lacks a single, verified original depleted stock lot'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER verify_physical_return_custody
  BEFORE INSERT OR UPDATE OR DELETE ON "PhysicalReturnCustody"
  FOR EACH ROW EXECUTE FUNCTION validate_physical_return_custody();

-- A new quarantine stock lot must become evidence-linked in the same DB
-- transaction, preventing direct creation of unproven off-sale stock.
CREATE FUNCTION verify_return_quarantine_lot_at_commit() RETURNS trigger AS $$
BEGIN
  IF NEW.kind='physical_return_quarantine' AND NOT EXISTS(
    SELECT 1 FROM "PhysicalReturnCustody" c
      WHERE c."quarantineLotId"=NEW.id AND c.quantity=NEW.quantity
  ) THEN
    RAISE EXCEPTION 'unlinked returned goods quarantine lot'
      USING ERRCODE='23514';
  END IF;
  IF NEW.kind='physical_return_quarantine' AND NOT EXISTS (
    SELECT 1 FROM "StockMovement" movement
    WHERE movement."lotId"=NEW.id AND movement."receiptId"=NEW."receiptId"
      AND movement.reason='physical_return_quarantine'
      AND movement.delta=NEW.quantity AND movement."resultingQty"=NEW.quantity
  ) THEN
    RAISE EXCEPTION 'returned goods quarantine stock needs matching receipt movement'
      USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER physical_return_quarantine_lot_complete
  AFTER INSERT ON "StockLot" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_return_quarantine_lot_at_commit();

-- Returned stock must not become saleable through ordinary lot update APIs
-- or ad-hoc SQL. A future separately approved release policy will replace
-- this prohibition with reviewed and tested release authority.
CREATE FUNCTION prevent_quarantined_return_lot_change() RETURNS trigger AS $$
BEGIN
  IF OLD.kind='physical_return_quarantine' THEN
    RAISE EXCEPTION 'return quarantine lots are immutable and not saleable'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER physical_return_lot_immutable
  BEFORE UPDATE OR DELETE ON "StockLot" FOR EACH ROW
  EXECUTE FUNCTION prevent_quarantined_return_lot_change();

-- Preserve the accounting trail for the newly created off-sale lot. The only
-- permitted movement for this immutable lot is its exactly-one admission.
CREATE FUNCTION verify_return_quarantine_movement() RETURNS trigger AS $$
DECLARE lot "StockLot"%ROWTYPE;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT * INTO lot FROM "StockLot" WHERE id=NEW."lotId";
    IF lot.kind='physical_return_quarantine' AND (
      NEW.reason<>'physical_return_quarantine'
      OR NEW."receiptId" IS DISTINCT FROM lot."receiptId"
      OR NEW.delta<>lot.quantity
      OR NEW."resultingQty"<>lot.quantity
      OR EXISTS (SELECT 1 FROM "StockMovement" prior WHERE prior."lotId"=lot.id)
    ) THEN
      RAISE EXCEPTION 'return quarantine stock must have exactly one matching admission movement'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM "StockLot" l
    WHERE l.id=OLD."lotId" AND l.kind='physical_return_quarantine') THEN
    RAISE EXCEPTION 'returned quarantine stock movement history is immutable'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER return_quarantine_movement_proof
  BEFORE INSERT OR UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION verify_return_quarantine_movement();
