import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
const runTag = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({1:"11".repeat(32)}),
});

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
});
after(async () => { await app?.close(); });

function models() {
  const c = db as Database & Record<string, any>;
  for (const name of ["logisticsNode", "logisticsLane", "deliveryWorkflowTemplate", "deliveryWorkflowVersion", "workflowStageDefinition", "deliveryRouteRule", "deliveryRouteRuleStop", "deliveryRouteRuleLeg"]) {
    assert.ok(c[name], `${name} Prisma model is missing`);
  }
  return c;
}

async function node(c: any, code: string, extra: Record<string, unknown> = {}) {
  return c.logisticsNode.create({ data: {
    code: `${code}_${runTag}`, name: code, publicName: code, kind: "hub", customerVisible: true, active: true, ...extra,
  } });
}

async function publishedWorkflow(c: any, key: string) {
  const template = await c.deliveryWorkflowTemplate.create({ data: { name: `Workflow ${key}`, description: "", active: true } });
  const version = await c.deliveryWorkflowVersion.create({ data: {
    templateId: template.id, versionNumber: 1, status: "draft", revision: 1, createdBy: "admin-schema",
  } });
  await c.workflowStageDefinition.create({ data: {
    workflowVersionId: version.id, stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Order placed",
    adminLabel: "Placed", customerVisible: true, showPlannedWhenPending: true, sortOrder: 1,
    exceptionSeverity: "info", notificationsAllowed: false,
  } });
  await c.deliveryWorkflowVersion.update({ where: { id: version.id }, data: {
    status: "published", publishedBy: "admin-schema", publishedAt: new Date(),
  } });
  await c.deliveryWorkflowTemplate.update({ where: { id: template.id }, data: { currentPublishedVersionId: version.id } });
  return { template, version };
}

test("logistics schema enforces node and lane identity invariants", async () => {
  const c = models();
  const locationId = `loc_logistics_schema_${runTag.toLowerCase()}`;
  await db.location.upsert({ where: { id: locationId }, create: { id: locationId, name: "Schema location", active: true }, update: { active: true } });
  const a = await node(c, "SCHEMA_A", { inventoryLocationId: locationId });
  const b = await node(c, "SCHEMA_B");

  await assert.rejects(() => c.logisticsNode.update({ where: { id: a.id }, data: { parentNodeId: a.id } }));
  await assert.rejects(() => node(c, "SCHEMA_DUP_LOC", { inventoryLocationId: locationId }));
  await assert.rejects(() => c.logisticsLane.create({ data: { originNodeId: a.id, destinationNodeId: a.id, mode: "linehaul", typicalMinutes: 10, serviceDays: [], priority: 0, active: true } }));
  await assert.rejects(() => c.logisticsLane.create({ data: { originNodeId: a.id, destinationNodeId: b.id, mode: "linehaul", typicalMinutes: 0, serviceDays: [], priority: 0, active: true } }));
  await assert.rejects(() => c.logisticsLane.create({ data: { originNodeId: a.id, destinationNodeId: b.id, mode: "linehaul", typicalMinutes: 10, serviceDays: [], priority: -1, active: true } }));

  await c.logisticsLane.create({ data: { originNodeId: a.id, destinationNodeId: b.id, mode: "linehaul", typicalMinutes: 10, serviceDays: [1,2,3], priority: 0, active: true } });
  await assert.rejects(() => c.logisticsLane.create({ data: { originNodeId: a.id, destinationNodeId: b.id, mode: "linehaul", typicalMinutes: 20, serviceDays: [], priority: 1, active: true } }));
});

