-- The foundation shipped placeholder position-level reservations only.
-- No production reservation command existed, so these pre-commerce rows carry
-- no claim/lot provenance and must not be guessed into durable allocations.
DELETE FROM "Reservation";

ALTER TABLE "Reservation"
  ADD COLUMN "lotId" TEXT,
  ADD COLUMN "claimType" TEXT,
  ADD COLUMN "claimId" TEXT,
  ADD COLUMN "claimLineId" TEXT,
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Reservation"
  ALTER COLUMN "lotId" SET NOT NULL,
  ALTER COLUMN "claimType" SET NOT NULL,
  ALTER COLUMN "claimId" SET NOT NULL,
  ALTER COLUMN "claimLineId" SET NOT NULL;

CREATE UNIQUE INDEX "StockLot_id_positionId_key"
  ON "StockLot"("id","positionId");

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_lotId_positionId_fkey"
  FOREIGN KEY ("lotId","positionId") REFERENCES "StockLot"("id","positionId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Reservation_claimType_claimId_claimLineId_lotId_key"
  ON "Reservation"("claimType","claimId","claimLineId","lotId");
CREATE INDEX "Reservation_lotId_state_expiresAt_idx"
  ON "Reservation"("lotId","state","expiresAt");
CREATE INDEX "Reservation_claimType_claimId_state_idx"
  ON "Reservation"("claimType","claimId","state");

ALTER TABLE "Reservation" DROP CONSTRAINT reservation_state;
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_state
  CHECK (state IN ('active','released','consumed','expired'));
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_claim_type
  CHECK ("claimType" IN ('order','pos_draft'));

DROP VIEW "variant_availability";
CREATE VIEW "variant_availability" AS
SELECT sp.id AS "positionId", sp."variantId", sp."locationId", sp."safetyStock",
  stock.quantity AS "sellablePhysical", holds.quantity AS reserved,
  CASE WHEN loc.active AND v.active THEN GREATEST(0, stock.quantity - holds.quantity - sp."safetyStock") ELSE 0 END AS "availableToSell"
FROM "StockPosition" sp
JOIN "Location" loc ON loc.id=sp."locationId"
JOIN "Variant" v ON v.id=sp."variantId"
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(l.quantity),0) AS quantity FROM "StockLot" l
  WHERE l."positionId"=sp.id AND l.kind='regular' AND NOT l.quarantined
    AND (l."expiryDate" IS NULL OR l."expiryDate">(now() AT TIME ZONE 'UTC')::date)
) stock
CROSS JOIN LATERAL (
  SELECT COALESCE(sum(r.quantity),0) AS quantity FROM "Reservation" r
  WHERE r."positionId"=sp.id AND r.state='active' AND r."expiresAt">now()
) holds;
