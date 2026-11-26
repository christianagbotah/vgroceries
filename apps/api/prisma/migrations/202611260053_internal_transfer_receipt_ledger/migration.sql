-- Additive receipt ledger. Dispatch remains immutable. Destination acceptance
-- is tracked separately until the reconciliation/close state migration.
CREATE TABLE "InternalTransferReceipt" (
 "id" TEXT PRIMARY KEY,
 "transferId" TEXT NOT NULL REFERENCES "InternalTransferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "stockReceiptId" TEXT NOT NULL UNIQUE REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "receivedBy" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL,
 "receiptReference" TEXT NOT NULL CHECK(length(trim("receiptReference")) BETWEEN 1 AND 128),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InternalTransferReceipt_transferId_requestKey_key" ON "InternalTransferReceipt"("transferId","requestKey");
CREATE TABLE "InternalTransferReceiptLine" (
 "id" TEXT PRIMARY KEY,
 "receiptId" TEXT NOT NULL REFERENCES "InternalTransferReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "dispatchLotId" TEXT NOT NULL REFERENCES "InternalTransferDispatchLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "destinationLotId" TEXT NOT NULL UNIQUE REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "quantity" DECIMAL(15,3) NOT NULL CHECK(quantity>0),
 "valueMinor" BIGINT NOT NULL CHECK("valueMinor">=0),
 "roundingMinor" BIGINT NOT NULL
);
CREATE UNIQUE INDEX "InternalTransferReceiptLine_receiptId_dispatchLotId_key" ON "InternalTransferReceiptLine"("receiptId","dispatchLotId");
CREATE INDEX "InternalTransferReceiptLine_dispatchLotId_idx" ON "InternalTransferReceiptLine"("dispatchLotId");

CREATE TRIGGER transfer_receipt_append_only BEFORE UPDATE OR DELETE ON "InternalTransferReceipt"
 FOR EACH ROW EXECUTE FUNCTION reject_transfer_dispatch_edit();
CREATE TRIGGER transfer_receipt_line_append_only BEFORE UPDATE OR DELETE ON "InternalTransferReceiptLine"
 FOR EACH ROW EXECUTE FUNCTION reject_transfer_dispatch_edit();

-- Serialize all receipt writers, including direct SQL, with the existing
-- transfer state lock. Reject forged lot linkage or excess acceptance.
CREATE FUNCTION verify_transfer_receipt_line() RETURNS trigger AS $$
DECLARE source_quantity numeric; source_value bigint; source_cost integer;
 prior_quantity numeric; prior_value numeric; expected_value numeric;
 transfer_id text;
BEGIN
 SELECT r."transferId" INTO transfer_id FROM "InternalTransferReceipt" r WHERE r.id=NEW."receiptId";
 PERFORM id FROM "InternalTransferRequest" WHERE id=transfer_id FOR UPDATE;
 SELECT dl.quantity,v."valueMinor",v."unitCostMinor" INTO source_quantity,source_value,source_cost
 FROM "InternalTransferReceipt" r
 JOIN "InternalTransferRequest" t ON t.id=r."transferId"
 JOIN "InternalTransferDispatch" d ON d."transferId"=t.id
 JOIN "InternalTransferDispatchLot" v ON v."dispatchId"=d.id AND v.id=NEW."dispatchLotId"
 JOIN "StockDepletionLine" dl ON dl.id=v."depletionLineId"
 JOIN "StockLot" dest ON dest.id=NEW."destinationLotId"
 JOIN "StockPosition" p ON p.id=dest."positionId"
 JOIN "StockReceipt" sr ON sr.id=r."stockReceiptId"
 WHERE r.id=NEW."receiptId" AND t.status='in_transit'
 AND p."locationId"=t."destinationId" AND p."variantId"=dl."variantId"
 AND dest."receiptId"=sr.id AND sr."receivedBy"=r."receivedBy" AND sr."poRef" IS NULL
 AND dest.quantity=NEW.quantity AND dest."lotNumber"=v."lotNumber"
 AND dest."unitCostMinor"=v."unitCostMinor" AND dest."expiryDate" IS NOT DISTINCT FROM v."expiryDate"
 AND dest.kind='regular' AND NOT dest.quarantined
 AND (dest."expiryDate" IS NULL OR dest."expiryDate"> (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
 AND (EXISTS(SELECT 1 FROM "Variant" var WHERE var.id=dl."variantId" AND (var.unit IN ('kg','litre') OR NEW.quantity=trunc(NEW.quantity))));
 IF NOT FOUND THEN RAISE EXCEPTION 'Transfer receipt lot provenance invalid' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(sum(quantity),0),COALESCE(sum("valueMinor"),0) INTO prior_quantity,prior_value
 FROM "InternalTransferReceiptLine" WHERE "dispatchLotId"=NEW."dispatchLotId";
 IF prior_quantity+NEW.quantity>source_quantity THEN RAISE EXCEPTION 'Transfer receipt exceeds dispatch' USING ERRCODE='23514'; END IF;
 IF prior_value<>round(prior_quantity*source_value/source_quantity) THEN RAISE EXCEPTION 'Prior transfer value invalid' USING ERRCODE='23514'; END IF;
 expected_value:=round((prior_quantity+NEW.quantity)*source_value/source_quantity)-prior_value;
 IF NEW."valueMinor"<>expected_value OR NEW."roundingMinor"<>expected_value-round(NEW.quantity*source_cost)
 THEN RAISE EXCEPTION 'Transfer receipt carrying value invalid' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER transfer_receipt_line_guard BEFORE INSERT ON "InternalTransferReceiptLine"
 FOR EACH ROW EXECUTE FUNCTION verify_transfer_receipt_line();

-- Every receipt must contain linked stock admissions and exactly one
-- original positive movement for each fresh destination lot.
CREATE FUNCTION verify_transfer_receipt_commit() RETURNS trigger AS $$
DECLARE receipt_id text;
BEGIN
 IF TG_TABLE_NAME='InternalTransferReceipt' THEN receipt_id:=NEW.id; ELSE receipt_id:=NEW."receiptId"; END IF;
 IF NOT EXISTS(SELECT 1 FROM "InternalTransferReceiptLine" WHERE "receiptId"=receipt_id)
 OR EXISTS(
  SELECT 1 FROM "InternalTransferReceipt" r
  JOIN "InternalTransferReceiptLine" l ON l."receiptId"=r.id
  WHERE r.id=receipt_id AND (
   (SELECT count(*) FROM "StockMovement" m WHERE m."lotId"=l."destinationLotId" AND m."receiptId"=r."stockReceiptId")<>1
   OR NOT EXISTS(SELECT 1 FROM "StockMovement" m WHERE m."lotId"=l."destinationLotId" AND m."receiptId"=r."stockReceiptId"
    AND m.reason='internal_transfer_receipt' AND m.delta=l.quantity AND m."resultingQty"=l.quantity AND m."actorId"=r."receivedBy")
  )
 )
 OR EXISTS(
  SELECT 1 FROM "InternalTransferReceipt" r JOIN "StockLot" lot ON lot."receiptId"=r."stockReceiptId"
  WHERE r.id=receipt_id AND NOT EXISTS(SELECT 1 FROM "InternalTransferReceiptLine" l WHERE l."receiptId"=r.id AND l."destinationLotId"=lot.id)
 )
 THEN RAISE EXCEPTION 'Transfer receipt requires complete stock evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER transfer_receipt_commit_header AFTER INSERT ON "InternalTransferReceipt"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_transfer_receipt_commit();
CREATE CONSTRAINT TRIGGER transfer_receipt_commit_line AFTER INSERT ON "InternalTransferReceiptLine"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_transfer_receipt_commit();

-- Do not allow a later edit or deletion of the initial admission movement.
CREATE FUNCTION guard_transfer_receipt_movement() RETURNS trigger AS $$
BEGIN
 IF OLD.reason='internal_transfer_receipt' THEN RAISE EXCEPTION 'Transfer admission evidence is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.reason='internal_transfer_receipt' THEN RAISE EXCEPTION 'Cannot relabel an existing stock movement' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER transfer_receipt_movement_history BEFORE UPDATE OR DELETE ON "StockMovement"
 FOR EACH ROW EXECUTE FUNCTION guard_transfer_receipt_movement();
