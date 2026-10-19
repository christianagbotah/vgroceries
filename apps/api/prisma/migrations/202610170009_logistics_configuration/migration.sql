-- Wave L1: configurable logistics network and delivery workflow configuration.
-- Configuration is intentionally separate from shipment execution and never mutates stock/order/payment truth.

CREATE TABLE "LogisticsNode" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "publicName" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "kindLabel" TEXT, "parentNodeId" TEXT, "inventoryLocationId" TEXT,
  "addressLine" TEXT, "locality" TEXT, "region" TEXT, "ghanaPostGps" TEXT, "publicDirections" TEXT, "publicContact" TEXT,
  "customerVisible" BOOLEAN NOT NULL DEFAULT true, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LogisticsNode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticsNode_parent_not_self" CHECK ("parentNodeId" IS NULL OR "parentNodeId" <> "id"),
  CONSTRAINT "LogisticsNode_kind_check" CHECK ("kind" IN ('head_office','warehouse','fulfilment_center','hub','outlet','pickup_point','cross_dock','partner_facility','other'))
);
CREATE UNIQUE INDEX "LogisticsNode_code_key" ON "LogisticsNode"("code");
CREATE UNIQUE INDEX "LogisticsNode_inventoryLocationId_key" ON "LogisticsNode"("inventoryLocationId");
CREATE INDEX "LogisticsNode_active_kind_name_idx" ON "LogisticsNode"("active", "kind", "name");
CREATE INDEX "LogisticsNode_parentNodeId_idx" ON "LogisticsNode"("parentNodeId");

