-- First Physical Returns Authority: proved receipt, bounded original depleted
-- order-line quantities, and one-way inspection. Inventory/refunds untouched.
CREATE TABLE "PhysicalReturnReceipt" (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  "orderId" TEXT NOT NULL REFERENCES "Order"(id) ON DELETE RESTRICT,
  "locationId" TEXT NOT NULL REFERENCES "Location"(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'received',
  reason TEXT NOT NULL,
  "evidenceNote" TEXT NOT NULL,
  "receivedBy" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "inspectedBy" TEXT,
  "inspectedAt" TIMESTAMPTZ(3),
  "inspectionSummary" TEXT,
  CONSTRAINT "PhysicalReturnReceipt_reason" CHECK (
    char_length(btrim(reason)) BETWEEN 5 AND 400 AND
    char_length(btrim("evidenceNote")) BETWEEN 10 AND 1000
  ),
  CONSTRAINT "PhysicalReturnReceipt_terminal" CHECK (
    (status='received' AND "inspectedAt" IS NULL AND "inspectedBy" IS NULL AND "inspectionSummary" IS NULL)
    OR (status='inspected' AND "inspectedAt" IS NOT NULL AND "inspectedBy" IS NOT NULL
        AND char_length(btrim("inspectionSummary")) BETWEEN 10 AND 1000)
  )
);
CREATE INDEX "PhysicalReturnReceipt_order_date_idx" ON "PhysicalReturnReceipt"("orderId","receivedAt");
CREATE INDEX "PhysicalReturnReceipt_location_date_idx" ON "PhysicalReturnReceipt"("locationId","receivedAt");
CREATE TABLE "PhysicalReturnItem" (
  id TEXT PRIMARY KEY,
  "receiptId" TEXT NOT NULL REFERENCES "PhysicalReturnReceipt"(id) ON DELETE RESTRICT,
  "orderLineId" TEXT NOT NULL REFERENCES "OrderLine"(id) ON DELETE RESTRICT,
  "variantId" TEXT NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  condition TEXT NOT NULL,
  disposition TEXT NOT NULL DEFAULT 'awaiting_inspection',
  "inspectionNote" TEXT,
  "inspectedBy" TEXT,
  "inspectedAt" TIMESTAMPTZ(3),
  CONSTRAINT "PhysicalReturnItem_receipt_line_key" UNIQUE ("receiptId","orderLineId"),
  CONSTRAINT "PhysicalReturnItem_quantity" CHECK(quantity>0),
  CONSTRAINT "PhysicalReturnItem_condition" CHECK(condition IN ('sealed','opened','damaged','unknown')),
  CONSTRAINT "PhysicalReturnItem_disposition" CHECK(
    (disposition='awaiting_inspection' AND "inspectionNote" IS NULL AND "inspectedBy" IS NULL AND "inspectedAt" IS NULL)
    OR (disposition IN ('quarantine','destroy') AND "inspectedAt" IS NOT NULL
        AND "inspectedBy" IS NOT NULL AND char_length(btrim("inspectionNote")) BETWEEN 10 AND 1000)
  )
);
CREATE INDEX "PhysicalReturnItem_line_status_idx" ON "PhysicalReturnItem"("orderLineId",disposition);

CREATE FUNCTION validate_physical_receipt() RETURNS trigger AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(
      SELECT 1 FROM "Order" o
      JOIN "StockDepletion" d ON d."claimType"='order' AND d."claimId"=o.id
      JOIN "Location" l ON l.id=d."locationId" AND l.active
      WHERE o.id=NEW."orderId" AND o."stockConsumedAt" IS NOT NULL
        AND o."fulfilmentStatus" IN ('delivered','collected')
        AND d."locationId"=NEW."locationId"
    ) THEN RAISE EXCEPTION 'physical receipt needs an actually depleted and completed order at its stock location'
        USING ERRCODE='23514'; END IF;
    IF NEW.status<>'received' THEN
      RAISE EXCEPTION 'physical returns must start received, not inspected' USING ERRCODE='23514';
    END IF;
  ELSIF TG_OP='UPDATE' THEN
    IF (NEW.id,NEW.reference,NEW."orderId",NEW."locationId",NEW.reason,NEW."evidenceNote",
        NEW."receivedBy",NEW."receivedAt")
       IS DISTINCT FROM
       (OLD.id,OLD.reference,OLD."orderId",OLD."locationId",OLD.reason,OLD."evidenceNote",
        OLD."receivedBy",OLD."receivedAt") OR OLD.status<>'received' OR NEW.status<>'inspected'
    THEN RAISE EXCEPTION 'return receipt evidence is immutable' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "PhysicalReturnItem" x WHERE x."receiptId"=NEW.id)
      OR EXISTS(SELECT 1 FROM "PhysicalReturnItem" x WHERE x."receiptId"=NEW.id
                AND x.disposition='awaiting_inspection')
    THEN RAISE EXCEPTION 'every received line must be inspected before completion'
         USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER physical_receipt_guard
  BEFORE INSERT OR UPDATE ON "PhysicalReturnReceipt"
  FOR EACH ROW EXECUTE FUNCTION validate_physical_receipt();

