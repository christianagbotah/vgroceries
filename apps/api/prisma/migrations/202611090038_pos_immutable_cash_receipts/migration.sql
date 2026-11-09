-- P0c2a: physically counted cash receipts capture immutable product names
-- at sale completion, rather than looking up mutable catalog labels on reprint.
-- This migration creates neither tax invoices nor electronic payment authority.
CREATE TABLE "PosCashReceiptLine" (
  id TEXT NOT NULL PRIMARY KEY,
  "saleId" TEXT NOT NULL REFERENCES "PosCashSale"(id) ON DELETE RESTRICT,
  "holdLineId" TEXT NOT NULL UNIQUE REFERENCES "PosStockHoldLine"(id) ON DELETE RESTRICT,
  "variantId" TEXT NOT NULL REFERENCES "Variant"(id) ON DELETE RESTRICT,
  "productName" TEXT NOT NULL,
  "variantName" TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "lineTotalMinor" INTEGER NOT NULL,
  CONSTRAINT pos_receipt_line_values CHECK (
    quantity>0 AND "unitPriceMinor" BETWEEN 0 AND 100000000
    AND "lineTotalMinor" BETWEEN 0 AND 100000000
    AND char_length(btrim("productName")) BETWEEN 1 AND 500
    AND char_length(btrim("variantName")) BETWEEN 1 AND 500
    AND char_length(btrim(unit)) BETWEEN 1 AND 32
  )
);
CREATE INDEX pos_receipt_sale_variant
  ON "PosCashReceiptLine"("saleId","variantId");

CREATE FUNCTION validate_pos_cash_receipt_line() RETURNS trigger AS $$
DECLARE sale "PosCashSale"%ROWTYPE;
DECLARE held_line "PosStockHoldLine"%ROWTYPE;
DECLARE catalog RECORD;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'completed POS receipt item descriptions are immutable'
      USING ERRCODE='23514';
  END IF;
  SELECT * INTO sale FROM "PosCashSale" WHERE id=NEW."saleId";
  SELECT * INTO held_line FROM "PosStockHoldLine" WHERE id=NEW."holdLineId";
  SELECT v.id, v.name AS variant_name, v.unit, p.name AS product_name
    INTO catalog
    FROM "Variant" v JOIN "Product" p ON p.id=v."productId"
    WHERE v.id=NEW."variantId";
  IF sale.id IS NULL OR held_line.id IS NULL
    OR held_line."holdId"<>sale."holdId"
    OR held_line."variantId"<>NEW."variantId"
    OR held_line.quantity IS DISTINCT FROM NEW.quantity
    OR held_line."unitPriceMinor" IS DISTINCT FROM NEW."unitPriceMinor"
    OR held_line."lineTotalMinor" IS DISTINCT FROM NEW."lineTotalMinor"
    OR catalog.id IS NULL
    OR NEW."productName" IS DISTINCT FROM catalog.product_name
    OR NEW."variantName" IS DISTINCT FROM catalog.variant_name
    OR NEW.unit IS DISTINCT FROM catalog.unit
  THEN RAISE EXCEPTION 'POS receipt must match the held item and sale-time catalog labels'
    USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER pos_cash_receipt_line_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "PosCashReceiptLine"
  FOR EACH ROW EXECUTE FUNCTION validate_pos_cash_receipt_line();

-- Deferred verification ensures sale and every snapshot line are committed
-- in the same transaction; partial receipts can never be accepted.
CREATE FUNCTION verify_pos_cash_receipt_at_commit() RETURNS trigger AS $$
DECLARE sale_id TEXT;
DECLARE sale "PosCashSale"%ROWTYPE;
DECLARE held_count INTEGER;
DECLARE receipt_count INTEGER;
DECLARE receipt_total BIGINT;
BEGIN
  IF TG_TABLE_NAME='PosCashSale' THEN sale_id:=NEW.id;
  ELSE sale_id:=NEW."saleId"; END IF;
  SELECT * INTO sale FROM "PosCashSale" WHERE id=sale_id;
  IF sale.id IS NULL THEN
    RAISE EXCEPTION 'POS receipt has no cash sale' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO held_count FROM "PosStockHoldLine"
    WHERE "holdId"=sale."holdId";
  SELECT count(*),COALESCE(sum("lineTotalMinor"),0)
    INTO receipt_count,receipt_total
    FROM "PosCashReceiptLine" WHERE "saleId"=sale.id;
  IF receipt_count<>held_count OR receipt_count<1 OR receipt_count>100
    OR receipt_total<>sale."subtotalMinor"
    OR EXISTS(
      SELECT 1 FROM "PosStockHoldLine" source
      LEFT JOIN "PosCashReceiptLine" copied
        ON copied."holdLineId"=source.id AND copied."saleId"=sale.id
      WHERE source."holdId"=sale."holdId" AND copied.id IS NULL
    )
    OR EXISTS(
      SELECT 1 FROM "PosCashReceiptLine" copied
      LEFT JOIN "PosStockHoldLine" source
        ON source.id=copied."holdLineId" AND source."holdId"=sale."holdId"
      WHERE copied."saleId"=sale.id AND source.id IS NULL
    )
  THEN RAISE EXCEPTION 'POS receipt must exactly match all original hold items'
    USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER pos_receipt_sale_complete
  AFTER INSERT ON "PosCashSale" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_pos_cash_receipt_at_commit();
CREATE CONSTRAINT TRIGGER pos_receipt_lines_complete
  AFTER INSERT ON "PosCashReceiptLine" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_pos_cash_receipt_at_commit();
