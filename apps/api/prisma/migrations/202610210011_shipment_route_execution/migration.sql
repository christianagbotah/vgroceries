-- Wave L2: immutable per-order shipment route execution and final-mile readiness gating.
-- Historical orders remain legacy-compatible: no shipment facts are backfilled.

ALTER TABLE "Order"
  ADD COLUMN "logisticsExecutionRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Shipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "workflowVersionId" TEXT NOT NULL,
  "routeRuleId" TEXT,
  "status" TEXT NOT NULL,
  "originNodeId" TEXT NOT NULL,
  "destinationKind" TEXT NOT NULL,
  "finalPickupNodeId" TEXT,
  "destinationAddressSnapshot" JSONB,
  "currentRouteRevision" INTEGER NOT NULL DEFAULT 1,
  "currentNodeId" TEXT,
  "currentLegId" TEXT,
  "custodyState" TEXT,
  "activatedAt" TIMESTAMPTZ(3),
  "finalMileReadyAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Shipment_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "Shipment_route_revision_positive" CHECK ("currentRouteRevision" > 0),
  CONSTRAINT "Shipment_version_positive" CHECK ("version" > 0),
  CONSTRAINT "Shipment_status_check" CHECK ("status" IN ('planned','active_at_node','in_transit','exception','ready_for_pickup','customer_collected','final_mile_ready')),
  CONSTRAINT "Shipment_destination_check" CHECK ("destinationKind" IN ('doorstep','pickup_point')),
  CONSTRAINT "Shipment_pickup_semantics" CHECK (("destinationKind" = 'pickup_point' AND "finalPickupNodeId" IS NOT NULL) OR ("destinationKind" = 'doorstep' AND "finalPickupNodeId" IS NULL)),
  CONSTRAINT "Shipment_custody_check" CHECK ("custodyState" IS NULL OR "custodyState" IN ('source_staff','node_staff','linehaul_internal','provider','customer')),
  CONSTRAINT "Shipment_current_location_exclusive" CHECK (NOT ("currentNodeId" IS NOT NULL AND "currentLegId" IS NOT NULL)),
  CONSTRAINT "Shipment_state_location_consistency" CHECK (
    ("status" = 'planned' AND "currentNodeId" IS NULL AND "currentLegId" IS NULL AND "custodyState" IS NULL AND "activatedAt" IS NULL AND "finalMileReadyAt" IS NULL AND "completedAt" IS NULL)
    OR ("status" = 'active_at_node' AND "currentNodeId" IS NOT NULL AND "currentLegId" IS NULL AND "custodyState" IN ('source_staff','node_staff'))
    OR ("status" = 'in_transit' AND "currentNodeId" IS NULL AND "currentLegId" IS NOT NULL AND "custodyState" IN ('linehaul_internal','provider'))
    OR ("status" = 'exception' AND "custodyState" IS NOT NULL AND (("currentNodeId" IS NOT NULL) <> ("currentLegId" IS NOT NULL)))
    OR ("status" = 'ready_for_pickup' AND "currentNodeId" IS NOT NULL AND "currentLegId" IS NULL AND "custodyState" = 'node_staff')
    OR ("status" = 'customer_collected' AND "currentLegId" IS NULL AND "custodyState" = 'customer' AND "completedAt" IS NOT NULL)
    OR ("status" = 'final_mile_ready' AND "currentNodeId" IS NOT NULL AND "currentLegId" IS NULL AND "custodyState" = 'node_staff' AND "finalMileReadyAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "Shipment_orderId_sequence_key" ON "Shipment"("orderId", "sequence");
CREATE UNIQUE INDEX "Shipment_currentLegId_key" ON "Shipment"("currentLegId");
CREATE INDEX "Shipment_status_updatedAt_idx" ON "Shipment"("status", "updatedAt");
CREATE INDEX "Shipment_workflowVersionId_status_idx" ON "Shipment"("workflowVersionId", "status");
CREATE INDEX "Shipment_routeRuleId_idx" ON "Shipment"("routeRuleId");
CREATE INDEX "Shipment_currentNodeId_status_idx" ON "Shipment"("currentNodeId", "status");

CREATE TABLE "ShipmentStop" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "routeRevision" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "nodeId" TEXT NOT NULL,
  "nodeCode" TEXT NOT NULL,
  "nodePublicName" TEXT NOT NULL,
  "nodeKind" TEXT NOT NULL,
  "kindLabel" TEXT,
  "terminalRole" TEXT NOT NULL,
  "plannedArrivalAt" TIMESTAMPTZ(3),
  "plannedDepartureAt" TIMESTAMPTZ(3),
  "slaDeadlineAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentStop_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShipmentStop_route_revision_positive" CHECK ("routeRevision" > 0),
  CONSTRAINT "ShipmentStop_position_positive" CHECK ("position" > 0),
  CONSTRAINT "ShipmentStop_terminal_role_check" CHECK ("terminalRole" IN ('transit','customer_pickup','final_mile_dispatch'))
);
CREATE UNIQUE INDEX "ShipmentStop_shipment_revision_position_key" ON "ShipmentStop"("shipmentId", "routeRevision", "position");
CREATE INDEX "ShipmentStop_nodeId_idx" ON "ShipmentStop"("nodeId");
CREATE INDEX "ShipmentStop_shipment_revision_node_idx" ON "ShipmentStop"("shipmentId", "routeRevision", "nodeId");

CREATE TABLE "ShipmentLeg" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "routeRevision" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "originStopId" TEXT NOT NULL,
  "destinationStopId" TEXT NOT NULL,
  "laneId" TEXT NOT NULL,
  "laneMode" TEXT NOT NULL,
  "providerKey" TEXT,
  "typicalMinutes" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "departedAt" TIMESTAMPTZ(3),
  "arrivedAt" TIMESTAMPTZ(3),
  "slaDeadlineAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ShipmentLeg_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShipmentLeg_route_revision_positive" CHECK ("routeRevision" > 0),
  CONSTRAINT "ShipmentLeg_position_positive" CHECK ("position" > 0),
  CONSTRAINT "ShipmentLeg_typical_minutes_positive" CHECK ("typicalMinutes" > 0),
  CONSTRAINT "ShipmentLeg_version_positive" CHECK ("version" > 0),
  CONSTRAINT "ShipmentLeg_distinct_stops" CHECK ("originStopId" <> "destinationStopId"),
  CONSTRAINT "ShipmentLeg_status_check" CHECK ("status" IN ('planned','ready','in_transit','arrived','exception','superseded')),
  CONSTRAINT "ShipmentLeg_timestamp_order" CHECK ("arrivedAt" IS NULL OR ("departedAt" IS NOT NULL AND "arrivedAt" >= "departedAt"))
);
CREATE UNIQUE INDEX "ShipmentLeg_shipment_revision_position_key" ON "ShipmentLeg"("shipmentId", "routeRevision", "position");
CREATE INDEX "ShipmentLeg_originStopId_idx" ON "ShipmentLeg"("originStopId");
CREATE INDEX "ShipmentLeg_destinationStopId_idx" ON "ShipmentLeg"("destinationStopId");
CREATE INDEX "ShipmentLeg_laneId_idx" ON "ShipmentLeg"("laneId");
CREATE INDEX "ShipmentLeg_shipment_status_updatedAt_idx" ON "ShipmentLeg"("shipmentId", "status", "updatedAt");