CREATE TABLE "LogisticsLane" (
  "id" TEXT NOT NULL, "originNodeId" TEXT NOT NULL, "destinationNodeId" TEXT NOT NULL, "mode" TEXT NOT NULL,
  "providerKey" TEXT, "typicalMinutes" INTEGER NOT NULL, "serviceDays" INTEGER[] NOT NULL, "cutoffLocalTime" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LogisticsLane_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LogisticsLane_distinct_nodes" CHECK ("originNodeId" <> "destinationNodeId"),
  CONSTRAINT "LogisticsLane_typical_minutes_positive" CHECK ("typicalMinutes" > 0),
  CONSTRAINT "LogisticsLane_priority_nonnegative" CHECK ("priority" >= 0),
  CONSTRAINT "LogisticsLane_mode_check" CHECK ("mode" IN ('internal_transfer','linehaul','third_party','customer_pickup','last_mile')),
  CONSTRAINT "LogisticsLane_cutoff_format" CHECK ("cutoffLocalTime" IS NULL OR "cutoffLocalTime" ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$')
);
CREATE INDEX "LogisticsLane_originNodeId_active_idx" ON "LogisticsLane"("originNodeId", "active");
CREATE INDEX "LogisticsLane_destinationNodeId_active_idx" ON "LogisticsLane"("destinationNodeId", "active");
CREATE UNIQUE INDEX "LogisticsLane_active_identity_key" ON "LogisticsLane" ("originNodeId", "destinationNodeId", "mode", COALESCE("providerKey", '')) WHERE "active" = true;

CREATE TABLE "DeliveryWorkflowTemplate" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "currentPublishedVersionId" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DeliveryWorkflowTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeliveryWorkflowTemplate_currentPublishedVersionId_key" ON "DeliveryWorkflowTemplate"("currentPublishedVersionId");
CREATE INDEX "DeliveryWorkflowTemplate_active_name_idx" ON "DeliveryWorkflowTemplate"("active", "name");

CREATE TABLE "DeliveryWorkflowVersion" (
  "id" TEXT NOT NULL, "templateId" TEXT NOT NULL, "versionNumber" INTEGER NOT NULL, "status" TEXT NOT NULL,
  "defaultSlaMinutes" INTEGER, "revision" INTEGER NOT NULL DEFAULT 1, "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "publishedBy" TEXT, "publishedAt" TIMESTAMPTZ(3),
  CONSTRAINT "DeliveryWorkflowVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryWorkflowVersion_number_positive" CHECK ("versionNumber" > 0),
  CONSTRAINT "DeliveryWorkflowVersion_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "DeliveryWorkflowVersion_sla_positive" CHECK ("defaultSlaMinutes" IS NULL OR "defaultSlaMinutes" > 0),
  CONSTRAINT "DeliveryWorkflowVersion_status_check" CHECK ("status" IN ('draft','published','retired'))
);
CREATE UNIQUE INDEX "DeliveryWorkflowVersion_templateId_versionNumber_key" ON "DeliveryWorkflowVersion"("templateId", "versionNumber");
CREATE INDEX "DeliveryWorkflowVersion_templateId_status_versionNumber_idx" ON "DeliveryWorkflowVersion"("templateId", "status", "versionNumber");

CREATE TABLE "WorkflowStageDefinition" (
  "id" TEXT NOT NULL, "workflowVersionId" TEXT NOT NULL, "stageKey" TEXT NOT NULL, "eventKind" TEXT NOT NULL,
  "customerTitleTemplate" TEXT NOT NULL, "customerDetailTemplate" TEXT, "adminLabel" TEXT NOT NULL, "adminHelpText" TEXT,
  "customerVisible" BOOLEAN NOT NULL DEFAULT true, "showPlannedWhenPending" BOOLEAN NOT NULL DEFAULT false,
  "slaMinutes" INTEGER, "sortOrder" INTEGER NOT NULL, "displayGroup" TEXT, "exceptionSeverity" TEXT NOT NULL DEFAULT 'info',
  "notificationsAllowed" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "WorkflowStageDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkflowStageDefinition_sort_positive" CHECK ("sortOrder" > 0),
  CONSTRAINT "WorkflowStageDefinition_sla_positive" CHECK ("slaMinutes" IS NULL OR "slaMinutes" > 0),
  CONSTRAINT "WorkflowStageDefinition_event_kind_check" CHECK ("eventKind" IN ('order_placed','order_confirmed','picking_started','packed','fulfilment_handed_over','shipment_departed','shipment_arrived','shipment_handover','shipment_rerouted','shipment_delayed','ready_for_pickup','customer_collected','rider_assigned','rider_accepted','rider_picked_up','out_for_delivery','delivery_failed','delivery_rescheduled','delivered','returned_toward_store','custom_checkpoint')),
  CONSTRAINT "WorkflowStageDefinition_exception_severity_check" CHECK ("exceptionSeverity" IN ('info','warning','critical'))
);
CREATE UNIQUE INDEX "WorkflowStageDefinition_version_stage_key" ON "WorkflowStageDefinition"("workflowVersionId", "stageKey");
CREATE UNIQUE INDEX "WorkflowStageDefinition_version_sort_key" ON "WorkflowStageDefinition"("workflowVersionId", "sortOrder");

CREATE TABLE "DeliveryRouteRule" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "originNodeId" TEXT NOT NULL, "deliveryZoneId" TEXT, "fulfilment" TEXT NOT NULL,
  "locality" TEXT, "destinationKind" TEXT NOT NULL, "finalPickupNodeId" TEXT, "serviceLevel" TEXT, "workflowVersionId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0, "effectiveFrom" TIMESTAMPTZ(3), "effectiveTo" TIMESTAMPTZ(3),
  "active" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 1, "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DeliveryRouteRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryRouteRule_priority_nonnegative" CHECK ("priority" >= 0),
  CONSTRAINT "DeliveryRouteRule_version_positive" CHECK ("version" > 0),
  CONSTRAINT "DeliveryRouteRule_effective_range" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "DeliveryRouteRule_fulfilment_check" CHECK ("fulfilment" IN ('delivery','collection')),
  CONSTRAINT "DeliveryRouteRule_destination_check" CHECK ("destinationKind" IN ('doorstep','pickup_point')),
  CONSTRAINT "DeliveryRouteRule_zone_semantics" CHECK (("fulfilment" = 'delivery' AND "deliveryZoneId" IS NOT NULL) OR ("fulfilment" = 'collection' AND "deliveryZoneId" IS NULL)),
  CONSTRAINT "DeliveryRouteRule_pickup_semantics" CHECK (("destinationKind" = 'pickup_point' AND "finalPickupNodeId" IS NOT NULL) OR ("destinationKind" = 'doorstep' AND "finalPickupNodeId" IS NULL))
);
CREATE INDEX "DeliveryRouteRule_origin_zone_active_priority_idx" ON "DeliveryRouteRule"("originNodeId", "deliveryZoneId", "active", "priority");
CREATE INDEX "DeliveryRouteRule_workflow_active_idx" ON "DeliveryRouteRule"("workflowVersionId", "active");
CREATE INDEX "DeliveryRouteRule_pickup_active_idx" ON "DeliveryRouteRule"("finalPickupNodeId", "active");

