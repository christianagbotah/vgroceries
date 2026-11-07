-- Prevent a direct SQL event insertion from inventing customer-facing pickup
-- readiness or collection before the authoritative Shipment/Order transition.
-- This protects the existing customer tracking projector, which reads events.
CREATE FUNCTION validate_pickup_terminal_event() RETURNS trigger AS $$
BEGIN
  IF NEW."eventKind" = 'ready_for_pickup' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "Shipment" s
      WHERE s.id=NEW."shipmentId"
        AND s."destinationKind"='pickup_point'
        AND s.status='ready_for_pickup'
        AND s."currentNodeId"=s."finalPickupNodeId"
        AND s."currentLegId" IS NULL
        AND s."finalPickupNodeId"=NEW."nodeId"
        AND s."routeRevision"=NEW."routeRevision"
        AND NEW."actorKind"='staff'
    ) THEN
      RAISE EXCEPTION 'pickup readiness event requires a real terminal arrival'
        USING ERRCODE='23514';
    END IF;
  ELSIF NEW."eventKind" = 'customer_collected' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "Shipment" s
      JOIN "Order" o ON o.id=s."orderId"
      JOIN "User" staff ON staff.id=NEW."actorId" AND staff.role='admin' AND staff.active=true
      WHERE s.id=NEW."shipmentId"
        AND s."destinationKind"='pickup_point'
        AND s.status='completed'
        AND s.custody='customer'
        AND s."completedAt" IS NOT NULL
        AND s."currentNodeId" IS NULL
        AND s."currentLegId" IS NULL
        AND s."finalPickupNodeId"=NEW."nodeId"
        AND s."routeRevision"=NEW."routeRevision"
        AND o."fulfilmentStatus"='collected'
        AND o."paymentStatus"='succeeded'
        AND o."stockConsumedAt" IS NOT NULL
        AND NEW."actorKind"='staff'
        AND NEW."toCustody"='customer'
        AND jsonb_typeof(NEW."safeMetadata"->'receiptId')='string'
    ) THEN
      RAISE EXCEPTION 'customer collection event requires completed paid pickup'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pickup_terminal_event_integrity BEFORE INSERT ON "ShipmentEvent"
FOR EACH ROW EXECUTE FUNCTION validate_pickup_terminal_event();