CREATE TABLE "ShipmentEvent" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "legId" TEXT,
  "nodeId" TEXT,
  "routeRevision" INTEGER NOT NULL,
  "eventKind" TEXT NOT NULL,
  "actorKind" TEXT NOT NULL,
  "actorId" TEXT,
  "priorCustody" TEXT,
  "newCustody" TEXT,
  "customerTitle" TEXT,
  "customerDetail" TEXT,
  "safeMetadata" JSONB NOT NULL DEFAULT '{}',
  "requestId" TEXT NOT NULL,
  "correctionOfEventId" TEXT,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShipmentEvent_route_revision_positive" CHECK ("routeRevision" > 0),
  CONSTRAINT "ShipmentEvent_actor_kind_check" CHECK ("actorKind" IN ('staff','rider','system')),
  CONSTRAINT "ShipmentEvent_prior_custody_check" CHECK ("priorCustody" IS NULL OR "priorCustody" IN ('source_staff','node_staff','linehaul_internal','provider','customer')),
  CONSTRAINT "ShipmentEvent_new_custody_check" CHECK ("newCustody" IS NULL OR "newCustody" IN ('source_staff','node_staff','linehaul_internal','provider','customer')),
  CONSTRAINT "ShipmentEvent_customer_title_length" CHECK ("customerTitle" IS NULL OR char_length("customerTitle") <= 160),
  CONSTRAINT "ShipmentEvent_customer_detail_length" CHECK ("customerDetail" IS NULL OR char_length("customerDetail") <= 500)
);
CREATE INDEX "ShipmentEvent_shipment_occurred_id_idx" ON "ShipmentEvent"("shipmentId", "occurredAt", "id");
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
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_correctionOfEventId_fkey" FOREIGN KEY ("correctionOfEventId") REFERENCES "ShipmentEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION assert_shipment_leg_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  origin_row "ShipmentStop"%ROWTYPE;
  destination_row "ShipmentStop"%ROWTYPE;
  lane_origin TEXT;
  lane_destination TEXT;
BEGIN
  SELECT * INTO origin_row FROM "ShipmentStop" WHERE id = NEW."originStopId";
  SELECT * INTO destination_row FROM "ShipmentStop" WHERE id = NEW."destinationStopId";
  SELECT "originNodeId", "destinationNodeId" INTO lane_origin, lane_destination FROM "LogisticsLane" WHERE id = NEW."laneId";
  IF origin_row.id IS NULL OR destination_row.id IS NULL
     OR origin_row."shipmentId" <> NEW."shipmentId" OR destination_row."shipmentId" <> NEW."shipmentId"
     OR origin_row."routeRevision" <> NEW."routeRevision" OR destination_row."routeRevision" <> NEW."routeRevision"
     OR origin_row.position <> NEW.position OR destination_row.position <> NEW.position + 1
     OR lane_origin IS NULL OR lane_origin <> origin_row."nodeId" OR lane_destination <> destination_row."nodeId" THEN
    RAISE EXCEPTION 'shipment leg must connect adjacent same-revision stops through its live lane' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ShipmentLeg_integrity"