CREATE TABLE "DeliveryRouteRuleStop" (
  "id" TEXT NOT NULL, "ruleId" TEXT NOT NULL, "position" INTEGER NOT NULL, "nodeId" TEXT NOT NULL, "terminalRole" TEXT NOT NULL,
  CONSTRAINT "DeliveryRouteRuleStop_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryRouteRuleStop_position_positive" CHECK ("position" > 0),
  CONSTRAINT "DeliveryRouteRuleStop_terminal_role_check" CHECK ("terminalRole" IN ('transit','customer_pickup','final_mile_dispatch'))
);
CREATE UNIQUE INDEX "DeliveryRouteRuleStop_rule_position_key" ON "DeliveryRouteRuleStop"("ruleId", "position");
CREATE INDEX "DeliveryRouteRuleStop_nodeId_idx" ON "DeliveryRouteRuleStop"("nodeId");

CREATE TABLE "DeliveryRouteRuleLeg" (
  "id" TEXT NOT NULL, "ruleId" TEXT NOT NULL, "position" INTEGER NOT NULL, "originStopId" TEXT NOT NULL,
  "destinationStopId" TEXT NOT NULL, "laneId" TEXT NOT NULL,
  CONSTRAINT "DeliveryRouteRuleLeg_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryRouteRuleLeg_position_positive" CHECK ("position" > 0),
  CONSTRAINT "DeliveryRouteRuleLeg_distinct_stops" CHECK ("originStopId" <> "destinationStopId")
);
CREATE UNIQUE INDEX "DeliveryRouteRuleLeg_rule_position_key" ON "DeliveryRouteRuleLeg"("ruleId", "position");
CREATE INDEX "DeliveryRouteRuleLeg_originStopId_idx" ON "DeliveryRouteRuleLeg"("originStopId");
CREATE INDEX "DeliveryRouteRuleLeg_destinationStopId_idx" ON "DeliveryRouteRuleLeg"("destinationStopId");
CREATE INDEX "DeliveryRouteRuleLeg_laneId_idx" ON "DeliveryRouteRuleLeg"("laneId");

