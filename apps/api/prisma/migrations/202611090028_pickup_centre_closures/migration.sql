-- Centre calendar overrides: only explicit administrator closure.
-- Never cancel or evict paid customer appointments implicitly.
CREATE TABLE "PickupCentreClosure" (
  "nodeId" TEXT NOT NULL REFERENCES "LogisticsNode"(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  closed BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "PickupCentreClosure_pkey" PRIMARY KEY ("nodeId",date),
  CONSTRAINT "pickup_closure_reason" CHECK (
    (closed AND reason IS NOT NULL AND char_length(btrim(reason)) BETWEEN 3 AND 160)
    OR (NOT closed AND reason IS NULL)
  )
);
CREATE INDEX "PickupCentreClosure_date_closed_idx" ON "PickupCentreClosure"(date,closed);

CREATE FUNCTION validate_pickup_centre_closure() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LogisticsNode" n WHERE n.id=NEW."nodeId" AND n.kind='pickup_point') THEN
    RAISE EXCEPTION 'only pickup centres can have collection closures' USING ERRCODE='23514';
  END IF;
  IF NEW.date < (now() AT TIME ZONE 'Africa/Accra')::DATE OR
     NEW.date > (now() AT TIME ZONE 'Africa/Accra')::DATE + 365 THEN
    RAISE EXCEPTION 'centre closure date must be within one year and not in the past' USING ERRCODE='23514';
  END IF;
  -- Serialize direct-SQL writers as well as API booking and closure writes.
  -- The same centre/day key is acquired in the appointment trigger below.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pickup-calendar:'||NEW."nodeId"||':'||NEW.date::TEXT, 0));
  IF NEW.closed AND EXISTS (
    SELECT 1 FROM "PickupAppointment" a
    WHERE a."nodeId"=NEW."nodeId" AND a.status='booked'
      AND (a."startsAt" AT TIME ZONE 'Africa/Accra')::DATE=NEW.date
  ) THEN
    RAISE EXCEPTION 'cannot close a centre while customer appointments remain booked for the day'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER protect_pickup_centre_closure BEFORE INSERT OR UPDATE ON "PickupCentreClosure"
  FOR EACH ROW EXECUTE FUNCTION validate_pickup_centre_closure();

-- Preserve all pre-existing order, payment, stock, custody and collection rules.
-- Extend the booking guard with closed dates, not transport-slot policy.
CREATE OR REPLACE FUNCTION validate_pickup_appointment_node() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "OrderPickupSnapshot" p
    JOIN "Shipment" s ON s."orderId"=p."orderId" AND s.sequence=1
    WHERE p."orderId"=NEW."orderId" AND p."nodeId"=NEW."nodeId"
      AND s."destinationKind"='pickup_point'
      AND s."finalPickupNodeId"=NEW."nodeId"
  ) THEN
    RAISE EXCEPTION 'appointment requires a matching customer pickup shipment and order-time centre' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND
    (OLD."orderId"<>NEW."orderId" OR OLD."nodeId"<>NEW."nodeId" OR
      OLD.status='completed' OR (OLD.status='cancelled' AND NEW.status='completed')) THEN
    RAISE EXCEPTION 'invalid appointment ownership or terminal transition' USING ERRCODE='23514';
  END IF;
  IF NEW.status='completed' THEN
    IF TG_OP='INSERT' OR OLD.status<>'booked' OR NOT EXISTS (
      SELECT 1 FROM "Shipment" s JOIN "Order" o ON o.id=s."orderId"
      JOIN "ShipmentEvent" e ON e."shipmentId"=s.id AND e."eventKind"='customer_collected'
      WHERE s."orderId"=NEW."orderId" AND s.sequence=1
        AND s.status='completed' AND s.custody='customer' AND s."completedAt" IS NOT NULL
        AND o."fulfilmentStatus"='collected' AND NEW."completedAt"=s."completedAt"
    ) THEN RAISE EXCEPTION 'completed appointment requires verified customer collection evidence' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.status='booked' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'pickup-calendar:'||NEW."nodeId"||':'||
        ((NEW."startsAt" AT TIME ZONE 'Africa/Accra')::DATE)::TEXT, 0));
    IF NOT EXISTS (
      SELECT 1 FROM "Shipment" s JOIN "Order" o ON o.id=s."orderId"
      JOIN "PickupAppointmentPolicy" p ON p."nodeId"=NEW."nodeId"
      JOIN "LogisticsNode" n ON n.id=p."nodeId"
      WHERE s."orderId"=NEW."orderId" AND s.sequence=1
        AND s.status='ready_for_pickup' AND s."currentNodeId"=NEW."nodeId"
        AND s."currentLegId" IS NULL AND s."completedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "PickupCentreClosure" c WHERE c."nodeId"=NEW."nodeId"
            AND c.date=(NEW."startsAt" AT TIME ZONE 'Africa/Accra')::DATE AND c.closed=true
        )
        AND o."paymentStatus"='succeeded' AND o."cancelledAt" IS NULL
        AND o."fulfilmentStatus"='dispatched'
        AND n.active=true AND n."customerVisible"=true AND p.active=true
        AND EXTRACT(ISODOW FROM (NEW."startsAt" AT TIME ZONE 'Africa/Accra'))::INTEGER=ANY(p."serviceDays")
        AND TO_CHAR(NEW."startsAt" AT TIME ZONE 'Africa/Accra','HH24:MI')>=p."opensAt"
        AND TO_CHAR(NEW."endsAt" AT TIME ZONE 'Africa/Accra','HH24:MI')<=p."closesAt"
        AND NEW."endsAt"=NEW."startsAt"+p."slotMinutes"*INTERVAL '1 minute'
        AND NEW."startsAt">=now()+p."minLeadMinutes"*INTERVAL '1 minute'
        AND (NEW."startsAt" AT TIME ZONE 'Africa/Accra')::DATE
          < (now() AT TIME ZONE 'Africa/Accra')::DATE+p."maxDaysAhead"
        AND NOT EXISTS (
          SELECT 1 FROM "Refund" r WHERE r."orderId"=NEW."orderId"
            AND r.status IN ('awaiting_approval','approved','processing','requires_review','succeeded')
        )
    ) THEN RAISE EXCEPTION 'booking requires verified paid pickup readiness and valid centre hours' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