CREATE FUNCTION validate_physical_return_item() RETURNS trigger AS $$
DECLARE
  receipt "PhysicalReturnReceipt"%ROWTYPE;
  remaining DECIMAL(15,3);
  ordered DECIMAL(15,3);
  already DECIMAL(15,3);
  units TEXT;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.id,NEW."receiptId",NEW."orderLineId",NEW."variantId",NEW.quantity,NEW.condition)
       IS DISTINCT FROM
       (OLD.id,OLD."receiptId",OLD."orderLineId",OLD."variantId",OLD.quantity,OLD.condition)
       OR OLD.disposition<>'awaiting_inspection'
       OR NEW.disposition NOT IN ('quarantine','destroy')
    THEN RAISE EXCEPTION 'receipt line or inspected disposition is immutable' USING ERRCODE='23514'; END IF;
    SELECT * INTO receipt FROM "PhysicalReturnReceipt" WHERE id=NEW."receiptId";
    IF receipt.status<>'received' THEN RAISE EXCEPTION 'cannot inspect a completed receipt' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO receipt FROM "PhysicalReturnReceipt" WHERE id=NEW."receiptId";
  IF receipt.id IS NULL OR receipt.status<>'received' THEN
    RAISE EXCEPTION 'cannot add return items to an inspected or absent receipt' USING ERRCODE='23514'; END IF;
  -- Order lock serializes separate receipts and direct-SQL insert attempts.
  PERFORM 1 FROM "Order" WHERE id=receipt."orderId" FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM "Order" o WHERE o.id=receipt."orderId"
    AND o."stockConsumedAt" IS NOT NULL AND o."fulfilmentStatus" IN ('delivered','collected'))
  THEN RAISE EXCEPTION 'return order is not physically complete' USING ERRCODE='23514'; END IF;
  SELECT l.quantity,v.unit INTO ordered,units
    FROM "OrderLine" l JOIN "Variant" v ON v.id=l."variantId"
    WHERE l.id=NEW."orderLineId" AND l."orderId"=receipt."orderId"
      AND l."variantId"=NEW."variantId";
  IF ordered IS NULL THEN RAISE EXCEPTION 'physical return item must belong to the source order'
    USING ERRCODE='23514'; END IF;
  IF units NOT IN ('kg','litre') AND NEW.quantity<>trunc(NEW.quantity) THEN
    RAISE EXCEPTION 'packaged goods require whole base units' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(SUM(l.quantity),0) INTO remaining
    FROM "StockDepletion" d JOIN "StockDepletionLine" l ON l."depletionId"=d.id
    WHERE d."claimType"='order' AND d."claimId"=receipt."orderId"
      AND d."locationId"=receipt."locationId" AND l."claimLineId"=NEW."orderLineId"
      AND l."variantId"=NEW."variantId";
  SELECT COALESCE(SUM(i.quantity),0) INTO already FROM "PhysicalReturnItem" i
    JOIN "PhysicalReturnReceipt" r ON r.id=i."receiptId"
    WHERE r."orderId"=receipt."orderId" AND i."orderLineId"=NEW."orderLineId";
  IF remaining<=0 OR NEW.quantity+already>remaining OR NEW.quantity>ordered THEN
    RAISE EXCEPTION 'returned units exceed verified physical handover quantity'
    USING ERRCODE='23514'; END IF;
  IF NEW.disposition<>'awaiting_inspection' THEN
    RAISE EXCEPTION 'incoming goods must be quarantined pending inspection' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER physical_return_item_guard BEFORE INSERT OR UPDATE ON "PhysicalReturnItem"
  FOR EACH ROW EXECUTE FUNCTION validate_physical_return_item();

CREATE FUNCTION prevent_physical_return_delete() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'physical return evidence is append-only' USING ERRCODE='23514'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER physical_return_receipt_no_delete BEFORE DELETE ON "PhysicalReturnReceipt"
 FOR EACH ROW EXECUTE FUNCTION prevent_physical_return_delete();
CREATE TRIGGER physical_return_item_no_delete BEFORE DELETE ON "PhysicalReturnItem"
 FOR EACH ROW EXECUTE FUNCTION prevent_physical_return_delete();

-- Receipt and inspection must be transaction-complete. These deferred checks
-- also cover direct SQL that might bypass the API's multi-write transaction.
CREATE FUNCTION require_physical_receipt_items() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM "PhysicalReturnItem" i WHERE i."receiptId"=NEW.id) THEN
    RAISE EXCEPTION 'physical receipt must contain witnessed source-order items'
      USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER physical_receipt_items_required
  AFTER INSERT ON "PhysicalReturnReceipt" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_physical_receipt_items();

CREATE FUNCTION require_terminal_physical_inspection() RETURNS trigger AS $$
BEGIN
  IF NEW.disposition<>'awaiting_inspection' AND NOT EXISTS(
    SELECT 1 FROM "PhysicalReturnReceipt" r
      WHERE r.id=NEW."receiptId" AND r.status='inspected'
        AND r."inspectedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'inspection lines must be completed with their parent receipt'
      USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER physical_inspection_atomic
  AFTER UPDATE ON "PhysicalReturnItem" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_terminal_physical_inspection();
