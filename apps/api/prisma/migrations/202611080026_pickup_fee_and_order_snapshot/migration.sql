-- An optional customer pickup-centre transport fee, in pesewas.
-- NULL preserves the existing delivery-zone fee (no silent discount).
ALTER TABLE "LogisticsNode" ADD COLUMN "pickupFeeMinor" INTEGER;
ALTER TABLE "LogisticsNode" ADD CONSTRAINT "LogisticsNode_pickupFeeMinor_check"
  CHECK ("pickupFeeMinor" IS NULL OR
    ("kind"='pickup_point' AND "pickupFeeMinor">=0 AND "pickupFeeMinor"<=1000000));

-- Freeze checkout-visible centre location, transport window and price policy.
-- Never project the mutable admin logistics node directly into an existing order.
CREATE TABLE "OrderPickupSnapshot" (
  "orderId" TEXT PRIMARY KEY REFERENCES "Order"(id) ON DELETE RESTRICT,
  "nodeId" TEXT NOT NULL REFERENCES "LogisticsNode"(id) ON DELETE RESTRICT,
  "name" TEXT NOT NULL,
  "locality" TEXT,
  "region" TEXT,
  "addressLine" TEXT,
  "ghanaPostGps" TEXT,
  "directions" TEXT,
  "contact" TEXT,
  "feeBasis" TEXT NOT NULL,
  "feeMinor" INTEGER NOT NULL,
  "transportWindowStart" TIMESTAMPTZ(3),
  "transportWindowEnd" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "OrderPickupSnapshot_fee_check"
    CHECK ("feeBasis" IN ('zone_delivery','centre_pickup') AND "feeMinor">=0),
  CONSTRAINT "OrderPickupSnapshot_window_check"
    CHECK (("transportWindowStart" IS NULL AND "transportWindowEnd" IS NULL) OR
      ("transportWindowStart" IS NOT NULL AND "transportWindowEnd" IS NOT NULL
       AND "transportWindowEnd">"transportWindowStart")),
  CONSTRAINT "OrderPickupSnapshot_text_check"
    CHECK (length("name") BETWEEN 1 AND 160
      AND length(coalesce("locality",''))<=120
      AND length(coalesce("region",''))<=120
      AND length(coalesce("addressLine",''))<=240
      AND length(coalesce("ghanaPostGps",''))<=80
      AND length(coalesce("directions",''))<=500
      AND length(coalesce("contact",''))<=160)
);
CREATE INDEX "OrderPickupSnapshot_nodeId_idx" ON "OrderPickupSnapshot"("nodeId");

CREATE FUNCTION protect_order_pickup_snapshot() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'pickup checkout snapshots are immutable'
      USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Order" o
    JOIN "Shipment" s ON s."orderId"=o.id AND s.sequence=1
    JOIN "DeliveryZone" z ON z.id=o."zoneId" AND z.active=true
    JOIN "LogisticsNode" n ON n.id=NEW."nodeId" AND n.active=true
      AND n.kind='pickup_point' AND n."customerVisible"=true
    WHERE o.id=NEW."orderId"
      AND o.fulfilment='delivery'
      AND o."deliveryFeeMinor"=NEW."feeMinor"
      AND s."destinationKind"='pickup_point'
      AND s."finalPickupNodeId"=NEW."nodeId"
      AND NEW.name=n."publicName"
      AND NEW.locality IS NOT DISTINCT FROM n.locality
      AND NEW.region IS NOT DISTINCT FROM n.region
      AND NEW."addressLine" IS NOT DISTINCT FROM n."addressLine"
      AND NEW."ghanaPostGps" IS NOT DISTINCT FROM n."ghanaPostGps"
      AND NEW.directions IS NOT DISTINCT FROM n."publicDirections"
      AND NEW.contact IS NOT DISTINCT FROM n."publicContact"
      AND (
        (n."pickupFeeMinor" IS NULL AND NEW."feeBasis"='zone_delivery'
          AND NEW."feeMinor"=z."feeMinor")
        OR
        (n."pickupFeeMinor" IS NOT NULL AND NEW."feeBasis"='centre_pickup'
          AND NEW."feeMinor"=n."pickupFeeMinor")
      )
      AND (
        (o."slotId" IS NULL AND NEW."transportWindowStart" IS NULL
          AND NEW."transportWindowEnd" IS NULL)
        OR EXISTS (
          SELECT 1 FROM "DeliverySlot" ds
          WHERE ds.id=o."slotId"
            AND ds."startsAt"=NEW."transportWindowStart"
            AND ds."endsAt"=NEW."transportWindowEnd"
        )
      )
  ) THEN
    RAISE EXCEPTION 'pickup checkout snapshot requires matching booked shipment and fee'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_pickup_snapshot_insert BEFORE INSERT ON "OrderPickupSnapshot"
  FOR EACH ROW EXECUTE FUNCTION protect_order_pickup_snapshot();
CREATE TRIGGER protect_pickup_snapshot_update BEFORE UPDATE OR DELETE ON "OrderPickupSnapshot"
  FOR EACH ROW EXECUTE FUNCTION protect_order_pickup_snapshot();