test("published workflow content is immutable while published to retired remains legal", async () => {
  const c = models();
  const template = await c.deliveryWorkflowTemplate.create({ data: { name: "Immutable workflow", description: "", active: true } });
  const version = await c.deliveryWorkflowVersion.create({ data: { templateId: template.id, versionNumber: 1, status: "draft", revision: 1, createdBy: "admin-schema" } });
  const stage = await c.workflowStageDefinition.create({ data: {
    workflowVersionId: version.id, stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Placed", adminLabel: "Placed",
    customerVisible: true, showPlannedWhenPending: true, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false,
  } });
  await assert.rejects(() => c.deliveryWorkflowVersion.create({ data: { templateId: template.id, versionNumber: 1, status: "draft", revision: 1, createdBy: "admin-schema" } }));
  await assert.rejects(() => c.workflowStageDefinition.create({ data: { workflowVersionId: version.id, stageKey: "placed", eventKind: "packed", customerTitleTemplate: "Dup", adminLabel: "Dup", customerVisible: true, showPlannedWhenPending: false, sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: false } }));
  await assert.rejects(() => c.workflowStageDefinition.create({ data: { workflowVersionId: version.id, stageKey: "other", eventKind: "packed", customerTitleTemplate: "Dup", adminLabel: "Dup", customerVisible: true, showPlannedWhenPending: false, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false } }));

  await c.deliveryWorkflowVersion.update({ where: { id: version.id }, data: { status: "published", publishedBy: "admin-schema", publishedAt: new Date() } });
  await assert.rejects(() => c.workflowStageDefinition.update({ where: { id: stage.id }, data: { customerTitleTemplate: "Changed" } }));
  await assert.rejects(() => c.workflowStageDefinition.delete({ where: { id: stage.id } }));
  await assert.rejects(() => c.deliveryWorkflowVersion.update({ where: { id: version.id }, data: { defaultSlaMinutes: 99 } }));
  const retired = await c.deliveryWorkflowVersion.update({ where: { id: version.id }, data: { status: "retired" } });
  assert.equal(retired.status, "retired");
  await assert.rejects(() => c.workflowStageDefinition.create({ data: { workflowVersionId: version.id, stageKey: "late", eventKind: "packed", customerTitleTemplate: "Late", adminLabel: "Late", customerVisible: true, showPlannedWhenPending: false, sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: false } }));
});

test("route rule and leg constraints fail closed on direct database bypass", async () => {
  const c = models();
  const source = await node(c, "ROUTE_SOURCE");
  const pickup = await node(c, "ROUTE_PICKUP", { kind: "pickup_point" });
  const other = await node(c, "ROUTE_OTHER");
  const { version } = await publishedWorkflow(c, "route");
  const common = { name: "Route", originNodeId: source.id, fulfilment: "delivery", deliveryZoneId: "zone-required", destinationKind: "doorstep", workflowVersionId: version.id, priority: 0, createdBy: "admin-schema" };

  await assert.rejects(() => c.deliveryRouteRule.create({ data: { ...common, deliveryZoneId: null } }));
  await assert.rejects(() => c.deliveryRouteRule.create({ data: { ...common, fulfilment: "collection", deliveryZoneId: "zone-required" } }));
  await assert.rejects(() => c.deliveryRouteRule.create({ data: { ...common, destinationKind: "pickup_point", finalPickupNodeId: null } }));
  await assert.rejects(() => c.deliveryRouteRule.create({ data: { ...common, destinationKind: "doorstep", finalPickupNodeId: pickup.id } }));
  await assert.rejects(() => c.deliveryRouteRule.create({ data: { ...common, effectiveFrom: new Date("2026-10-18T00:00:00Z"), effectiveTo: new Date("2026-10-17T00:00:00Z") } }));

  const rule = await c.deliveryRouteRule.create({ data: { ...common, destinationKind: "pickup_point", finalPickupNodeId: pickup.id } });
  await assert.rejects(() => c.deliveryRouteRuleStop.create({ data: { ruleId: rule.id, position: 0, nodeId: source.id, terminalRole: "transit" } }));
  const one = await c.deliveryRouteRuleStop.create({ data: { ruleId: rule.id, position: 1, nodeId: source.id, terminalRole: "transit" } });
  await assert.rejects(() => c.deliveryRouteRuleStop.create({ data: { ruleId: rule.id, position: 1, nodeId: other.id, terminalRole: "transit" } }));
  const two = await c.deliveryRouteRuleStop.create({ data: { ruleId: rule.id, position: 2, nodeId: pickup.id, terminalRole: "customer_pickup" } });
  const lane = await c.logisticsLane.create({ data: { originNodeId: source.id, destinationNodeId: pickup.id, mode: "linehaul", typicalMinutes: 120, serviceDays: [], priority: 0, active: true } });
  const wrongLane = await c.logisticsLane.create({ data: { originNodeId: source.id, destinationNodeId: other.id, mode: "linehaul", typicalMinutes: 30, serviceDays: [], priority: 0, active: true } });
  await assert.rejects(() => c.deliveryRouteRuleLeg.create({ data: { ruleId: rule.id, position: 0, originStopId: one.id, destinationStopId: two.id, laneId: lane.id } }));
  await assert.rejects(() => c.deliveryRouteRuleLeg.create({ data: { ruleId: rule.id, position: 1, originStopId: one.id, destinationStopId: two.id, laneId: wrongLane.id } }));
  await c.deliveryRouteRuleLeg.create({ data: { ruleId: rule.id, position: 1, originStopId: one.id, destinationStopId: two.id, laneId: lane.id } });
  await assert.rejects(() => c.deliveryRouteRuleLeg.create({ data: { ruleId: rule.id, position: 1, originStopId: one.id, destinationStopId: two.id, laneId: lane.id } }));
});