ALTER TABLE "LogisticsNode" ADD CONSTRAINT "LogisticsNode_parentNodeId_fkey" FOREIGN KEY ("parentNodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogisticsNode" ADD CONSTRAINT "LogisticsNode_inventoryLocationId_fkey" FOREIGN KEY ("inventoryLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogisticsLane" ADD CONSTRAINT "LogisticsLane_originNodeId_fkey" FOREIGN KEY ("originNodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogisticsLane" ADD CONSTRAINT "LogisticsLane_destinationNodeId_fkey" FOREIGN KEY ("destinationNodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryWorkflowVersion" ADD CONSTRAINT "DeliveryWorkflowVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DeliveryWorkflowTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryWorkflowTemplate" ADD CONSTRAINT "DeliveryWorkflowTemplate_currentPublishedVersionId_fkey" FOREIGN KEY ("currentPublishedVersionId") REFERENCES "DeliveryWorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowStageDefinition" ADD CONSTRAINT "WorkflowStageDefinition_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "DeliveryWorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRouteRule" ADD CONSTRAINT "DeliveryRouteRule_originNodeId_fkey" FOREIGN KEY ("originNodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRouteRule" ADD CONSTRAINT "DeliveryRouteRule_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRouteRule" ADD CONSTRAINT "DeliveryRouteRule_finalPickupNodeId_fkey" FOREIGN KEY ("finalPickupNodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRouteRule" ADD CONSTRAINT "DeliveryRouteRule_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "DeliveryWorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRouteRuleStop" ADD CONSTRAINT "DeliveryRouteRuleStop_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DeliveryRouteRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRouteRuleStop" ADD CONSTRAINT "DeliveryRouteRuleStop_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRouteRuleLeg" ADD CONSTRAINT "DeliveryRouteRuleLeg_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DeliveryRouteRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRouteRuleLeg" ADD CONSTRAINT "DeliveryRouteRuleLeg_originStopId_fkey" FOREIGN KEY ("originStopId") REFERENCES "DeliveryRouteRuleStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRouteRuleLeg" ADD CONSTRAINT "DeliveryRouteRuleLeg_destinationStopId_fkey" FOREIGN KEY ("destinationStopId") REFERENCES "DeliveryRouteRuleStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRouteRuleLeg" ADD CONSTRAINT "DeliveryRouteRuleLeg_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "LogisticsLane"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION guard_workflow_version_immutability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'draft' THEN RAISE EXCEPTION 'published or retired workflow versions are immutable' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" IN ('published','retired') THEN
    IF OLD."status" = 'published' AND NEW."status" = 'retired'
       AND ROW(NEW."id",NEW."templateId",NEW."versionNumber",NEW."defaultSlaMinutes",NEW."revision",NEW."createdBy",NEW."createdAt",NEW."publishedBy",NEW."publishedAt")
           IS NOT DISTINCT FROM ROW(OLD."id",OLD."templateId",OLD."versionNumber",OLD."defaultSlaMinutes",OLD."revision",OLD."createdBy",OLD."createdAt",OLD."publishedBy",OLD."publishedAt") THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'published or retired workflow versions are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DeliveryWorkflowVersion_immutable_after_publish" BEFORE UPDATE OR DELETE ON "DeliveryWorkflowVersion" FOR EACH ROW EXECUTE FUNCTION guard_workflow_version_immutability();

CREATE OR REPLACE FUNCTION guard_workflow_stage_immutability() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_status TEXT; new_status TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN SELECT "status" INTO old_status FROM "DeliveryWorkflowVersion" WHERE "id" = OLD."workflowVersionId"; END IF;
  IF TG_OP <> 'DELETE' THEN SELECT "status" INTO new_status FROM "DeliveryWorkflowVersion" WHERE "id" = NEW."workflowVersionId"; END IF;
  IF COALESCE(old_status, 'draft') <> 'draft' OR COALESCE(new_status, 'draft') <> 'draft' THEN
    RAISE EXCEPTION 'published or retired workflow stage content is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER "WorkflowStageDefinition_immutable_after_publish" BEFORE INSERT OR UPDATE OR DELETE ON "WorkflowStageDefinition" FOR EACH ROW EXECUTE FUNCTION guard_workflow_stage_immutability();

CREATE OR REPLACE FUNCTION assert_workflow_current_version_same_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."currentPublishedVersionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "DeliveryWorkflowVersion" v WHERE v."id" = NEW."currentPublishedVersionId" AND v."templateId" = NEW."id" AND v."status" = 'published'
  ) THEN RAISE EXCEPTION 'current published workflow version must be a published version of this template' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DeliveryWorkflowTemplate_current_version_guard" BEFORE INSERT OR UPDATE OF "currentPublishedVersionId" ON "DeliveryWorkflowTemplate" FOR EACH ROW EXECUTE FUNCTION assert_workflow_current_version_same_template();

CREATE OR REPLACE FUNCTION assert_route_leg_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o RECORD; d RECORD; l RECORD;
BEGIN
  SELECT "ruleId", "position", "nodeId" INTO o FROM "DeliveryRouteRuleStop" WHERE "id" = NEW."originStopId";
  SELECT "ruleId", "position", "nodeId" INTO d FROM "DeliveryRouteRuleStop" WHERE "id" = NEW."destinationStopId";
  SELECT "originNodeId", "destinationNodeId" INTO l FROM "LogisticsLane" WHERE "id" = NEW."laneId";
  IF o."ruleId" IS DISTINCT FROM NEW."ruleId" OR d."ruleId" IS DISTINCT FROM NEW."ruleId" OR d."position" <> o."position" + 1 OR NEW."position" <> o."position" OR l."originNodeId" IS DISTINCT FROM o."nodeId" OR l."destinationNodeId" IS DISTINCT FROM d."nodeId" THEN
    RAISE EXCEPTION 'route leg must connect adjacent stops through a matching lane' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DeliveryRouteRuleLeg_integrity" BEFORE INSERT OR UPDATE ON "DeliveryRouteRuleLeg" FOR EACH ROW EXECUTE FUNCTION assert_route_leg_integrity();

CREATE OR REPLACE FUNCTION guard_referenced_route_stop() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."ruleId",NEW."position",NEW."nodeId") IS DISTINCT FROM (OLD."ruleId",OLD."position",OLD."nodeId") AND EXISTS (SELECT 1 FROM "DeliveryRouteRuleLeg" WHERE "originStopId"=OLD."id" OR "destinationStopId"=OLD."id") THEN
    RAISE EXCEPTION 'route stop referenced by a leg cannot be repointed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DeliveryRouteRuleStop_referenced_integrity" BEFORE UPDATE ON "DeliveryRouteRuleStop" FOR EACH ROW EXECUTE FUNCTION guard_referenced_route_stop();

CREATE OR REPLACE FUNCTION guard_referenced_lane_endpoints() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."originNodeId",NEW."destinationNodeId") IS DISTINCT FROM (OLD."originNodeId",OLD."destinationNodeId") AND EXISTS (SELECT 1 FROM "DeliveryRouteRuleLeg" WHERE "laneId"=OLD."id") THEN
    RAISE EXCEPTION 'lane referenced by a route rule cannot be repointed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "LogisticsLane_referenced_endpoint_integrity" BEFORE UPDATE OF "originNodeId", "destinationNodeId" ON "LogisticsLane" FOR EACH ROW EXECUTE FUNCTION guard_referenced_lane_endpoints();
