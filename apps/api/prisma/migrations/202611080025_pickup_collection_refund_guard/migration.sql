-- Defence in depth: no SQL-based customer collection event or receipt can
-- bypass an unresolved/issued refund for the order, even when its legacy
-- paymentStatus still says succeeded. This does not write Refund/Payments.
CREATE FUNCTION prevent_customer_collection_during_refund() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "Shipment" s
      JOIN "Refund" r ON r."orderId"=s."orderId"
     WHERE s.id=NEW."shipmentId"
       AND r.status IN ('awaiting_approval','approved','processing','requires_review','succeeded')
  ) THEN
    RAISE EXCEPTION 'customer collection is forbidden during pending or issued refunds'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shipment_collection_refund_event_guard
  BEFORE INSERT ON "ShipmentEvent"
  FOR EACH ROW WHEN (NEW."eventKind"='customer_collected')
  EXECUTE FUNCTION prevent_customer_collection_during_refund();

CREATE TRIGGER shipment_collection_refund_receipt_guard
  BEFORE INSERT ON "ShipmentCollectionReceipt"
  FOR EACH ROW EXECUTE FUNCTION prevent_customer_collection_during_refund();
