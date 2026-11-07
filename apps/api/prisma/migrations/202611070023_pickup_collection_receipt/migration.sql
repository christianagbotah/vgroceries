-- Private, one-per-shipment collection proof at an authoritative terminal pickup point.
-- No change to payment, stock, dispatch, reservation or COD ownership.
CREATE TABLE "ShipmentCollectionReceipt" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "staffActorId" TEXT NOT NULL,
  "receiverName" TEXT NOT NULL,
  "identityCheck" TEXT NOT NULL,
  "verificationKeyVersion" INTEGER NOT NULL,
  "collectedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentCollectionReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShipmentCollectionReceipt_receiverName_valid" CHECK (char_length(btrim("receiverName")) BETWEEN 2 AND 160),
  CONSTRAINT "ShipmentCollectionReceipt_identityCheck_valid" CHECK ("identityCheck" IN ('recipient_photo_id_checked','authorized_representative_photo_id_checked')),
  CONSTRAINT "ShipmentCollectionReceipt_verificationVersion_positive" CHECK ("verificationKeyVersion" > 0),
  CONSTRAINT "ShipmentCollectionReceipt_staffActorId_present" CHECK (char_length(btrim("staffActorId")) > 0)
);
CREATE UNIQUE INDEX "ShipmentCollectionReceipt_shipmentId_key" ON "ShipmentCollectionReceipt"("shipmentId");
CREATE UNIQUE INDEX "ShipmentCollectionReceipt_eventId_key" ON "ShipmentCollectionReceipt"("eventId");
CREATE INDEX "ShipmentCollectionReceipt_orderId_collectedAt_idx" ON "ShipmentCollectionReceipt"("orderId", "collectedAt");
CREATE INDEX "ShipmentCollectionReceipt_staffActorId_collectedAt_idx" ON "ShipmentCollectionReceipt"("staffActorId", "collectedAt");
ALTER TABLE "ShipmentCollectionReceipt" ADD CONSTRAINT "ShipmentCollectionReceipt_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentCollectionReceipt" ADD CONSTRAINT "ShipmentCollectionReceipt_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentCollectionReceipt" ADD CONSTRAINT "ShipmentCollectionReceipt_nodeId_fkey"
  FOREIGN KEY ("nodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentCollectionReceipt" ADD CONSTRAINT "ShipmentCollectionReceipt_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "ShipmentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Even privileged direct database writes must match immutable shipment/event evidence.
CREATE FUNCTION validate_shipment_collection_receipt() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Shipment" s
    JOIN "Order" o ON o.id=s."orderId"
    JOIN "ShipmentEvent" e ON e.id=NEW."eventId" AND e."shipmentId"=s.id
    JOIN "User" staff ON staff.id=NEW."staffActorId" AND staff.role='admin' AND staff.active=true
    JOIN "FulfilmentRun" fr ON fr."orderId"=s."orderId" AND fr."handedOverAt" IS NOT NULL
    WHERE s.id=NEW."shipmentId"
      AND s."orderId"=NEW."orderId"
      AND s."destinationKind"='pickup_point'
      AND s."finalPickupNodeId"=NEW."nodeId"
      AND s.status='completed'
      AND s.custody='customer'
      AND s."currentNodeId" IS NULL
      AND s."currentLegId" IS NULL
      AND o."paymentStatus"='succeeded'
      AND o."paymentMethod" IN ('electronic','mobile_money','card_hosted','bank_transfer')
      AND o."stockConsumedAt" IS NOT NULL
      AND NEW."verificationKeyVersion"=o."verificationKeyVersion"
      AND s."completedAt" IS NOT NULL
      AND e."eventKind"='customer_collected'
      AND e."nodeId"=NEW."nodeId"
      AND e."actorKind"='staff'
      AND e."actorId"=NEW."staffActorId"
      AND e."toCustody"='customer'
      AND e."safeMetadata"->>'receiptId'=NEW.id
      AND e."occurredAt"=NEW."collectedAt"
      AND o."fulfilmentStatus"='collected'
  ) THEN
    RAISE EXCEPTION 'collection receipt must match completed shipment and collection event'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_collection_receipt_guard BEFORE INSERT ON "ShipmentCollectionReceipt"
  FOR EACH ROW EXECUTE FUNCTION validate_shipment_collection_receipt();

CREATE FUNCTION prevent_shipment_collection_receipt_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'shipment collection receipts are immutable' USING ERRCODE='23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_collection_receipt_immutable BEFORE UPDATE OR DELETE ON "ShipmentCollectionReceipt"
  FOR EACH ROW EXECUTE FUNCTION prevent_shipment_collection_receipt_rewrite();
