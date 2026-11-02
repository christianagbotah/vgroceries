-- Wave L2 Shipment Route Execution
-- Runtime shipment truth is normalized and immutable where it snapshots route configuration.

CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "workflowVersionId" TEXT NOT NULL,
    "routeRuleId" TEXT NOT NULL,
    "routeRevision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "originNodeId" TEXT NOT NULL,
    "destinationKind" TEXT NOT NULL,
    "finalPickupNodeId" TEXT,
    "destinationAddress" JSONB,
    "currentNodeId" TEXT,
    "currentLegId" TEXT,
    "custody" TEXT,
    "activatedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Shipment_sequence_positive" CHECK ("sequence" > 0),
    CONSTRAINT "Shipment_route_revision_positive" CHECK ("routeRevision" > 0),
    CONSTRAINT "Shipment_version_positive" CHECK ("version" > 0),
    CONSTRAINT "Shipment_status_valid" CHECK ("status" IN ('planned','at_node','in_transit','final_mile_ready','final_mile','ready_for_pickup','completed','exception')),
    CONSTRAINT "Shipment_destination_kind_valid" CHECK ("destinationKind" IN ('doorstep','pickup_point')),
    CONSTRAINT "Shipment_destination_shape_valid" CHECK (
      ("destinationKind" = 'doorstep' AND "finalPickupNodeId" IS NULL AND "destinationAddress" IS NOT NULL) OR
      ("destinationKind" = 'pickup_point' AND "finalPickupNodeId" IS NOT NULL AND "destinationAddress" IS NULL)
    ),
    CONSTRAINT "Shipment_custody_valid" CHECK ("custody" IS NULL OR "custody" IN ('source_staff','node_staff','linehaul_internal','provider','rider','customer','return_transit')),
    CONSTRAINT "Shipment_projection_single_location" CHECK ("currentNodeId" IS NULL OR "currentLegId" IS NULL),
    CONSTRAINT "Shipment_completion_after_activation" CHECK ("completedAt" IS NULL OR ("activatedAt" IS NOT NULL AND "completedAt" >= "activatedAt"))
);

CREATE TABLE "ShipmentStop" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "routeRevision" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeCode" TEXT NOT NULL,
    "nodePublicName" TEXT NOT NULL,
    "nodeKind" TEXT NOT NULL,
    "nodeKindLabel" TEXT,
    "terminalRole" TEXT NOT NULL,
    "plannedArrivalAt" TIMESTAMPTZ(3),
    "plannedDepartureAt" TIMESTAMPTZ(3),
    CONSTRAINT "ShipmentStop_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShipmentStop_route_revision_positive" CHECK ("routeRevision" > 0),
    CONSTRAINT "ShipmentStop_position_positive" CHECK ("position" > 0),
    CONSTRAINT "ShipmentStop_node_kind_valid" CHECK ("nodeKind" IN ('head_office','warehouse','fulfilment_center','hub','outlet','pickup_point','cross_dock','partner_facility','other')),
    CONSTRAINT "ShipmentStop_terminal_role_valid" CHECK ("terminalRole" IN ('transit','customer_pickup','final_mile_dispatch')),
    CONSTRAINT "ShipmentStop_planned_time_order" CHECK ("plannedArrivalAt" IS NULL OR "plannedDepartureAt" IS NULL OR "plannedDepartureAt" >= "plannedArrivalAt")
);

CREATE TABLE "ShipmentLeg" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "routeRevision" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "originStopId" TEXT NOT NULL,
    "destinationStopId" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "providerKey" TEXT,
    "typicalMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "departedAt" TIMESTAMPTZ(3),
    "arrivedAt" TIMESTAMPTZ(3),
    "slaDeadline" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ShipmentLeg_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShipmentLeg_route_revision_positive" CHECK ("routeRevision" > 0),
    CONSTRAINT "ShipmentLeg_position_positive" CHECK ("position" > 0),
    CONSTRAINT "ShipmentLeg_typical_minutes_positive" CHECK ("typicalMinutes" > 0),
    CONSTRAINT "ShipmentLeg_version_positive" CHECK ("version" > 0),
    CONSTRAINT "ShipmentLeg_mode_valid" CHECK ("mode" IN ('internal_transfer','linehaul','third_party','customer_pickup','last_mile')),
    CONSTRAINT "ShipmentLeg_status_valid" CHECK ("status" IN ('planned','ready','in_transit','arrived','exception','superseded')),
    CONSTRAINT "ShipmentLeg_actual_time_order" CHECK ("arrivedAt" IS NULL OR ("departedAt" IS NOT NULL AND "arrivedAt" >= "departedAt"))
);

CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "routeRevision" INTEGER NOT NULL,
    "legId" TEXT,
    "nodeId" TEXT,
    "eventKind" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "fromCustody" TEXT,
    "toCustody" TEXT,
    "customerTitle" TEXT,
    "customerDetail" TEXT,
    "safeMetadata" JSONB NOT NULL,
    "requestId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShipmentEvent_route_revision_positive" CHECK ("routeRevision" > 0),
    CONSTRAINT "ShipmentEvent_kind_valid" CHECK ("eventKind" IN ('fulfilment_handed_over','shipment_departed','shipment_arrived','shipment_handover','shipment_rerouted','shipment_delayed','ready_for_pickup','customer_collected','rider_assigned','rider_accepted','rider_picked_up','out_for_delivery','delivery_failed','delivery_rescheduled','delivered','returned_toward_store','custom_checkpoint')),
    CONSTRAINT "ShipmentEvent_actor_kind_valid" CHECK ("actorKind" IN ('staff','rider','system','provider','customer')),
    CONSTRAINT "ShipmentEvent_from_custody_valid" CHECK ("fromCustody" IS NULL OR "fromCustody" IN ('source_staff','node_staff','linehaul_internal','provider','rider','customer','return_transit')),
    CONSTRAINT "ShipmentEvent_to_custody_valid" CHECK ("toCustody" IS NULL OR "toCustody" IN ('source_staff','node_staff','linehaul_internal','provider','rider','customer','return_transit')),
    CONSTRAINT "ShipmentEvent_metadata_object" CHECK (jsonb_typeof("safeMetadata") = 'object'),
    CONSTRAINT "ShipmentEvent_customer_title_bounded" CHECK ("customerTitle" IS NULL OR (char_length(btrim("customerTitle")) BETWEEN 1 AND 160)),
    CONSTRAINT "ShipmentEvent_customer_detail_bounded" CHECK ("customerDetail" IS NULL OR (char_length(btrim("customerDetail")) BETWEEN 1 AND 500)),
    CONSTRAINT "ShipmentEvent_request_id_present" CHECK (char_length(btrim("requestId")) > 0)
);

CREATE UNIQUE INDEX "Shipment_currentLegId_key" ON "Shipment"("currentLegId");
CREATE INDEX "Shipment_status_updatedAt_idx" ON "Shipment"("status", "updatedAt");
CREATE INDEX "Shipment_originNodeId_status_idx" ON "Shipment"("originNodeId", "status");
CREATE INDEX "Shipment_currentNodeId_status_idx" ON "Shipment"("currentNodeId", "status");
CREATE INDEX "Shipment_routeRuleId_routeRevision_idx" ON "Shipment"("routeRuleId", "routeRevision");
CREATE UNIQUE INDEX "Shipment_orderId_sequence_key" ON "Shipment"("orderId", "sequence");

CREATE INDEX "ShipmentStop_nodeId_idx" ON "ShipmentStop"("nodeId");
CREATE UNIQUE INDEX "ShipmentStop_shipmentId_routeRevision_position_key" ON "ShipmentStop"("shipmentId", "routeRevision", "position");

CREATE INDEX "ShipmentLeg_originStopId_idx" ON "ShipmentLeg"("originStopId");
CREATE INDEX "ShipmentLeg_destinationStopId_idx" ON "ShipmentLeg"("destinationStopId");
CREATE INDEX "ShipmentLeg_laneId_idx" ON "ShipmentLeg"("laneId");
CREATE INDEX "ShipmentLeg_status_updatedAt_idx" ON "ShipmentLeg"("status", "updatedAt");
CREATE UNIQUE INDEX "ShipmentLeg_shipmentId_routeRevision_position_key" ON "ShipmentLeg"("shipmentId", "routeRevision", "position");

CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_id_idx" ON "ShipmentEvent"("shipmentId", "occurredAt", "id");
CREATE INDEX "ShipmentEvent_legId_occurredAt_idx" ON "ShipmentEvent"("legId", "occurredAt");
CREATE INDEX "ShipmentEvent_nodeId_occurredAt_idx" ON "ShipmentEvent"("nodeId", "occurredAt");
CREATE INDEX "ShipmentEvent_requestId_idx" ON "ShipmentEvent"("requestId");

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "DeliveryWorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_routeRuleId_fkey" FOREIGN KEY ("routeRuleId") REFERENCES "DeliveryRouteRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_originNodeId_fkey" FOREIGN KEY ("originNodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_finalPickupNodeId_fkey" FOREIGN KEY ("finalPickupNodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_currentNodeId_fkey" FOREIGN KEY ("currentNodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShipmentStop" ADD CONSTRAINT "ShipmentStop_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentStop" ADD CONSTRAINT "ShipmentStop_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_originStopId_fkey" FOREIGN KEY ("originStopId") REFERENCES "ShipmentStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_destinationStopId_fkey" FOREIGN KEY ("destinationStopId") REFERENCES "ShipmentStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "LogisticsLane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_currentLegId_fkey" FOREIGN KEY ("currentLegId") REFERENCES "ShipmentLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_legId_fkey" FOREIGN KEY ("legId") REFERENCES "ShipmentLeg"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Freeze the order/workflow/destination identity of a shipment. Reroutes may change only routeRuleId/routeRevision and execution projection.
CREATE OR REPLACE FUNCTION prevent_shipment_identity_rewrite() RETURNS trigger AS $$
BEGIN
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
     OR NEW."workflowVersionId" IS DISTINCT FROM OLD."workflowVersionId"
     OR NEW."originNodeId" IS DISTINCT FROM OLD."originNodeId"
     OR NEW."destinationKind" IS DISTINCT FROM OLD."destinationKind"
     OR NEW."finalPickupNodeId" IS DISTINCT FROM OLD."finalPickupNodeId"
     OR NEW."destinationAddress" IS DISTINCT FROM OLD."destinationAddress"
  THEN
    RAISE EXCEPTION 'shipment identity snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_identity_immutable BEFORE UPDATE ON "Shipment"
FOR EACH ROW EXECUTE FUNCTION prevent_shipment_identity_rewrite();

-- A shipment must start from a route rule that matches its frozen workflow/origin/destination.
CREATE OR REPLACE FUNCTION validate_shipment_route_rule() RETURNS trigger AS $$
DECLARE r RECORD;
BEGIN
  SELECT "workflowVersionId", "originNodeId", "destinationKind", "finalPickupNodeId" INTO r
  FROM "DeliveryRouteRule" WHERE id = NEW."routeRuleId";
  IF NOT FOUND THEN RAISE EXCEPTION 'shipment route rule does not exist'; END IF;
  IF r."workflowVersionId" IS DISTINCT FROM NEW."workflowVersionId"
     OR r."destinationKind" IS DISTINCT FROM NEW."destinationKind"
     OR r."finalPickupNodeId" IS DISTINCT FROM NEW."finalPickupNodeId"
     OR (TG_OP = 'INSERT' AND r."originNodeId" IS DISTINCT FROM NEW."originNodeId")
  THEN
    RAISE EXCEPTION 'shipment route rule does not match frozen shipment authority';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_route_rule_guard BEFORE INSERT OR UPDATE OF "routeRuleId" ON "Shipment"
FOR EACH ROW EXECUTE FUNCTION validate_shipment_route_rule();

-- Stop snapshots must exactly reflect the live node at the moment they are created, then remain immutable.
CREATE OR REPLACE FUNCTION validate_shipment_stop_snapshot() RETURNS trigger AS $$
DECLARE n RECORD;
BEGIN
  SELECT code, "publicName", kind, "kindLabel" INTO n FROM "LogisticsNode" WHERE id = NEW."nodeId";
  IF NOT FOUND THEN RAISE EXCEPTION 'shipment stop node does not exist'; END IF;
  IF n.code IS DISTINCT FROM NEW."nodeCode"
     OR n."publicName" IS DISTINCT FROM NEW."nodePublicName"
     OR n.kind IS DISTINCT FROM NEW."nodeKind"
     OR n."kindLabel" IS DISTINCT FROM NEW."nodeKindLabel"
  THEN RAISE EXCEPTION 'shipment stop snapshot does not match node'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_stop_snapshot_guard BEFORE INSERT ON "ShipmentStop"
FOR EACH ROW EXECUTE FUNCTION validate_shipment_stop_snapshot();

CREATE OR REPLACE FUNCTION prevent_shipment_stop_rewrite() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'shipment stop snapshots are immutable'; END IF;
  RAISE EXCEPTION 'shipment stop snapshots are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_stop_immutable BEFORE UPDATE OR DELETE ON "ShipmentStop"
FOR EACH ROW EXECUTE FUNCTION prevent_shipment_stop_rewrite();

-- Leg endpoints must be adjacent stops in the same shipment/revision, and the lane snapshot must match at creation.
CREATE OR REPLACE FUNCTION validate_shipment_leg_snapshot() RETURNS trigger AS $$
DECLARE o RECORD; d RECORD; l RECORD;
BEGIN
  SELECT "shipmentId", "routeRevision", position, "nodeId" INTO o FROM "ShipmentStop" WHERE id = NEW."originStopId";
  SELECT "shipmentId", "routeRevision", position, "nodeId" INTO d FROM "ShipmentStop" WHERE id = NEW."destinationStopId";
  SELECT "originNodeId", "destinationNodeId", mode, "providerKey", "typicalMinutes" INTO l FROM "LogisticsLane" WHERE id = NEW."laneId";
  IF o IS NULL OR d IS NULL OR l IS NULL THEN RAISE EXCEPTION 'shipment leg references missing topology'; END IF;
  IF o."shipmentId" IS DISTINCT FROM NEW."shipmentId" OR d."shipmentId" IS DISTINCT FROM NEW."shipmentId"
     OR o."routeRevision" IS DISTINCT FROM NEW."routeRevision" OR d."routeRevision" IS DISTINCT FROM NEW."routeRevision"
     OR o.position IS DISTINCT FROM NEW.position OR d.position IS DISTINCT FROM NEW.position + 1
  THEN RAISE EXCEPTION 'shipment leg stops must be adjacent in the same route revision'; END IF;
  IF l."originNodeId" IS DISTINCT FROM o."nodeId" OR l."destinationNodeId" IS DISTINCT FROM d."nodeId"
     OR l.mode IS DISTINCT FROM NEW.mode OR l."providerKey" IS DISTINCT FROM NEW."providerKey"
     OR l."typicalMinutes" IS DISTINCT FROM NEW."typicalMinutes"
  THEN RAISE EXCEPTION 'shipment leg snapshot does not match selected lane'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_leg_snapshot_guard BEFORE INSERT ON "ShipmentLeg"
FOR EACH ROW EXECUTE FUNCTION validate_shipment_leg_snapshot();

CREATE OR REPLACE FUNCTION prevent_shipment_leg_snapshot_rewrite() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'shipment leg history cannot be deleted'; END IF;
  IF NEW."shipmentId" IS DISTINCT FROM OLD."shipmentId"
     OR NEW."routeRevision" IS DISTINCT FROM OLD."routeRevision"
     OR NEW.position IS DISTINCT FROM OLD.position
     OR NEW."originStopId" IS DISTINCT FROM OLD."originStopId"
     OR NEW."destinationStopId" IS DISTINCT FROM OLD."destinationStopId"
     OR NEW."laneId" IS DISTINCT FROM OLD."laneId"
     OR NEW.mode IS DISTINCT FROM OLD.mode
     OR NEW."providerKey" IS DISTINCT FROM OLD."providerKey"
     OR NEW."typicalMinutes" IS DISTINCT FROM OLD."typicalMinutes"
  THEN RAISE EXCEPTION 'shipment leg route snapshot is immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_leg_snapshot_immutable BEFORE UPDATE OR DELETE ON "ShipmentLeg"
FOR EACH ROW EXECUTE FUNCTION prevent_shipment_leg_snapshot_rewrite();

-- Current-leg projection may only reference a leg owned by the same shipment/current route revision.
CREATE OR REPLACE FUNCTION validate_shipment_current_leg() RETURNS trigger AS $$
DECLARE l RECORD;
BEGIN
  IF NEW."currentLegId" IS NULL THEN RETURN NEW; END IF;
  SELECT "shipmentId", "routeRevision" INTO l FROM "ShipmentLeg" WHERE id = NEW."currentLegId";
  IF NOT FOUND OR l."shipmentId" IS DISTINCT FROM NEW.id OR l."routeRevision" IS DISTINCT FROM NEW."routeRevision"
  THEN RAISE EXCEPTION 'shipment current leg must belong to current route revision'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_current_leg_guard BEFORE INSERT OR UPDATE OF "currentLegId", "routeRevision" ON "Shipment"
FOR EACH ROW EXECUTE FUNCTION validate_shipment_current_leg();

-- Event references, when supplied, must point back into the same shipment/revision.
CREATE OR REPLACE FUNCTION validate_shipment_event_reference() RETURNS trigger AS $$
DECLARE l RECORD;
BEGIN
  IF NEW."legId" IS NOT NULL THEN
    SELECT "shipmentId", "routeRevision" INTO l FROM "ShipmentLeg" WHERE id = NEW."legId";
    IF NOT FOUND OR l."shipmentId" IS DISTINCT FROM NEW."shipmentId" OR l."routeRevision" IS DISTINCT FROM NEW."routeRevision"
    THEN RAISE EXCEPTION 'shipment event leg must belong to shipment route revision'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_event_reference_guard BEFORE INSERT ON "ShipmentEvent"
FOR EACH ROW EXECUTE FUNCTION validate_shipment_event_reference();

CREATE OR REPLACE FUNCTION prevent_shipment_event_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'shipment events are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER shipment_event_append_only BEFORE UPDATE OR DELETE ON "ShipmentEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_shipment_event_rewrite();
