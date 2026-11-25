ALTER TABLE "InternalTransferRequest"
 ADD COLUMN "reservedBy" TEXT, ADD COLUMN "reservedAt" TIMESTAMPTZ(3),
 ADD COLUMN "reservationExpiresAt" TIMESTAMPTZ(3),
 ADD COLUMN "cancelledBy" TEXT, ADD COLUMN "cancelledAt" TIMESTAMPTZ(3), ADD COLUMN "cancellationNote" TEXT;

ALTER TABLE "InternalTransferRequest" DROP CONSTRAINT "InternalTransferRequest_state_check";
ALTER TABLE "InternalTransferRequest" ADD CONSTRAINT "InternalTransferRequest_state_check" CHECK (
 (
  ("status" = 'requested' AND "version" = 1 AND "sourceId" IS NULL AND "decidedBy" IS NULL AND "decidedAt" IS NULL AND "decisionNote" IS NULL)
  OR ("status" IN ('authorized','reserved','cancelled') AND "sourceId" IS NOT NULL AND "sourceId" <> "destinationId" AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionNote" IS NOT NULL)
  OR ("status" = 'rejected' AND "version" = 2 AND "sourceId" IS NULL AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionNote" IS NOT NULL AND length(trim("decisionNote")) > 0)
 )
 AND (
  ("status" IN ('requested','authorized','rejected') AND "reservedBy" IS NULL AND "reservedAt" IS NULL AND "reservationExpiresAt" IS NULL AND "cancelledBy" IS NULL AND "cancelledAt" IS NULL AND "cancellationNote" IS NULL AND ("status"<>'authorized' OR "version"=2))
  OR ("status" IN ('reserved','cancelled') AND "reservedBy" IS NOT NULL AND "reservedAt" IS NOT NULL AND "reservationExpiresAt" IS NOT NULL AND "reservationExpiresAt">"reservedAt" AND (
   ("status"='reserved' AND "version"=3 AND "cancelledBy" IS NULL AND "cancelledAt" IS NULL AND "cancellationNote" IS NULL)
   OR ("status"='cancelled' AND "version"=4 AND "cancelledBy" IS NOT NULL AND "cancelledAt" IS NOT NULL AND "cancellationNote" IS NOT NULL AND length(trim("cancellationNote"))>0)
  ))
 )
);
ALTER TABLE "Reservation" DROP CONSTRAINT reservation_claim_type;
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_claim_type CHECK ("claimType" IN ('order','pos_draft','internal_transfer'));

-- A transfer allocation must use the authorized source and requested variant.
CREATE FUNCTION verify_internal_transfer_reservation() RETURNS trigger AS $$
BEGIN
 IF NEW."claimType"<>'internal_transfer' THEN RETURN NEW; END IF;
 IF NEW.state<>'active' OR NEW.generation<>1 OR NEW."expiresAt"<=now() OR NOT EXISTS(
  SELECT 1 FROM "InternalTransferRequest" t
  JOIN "InternalTransferRequestLine" l ON l."requestId"=t.id
  JOIN "StockPosition" p ON p."variantId"=l."variantId" AND p."locationId"=t."sourceId"
  JOIN "StockLot" lot ON lot.id=NEW."lotId" AND lot."positionId"=p.id
  JOIN "Location" src ON src.id=t."sourceId"
  JOIN "Location" dst ON dst.id=t."destinationId"
  WHERE t.id=NEW."claimId" AND l.id=NEW."claimLineId" AND p.id=NEW."positionId"
   AND t.status='reserved' AND t."reservationExpiresAt"=NEW."expiresAt"
   AND src.active AND dst.active AND lot."unitCostMinor" IS NOT NULL AND lot."unitCostMinor">=0
 ) THEN RAISE EXCEPTION 'Invalid internal transfer stock reservation' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER internal_transfer_reservation_guard BEFORE INSERT ON "Reservation"
 FOR EACH ROW EXECUTE FUNCTION verify_internal_transfer_reservation();

-- Exact historical coverage at commit. Expiry/release does not erase history.
CREATE FUNCTION verify_internal_transfer_coverage() RETURNS trigger AS $$
DECLARE transfer_id TEXT;
BEGIN
 IF TG_TABLE_NAME='Reservation' THEN
  IF NEW."claimType"<>'internal_transfer' THEN RETURN NULL; END IF;
  transfer_id:=NEW."claimId";
 ELSE
  IF NEW.status<>'reserved' THEN RETURN NULL; END IF;
  transfer_id:=NEW.id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "InternalTransferRequestLine" WHERE "requestId"=transfer_id)
 OR EXISTS(
  SELECT 1 FROM "InternalTransferRequestLine" l
  LEFT JOIN "Reservation" r ON r."claimType"='internal_transfer' AND r."claimId"=transfer_id AND r."claimLineId"=l.id
  WHERE l."requestId"=transfer_id
  GROUP BY l.id,l.quantity HAVING COALESCE(sum(r.quantity),0)<>l.quantity
 ) THEN RAISE EXCEPTION 'Transfer reservation requires exact line coverage' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER internal_transfer_request_coverage AFTER UPDATE ON "InternalTransferRequest"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_internal_transfer_coverage();
CREATE CONSTRAINT TRIGGER internal_transfer_reservation_coverage AFTER INSERT ON "Reservation"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_internal_transfer_coverage();

-- In this release a transfer reservation can only be released or expire.
-- Future dispatch must introduce its own validated consumption authority.
CREATE FUNCTION guard_internal_transfer_reservation_history() RETURNS trigger AS $$
BEGIN
 IF OLD."claimType"<>'internal_transfer' THEN
  IF TG_OP='UPDATE' AND NEW."claimType"='internal_transfer' THEN
   RAISE EXCEPTION 'Cannot repurpose an existing reservation' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Transfer reservation history cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state')
 OR (OLD.state<>NEW.state AND (OLD.state<>'active' OR NEW.state NOT IN ('released','expired')))
 THEN RAISE EXCEPTION 'Transfer reservation provenance is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER internal_transfer_reservation_history_guard BEFORE UPDATE OR DELETE ON "Reservation"
 FOR EACH ROW EXECUTE FUNCTION guard_internal_transfer_reservation_history();
