ALTER TABLE "InternalTransferRequest" DROP CONSTRAINT "InternalTransferRequest_state_check";
ALTER TABLE "InternalTransferRequest" ADD CONSTRAINT "InternalTransferRequest_state_check" CHECK (
 (
  ("status" = 'requested' AND "version" = 1 AND "sourceId" IS NULL AND "decidedBy" IS NULL AND "decidedAt" IS NULL AND "decisionNote" IS NULL)
  OR ("status" IN ('authorized','reserved','cancelled','in_transit') AND "sourceId" IS NOT NULL AND "sourceId" <> "destinationId" AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionNote" IS NOT NULL)
  OR ("status" = 'rejected' AND "version" = 2 AND "sourceId" IS NULL AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionNote" IS NOT NULL AND length(trim("decisionNote")) > 0)
 )
 AND (
  ("status" IN ('requested','authorized','rejected') AND "reservedBy" IS NULL AND "reservedAt" IS NULL AND "reservationExpiresAt" IS NULL AND "cancelledBy" IS NULL AND "cancelledAt" IS NULL AND "cancellationNote" IS NULL AND ("status"<>'authorized' OR "version"=2))
  OR ("status" IN ('reserved','cancelled','in_transit') AND "reservedBy" IS NOT NULL AND "reservedAt" IS NOT NULL AND "reservationExpiresAt" IS NOT NULL AND "reservationExpiresAt">"reservedAt" AND (
   (("status"='reserved' AND "version"=3 OR "status"='in_transit' AND "version"=4) AND "cancelledBy" IS NULL AND "cancelledAt" IS NULL AND "cancellationNote" IS NULL)
   OR ("status"='cancelled' AND "version"=4 AND "cancelledBy" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationNote" IS NOT NULL AND length(trim("cancellationNote"))>0)
  ))
 )
);
ALTER TABLE "StockDepletion" DROP CONSTRAINT "StockDepletion_claimType_check";
ALTER TABLE "StockDepletion" DROP CONSTRAINT "StockDepletion_kind_check";
ALTER TABLE "StockDepletion" ADD CONSTRAINT "StockDepletion_claimType_check" CHECK ("claimType" IN ('order','pos_draft','internal_transfer'));
ALTER TABLE "StockDepletion" ADD CONSTRAINT "StockDepletion_kind_check" CHECK ("kind" IN ('dispatch_handover','collection_handover','pos_handover','transfer_dispatch') AND ("claimType"='internal_transfer')=("kind"='transfer_dispatch'));

CREATE TABLE "InternalTransferDispatch" (
 "id" TEXT PRIMARY KEY, "transferId" TEXT NOT NULL UNIQUE,
 "depletionId" TEXT NOT NULL UNIQUE, "dispatchedBy" TEXT NOT NULL,
 "handoverReference" TEXT NOT NULL CHECK(length(trim("handoverReference")) BETWEEN 1 AND 128),
 "dispatchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "currency" TEXT NOT NULL DEFAULT 'GHS' CHECK ("currency"='GHS'),
 "totalValueMinor" BIGINT NOT NULL CHECK ("totalValueMinor">=0),
 CONSTRAINT "InternalTransferDispatch_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "InternalTransferRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "InternalTransferDispatch_depletionId_fkey" FOREIGN KEY ("depletionId") REFERENCES "StockDepletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "InternalTransferDispatchLot" (
 "id" TEXT PRIMARY KEY, "dispatchId" TEXT NOT NULL, "depletionLineId" TEXT NOT NULL UNIQUE,
 "lotNumber" TEXT NOT NULL, "expiryDate" DATE, "unitCostMinor" INTEGER NOT NULL CHECK ("unitCostMinor">=0),
 "valueMinor" BIGINT NOT NULL CHECK ("valueMinor">=0),
 CONSTRAINT "InternalTransferDispatchLot_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "InternalTransferDispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "InternalTransferDispatchLot_depletionLineId_fkey" FOREIGN KEY ("depletionLineId") REFERENCES "StockDepletionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InternalTransferDispatchLot_dispatchId_idx" ON "InternalTransferDispatchLot"("dispatchId");

CREATE OR REPLACE FUNCTION guard_internal_transfer_reservation_history() RETURNS trigger AS $$
BEGIN
 IF OLD."claimType"<>'internal_transfer' THEN
  IF TG_OP='UPDATE' AND NEW."claimType"='internal_transfer' THEN
   RAISE EXCEPTION 'Cannot repurpose an existing reservation' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Transfer reservation history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state')
 OR (OLD.state<>NEW.state AND (OLD.state<>'active' OR NEW.state NOT IN ('released','expired','consumed')))
 OR (OLD.state='active' AND NEW.state='consumed' AND (OLD."expiresAt"<=now() OR NOT EXISTS(
  SELECT 1 FROM "StockDepletion" d JOIN "InternalTransferRequest" t ON t.id=d."claimId"
  WHERE d."claimType"='internal_transfer' AND d."claimId"=OLD."claimId" AND d.kind='transfer_dispatch' AND t.status='reserved'
 )))
 THEN RAISE EXCEPTION 'Transfer reservation provenance is immutable or consumption lacks dispatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE FUNCTION verify_transfer_dispatch_commit() RETURNS trigger AS $$
DECLARE transfer_id TEXT; dispatch_row "InternalTransferDispatch"%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='StockDepletion' THEN
  IF NEW."claimType"<>'internal_transfer' THEN RETURN NULL; END IF;
  transfer_id:=NEW."claimId";
 ELSIF TG_TABLE_NAME='StockDepletionLine' THEN
  SELECT d."claimId" INTO transfer_id FROM "StockDepletion" d WHERE d.id=NEW."depletionId" AND d."claimType"='internal_transfer';
  IF transfer_id IS NULL THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='InternalTransferRequest' THEN
  IF NEW.status<>'in_transit' THEN RETURN NULL; END IF;
  transfer_id:=NEW.id;
 ELSIF TG_TABLE_NAME='InternalTransferDispatchLot' THEN
  SELECT "transferId" INTO transfer_id FROM "InternalTransferDispatch" WHERE id=NEW."dispatchId";
 ELSE transfer_id:=NEW."transferId";
 END IF;
 SELECT * INTO dispatch_row FROM "InternalTransferDispatch" WHERE "transferId"=transfer_id;
 IF dispatch_row.id IS NULL OR NOT EXISTS(
   SELECT 1 FROM "InternalTransferRequest" t JOIN "StockDepletion" d ON d.id=dispatch_row."depletionId"
   WHERE t.id=transfer_id AND t.status='in_transit' AND d."claimType"='internal_transfer'
   AND d."claimId"=t.id AND d."locationId"=t."sourceId" AND d.kind='transfer_dispatch' AND d."actorId"=dispatch_row."dispatchedBy"
 )
 OR EXISTS(SELECT 1 FROM "Reservation" WHERE "claimType"='internal_transfer' AND "claimId"=transfer_id AND state<>'consumed')
 OR EXISTS(
  SELECT 1 FROM "InternalTransferRequestLine" l LEFT JOIN "StockDepletionLine" d
   ON d."depletionId"=dispatch_row."depletionId" AND d."claimLineId"=l.id AND d."variantId"=l."variantId"
  WHERE l."requestId"=transfer_id GROUP BY l.id,l.quantity HAVING COALESCE(sum(d.quantity),0)<>l.quantity
 )
 OR EXISTS(
  SELECT 1 FROM "StockDepletionLine" d LEFT JOIN "InternalTransferDispatchLot" v ON v."depletionLineId"=d.id AND v."dispatchId"=dispatch_row.id
  LEFT JOIN "Reservation" r ON r.id=d."reservationId"
  LEFT JOIN "StockLot" lot ON lot.id=d."lotId"
  WHERE d."depletionId"=dispatch_row."depletionId" AND
   (v.id IS NULL OR r."claimType"<>'internal_transfer' OR r."claimId"<>transfer_id OR r."claimLineId"<>d."claimLineId" OR r."lotId"<>d."lotId" OR r.quantity<>d.quantity
    OR v."unitCostMinor" IS DISTINCT FROM lot."unitCostMinor" OR v."lotNumber" IS DISTINCT FROM lot."lotNumber" OR v."expiryDate" IS DISTINCT FROM lot."expiryDate"
    OR v."valueMinor"<>round(d."lotQuantityBefore"*v."unitCostMinor")-round(d."lotQuantityAfter"*v."unitCostMinor"))
 )
 OR EXISTS(SELECT 1 FROM "InternalTransferDispatchLot" v JOIN "StockDepletionLine" d ON d.id=v."depletionLineId" WHERE v."dispatchId"=dispatch_row.id AND d."depletionId"<>dispatch_row."depletionId")
 OR EXISTS(SELECT 1 FROM "Reservation" r LEFT JOIN "StockDepletionLine" d ON d."reservationId"=r.id AND d."depletionId"=dispatch_row."depletionId" WHERE r."claimType"='internal_transfer' AND r."claimId"=transfer_id AND d.id IS NULL)
 OR NOT EXISTS(SELECT 1 FROM "InternalTransferDispatchLot" WHERE "dispatchId"=dispatch_row.id)
 OR dispatch_row."totalValueMinor"<>(SELECT COALESCE(sum("valueMinor"),0) FROM "InternalTransferDispatchLot" WHERE "dispatchId"=dispatch_row.id)
 THEN RAISE EXCEPTION 'Internal transfer dispatch requires exact stock and cost evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER transfer_dispatch_commit_depletion AFTER INSERT ON "StockDepletion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_transfer_dispatch_commit();
CREATE CONSTRAINT TRIGGER transfer_dispatch_commit_depletion_line AFTER INSERT ON "StockDepletionLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_transfer_dispatch_commit();
CREATE CONSTRAINT TRIGGER transfer_dispatch_commit_request AFTER UPDATE ON "InternalTransferRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_transfer_dispatch_commit();
CREATE CONSTRAINT TRIGGER transfer_dispatch_commit_header AFTER INSERT ON "InternalTransferDispatch" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_transfer_dispatch_commit();
CREATE CONSTRAINT TRIGGER transfer_dispatch_commit_lot AFTER INSERT ON "InternalTransferDispatchLot" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_transfer_dispatch_commit();

CREATE FUNCTION reject_transfer_dispatch_edit() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Transfer dispatch ledger is append-only' USING ERRCODE='23514'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER transfer_dispatch_append_only BEFORE UPDATE OR DELETE ON "InternalTransferDispatch" FOR EACH ROW EXECUTE FUNCTION reject_transfer_dispatch_edit();
CREATE TRIGGER transfer_dispatch_lot_append_only BEFORE UPDATE OR DELETE ON "InternalTransferDispatchLot" FOR EACH ROW EXECUTE FUNCTION reject_transfer_dispatch_edit();
