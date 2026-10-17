-- Close persistence-level bypasses around Dispatch + Rider authority.
-- Delivery jobs may only be rooted in an already completed dispatch handover,
-- and status/custody combinations must preserve physical custody truth.

CREATE OR REPLACE FUNCTION assert_delivery_job_authority_root() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Order" o
    JOIN "FulfilmentRun" f ON f."orderId" = o.id
    WHERE o.id = NEW."orderId"
      AND o.fulfilment = 'delivery'
      AND o."fulfilmentStatus" = 'dispatched'
      AND o."stockConsumedAt" IS NOT NULL
      AND o."cancelledAt" IS NULL
      AND f."handedOverAt" IS NOT NULL
      AND f."handoverKind" = 'dispatch'
      AND o."stockConsumedAt" <= NEW."assignedAt"
      AND f."handedOverAt" <= NEW."assignedAt"
  ) THEN
    RAISE EXCEPTION 'delivery job requires authoritative dispatch handover before assignment'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DeliveryJob_authority_root"
BEFORE INSERT OR UPDATE OF "orderId", "assignedAt" ON "DeliveryJob"
FOR EACH ROW EXECUTE FUNCTION assert_delivery_job_authority_root();

ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_status_custody_consistency" CHECK (
  ("status" = 'unassigned' AND "custodyState" IN ('dispatch','store_returned'))
  OR ("status" IN ('assigned','accepted') AND "custodyState" = 'dispatch')
  OR ("status" IN ('picked_up','out_for_delivery') AND "custodyState" IN ('rider','provider'))
  OR ("status" = 'delivered' AND "custodyState" = 'customer')
  OR ("status" IN ('failed','rescheduled') AND "custodyState" IN ('dispatch','rider','provider'))
  OR ("status" = 'return_to_store' AND "custodyState" IN ('return_pending','store_returned'))
);

ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_store_return_receipt_required" CHECK (
  "custodyState" <> 'store_returned' OR "returnedToStoreAt" IS NOT NULL
);