BEFORE INSERT OR UPDATE OF "shipmentId", "routeRevision", "position", "originStopId", "destinationStopId", "laneId" ON "ShipmentLeg"
FOR EACH ROW EXECUTE FUNCTION assert_shipment_leg_integrity();

CREATE OR REPLACE FUNCTION guard_shipment_stop_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'shipment stop route snapshots are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "ShipmentStop_snapshot_immutable" BEFORE UPDATE OR DELETE ON "ShipmentStop" FOR EACH ROW EXECUTE FUNCTION guard_shipment_stop_snapshot();

CREATE OR REPLACE FUNCTION guard_shipment_leg_route_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."shipmentId" IS DISTINCT FROM NEW."shipmentId"
     OR OLD."routeRevision" IS DISTINCT FROM NEW."routeRevision"
     OR OLD.position IS DISTINCT FROM NEW.position
     OR OLD."originStopId" IS DISTINCT FROM NEW."originStopId"
     OR OLD."destinationStopId" IS DISTINCT FROM NEW."destinationStopId"
     OR OLD."laneId" IS DISTINCT FROM NEW."laneId"
     OR OLD."laneMode" IS DISTINCT FROM NEW."laneMode"
     OR OLD."providerKey" IS DISTINCT FROM NEW."providerKey"
     OR OLD."typicalMinutes" IS DISTINCT FROM NEW."typicalMinutes" THEN
    RAISE EXCEPTION 'shipment leg route identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ShipmentLeg_route_identity_immutable"
BEFORE UPDATE ON "ShipmentLeg" FOR EACH ROW EXECUTE FUNCTION guard_shipment_leg_route_identity();

CREATE OR REPLACE FUNCTION prevent_shipment_event_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'shipment event history is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "ShipmentEvent_append_only" BEFORE UPDATE OR DELETE ON "ShipmentEvent" FOR EACH ROW EXECUTE FUNCTION prevent_shipment_event_rewrite();

CREATE OR REPLACE FUNCTION assert_shipment_current_location() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."currentLegId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ShipmentLeg" l
    WHERE l.id = NEW."currentLegId" AND l."shipmentId" = NEW.id AND l."routeRevision" = NEW."currentRouteRevision"
  ) THEN
    RAISE EXCEPTION 'shipment current leg must belong to its current route revision' USING ERRCODE = '23514';
  END IF;
  IF NEW."currentNodeId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ShipmentStop" s
    WHERE s."shipmentId" = NEW.id AND s."routeRevision" = NEW."currentRouteRevision" AND s."nodeId" = NEW."currentNodeId"
  ) THEN
    RAISE EXCEPTION 'shipment current node must belong to its current route revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Shipment_current_location_integrity"
BEFORE INSERT OR UPDATE ON "Shipment" FOR EACH ROW EXECUTE FUNCTION assert_shipment_current_location();

-- A lane pinned into a shipment cannot be repointed after history references it.
CREATE OR REPLACE FUNCTION guard_referenced_lane_endpoints() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."originNodeId", OLD."destinationNodeId") IS DISTINCT FROM (NEW."originNodeId", NEW."destinationNodeId")
     AND (EXISTS (SELECT 1 FROM "DeliveryRouteRuleLeg" WHERE "laneId" = OLD.id)
          OR EXISTS (SELECT 1 FROM "ShipmentLeg" WHERE "laneId" = OLD.id)) THEN
    RAISE EXCEPTION 'lane referenced by a route or shipment cannot be repointed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Preserve legacy dispatch compatibility, but fail closed for every new routed order.
CREATE OR REPLACE FUNCTION assert_delivery_job_authority_root() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  execution_required BOOLEAN;
BEGIN
  SELECT o."logisticsExecutionRequired" INTO execution_required
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
    AND f."handedOverAt" <= NEW."assignedAt";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery job requires authoritative dispatch handover before assignment' USING ERRCODE = '23514';
  END IF;

  IF execution_required AND NOT EXISTS (
    SELECT 1
    FROM "Shipment" s
    JOIN "ShipmentStop" stop
      ON stop."shipmentId" = s.id
     AND stop."routeRevision" = s."currentRouteRevision"
     AND stop."nodeId" = s."currentNodeId"
     AND stop."terminalRole" = 'final_mile_dispatch'
    WHERE s."orderId" = NEW."orderId"
      AND s.sequence = 1
      AND s.status = 'final_mile_ready'
      AND s."currentNodeId" IS NOT NULL
      AND s."currentLegId" IS NULL
      AND s."finalMileReadyAt" IS NOT NULL
      AND s."finalMileReadyAt" <= NEW."assignedAt"
  ) THEN
    RAISE EXCEPTION 'delivery job requires final-mile-ready shipment authority' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
