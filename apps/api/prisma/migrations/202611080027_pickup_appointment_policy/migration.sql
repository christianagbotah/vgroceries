-- Customer collection appointments are independent of delivery transport slots.
-- All local times are interpreted in Africa/Accra (UTC year-round).
CREATE TABLE "PickupAppointmentPolicy" (
  "nodeId" TEXT PRIMARY KEY REFERENCES "LogisticsNode"(id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT false,
  "serviceDays" INTEGER[] NOT NULL,
  "opensAt" TEXT NOT NULL,
  "closesAt" TEXT NOT NULL,
  "slotMinutes" INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  "minLeadMinutes" INTEGER NOT NULL,
  "maxDaysAhead" INTEGER NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "pickup_policy_rules" CHECK (
    cardinality("serviceDays") BETWEEN 1 AND 7 AND
    "serviceDays" <@ ARRAY[1,2,3,4,5,6,7]::INTEGER[] AND
    "opensAt" ~ '^([01][0-9]|2[0-3]):(00|30)$' AND
    "closesAt" ~ '^([01][0-9]|2[0-3]):(00|30)$' AND
    "opensAt" < "closesAt" AND
    "slotMinutes" IN (30,60) AND
    capacity BETWEEN 1 AND 50 AND
    "minLeadMinutes" BETWEEN 30 AND 1440 AND
    "maxDaysAhead" BETWEEN 1 AND 14
  )
);
CREATE FUNCTION validate_pickup_appointment_policy() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LogisticsNode" n WHERE n.id=NEW."nodeId" AND n.kind='pickup_point') THEN
    RAISE EXCEPTION 'appointment policy requires a pickup point' USING ERRCODE='23514';
  END IF;
  IF (split_part(NEW."closesAt",':',1)::INTEGER*60+split_part(NEW."closesAt",':',2)::INTEGER) -
     (split_part(NEW."opensAt",':',1)::INTEGER*60+split_part(NEW."opensAt",':',2)::INTEGER)
     NOT BETWEEN 30 AND 720 THEN
    RAISE EXCEPTION 'opening window must be between 30 minutes and 12 hours' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER validate_pickup_policy BEFORE INSERT OR UPDATE ON "PickupAppointmentPolicy"
  FOR EACH ROW EXECUTE FUNCTION validate_pickup_appointment_policy();

CREATE TABLE "PickupAppointment" (
  "orderId" TEXT PRIMARY KEY REFERENCES "Order"(id) ON DELETE RESTRICT,
  "nodeId" TEXT NOT NULL REFERENCES "LogisticsNode"(id) ON DELETE RESTRICT,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  status TEXT NOT NULL,
  "bookedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "pickup_appointment_status" CHECK (
    (status IN ('booked','cancelled') AND "completedAt" IS NULL) OR
    (status='completed' AND "completedAt" IS NOT NULL)
  ),
  CONSTRAINT "pickup_appointment_window" CHECK (
    "endsAt" > "startsAt" AND "endsAt" <= "startsAt"+INTERVAL '60 minutes'
  )
);
CREATE INDEX "PickupAppointment_node_start_status_idx"
  ON "PickupAppointment"("nodeId","startsAt",status);
CREATE FUNCTION validate_pickup_appointment_node() RETURNS trigger AS $$
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
    IF NOT EXISTS (
      SELECT 1 FROM "Shipment" s JOIN "Order" o ON o.id=s."orderId"
      JOIN "PickupAppointmentPolicy" p ON p."nodeId"=NEW."nodeId"
      JOIN "LogisticsNode" n ON n.id=p."nodeId"
      WHERE s."orderId"=NEW."orderId" AND s.sequence=1
        AND s.status='ready_for_pickup' AND s."currentNodeId"=NEW."nodeId"
        AND s."currentLegId" IS NULL AND s."completedAt" IS NULL
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
CREATE TRIGGER validate_pickup_appointment BEFORE INSERT OR UPDATE ON "PickupAppointment"
  FOR EACH ROW EXECUTE FUNCTION validate_pickup_appointment_node();
