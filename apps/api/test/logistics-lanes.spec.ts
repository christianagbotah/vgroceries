import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { LogisticsNodeService } from "../src/logistics/logistics-node.service";
import { LogisticsLaneService } from "../src/logistics/logistics-lane.service";
import { AdminLogisticsLanesController } from "../src/logistics/admin-logistics-lanes.controller";

let app: INestApplication;
let db: Database;
let nodes: LogisticsNodeService;
let lanes: LogisticsLaneService;
const config = () => readConfig({ DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true", COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440", ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({1:"11".repeat(32)}) });

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  nodes = new LogisticsNodeService(db);
  lanes = new LogisticsLaneService(db);
});
after(async () => { await app?.close(); });

async function makeNode(code: string, active = true) {
  return nodes.create("admin-commerce", `node-${code}-${active}`, { code, name: code, publicName: code, kind: "hub", customerVisible: true, active }, `req-${code}`);
}

test("lane authority creates lists updates replays validates and emits audit/outbox evidence", async () => {
  const origin = await makeNode("LANE_ORIGIN");
  const destination = await makeNode("LANE_DEST");
  const inactive = await makeNode("LANE_INACTIVE", false);
  const input = { originNodeId: origin.id, destinationNodeId: destination.id, mode: "linehaul" as const, typicalMinutes: 120, serviceDays: [1,2,3,4,5], cutoffLocalTime: "17:30", priority: 2, active: true };

  const first = await lanes.create("admin-commerce", "lane-create-1", input, "req-lane-1");
  assert.equal(first.origin?.id, origin.id);
  assert.equal(first.destination?.id, destination.id);
  assert.equal(first.activeRouteRuleCount, 0);
  const replay = await lanes.create("admin-commerce", "lane-create-1", input, "req-lane-replay");
  assert.equal(replay.id, first.id);
  await assert.rejects(() => lanes.create("admin-commerce", "lane-create-1", { ...input, typicalMinutes: 180 }, "req-lane-conflict"));
  await assert.rejects(() => lanes.create("admin-commerce", "lane-dup", input, "req-lane-dup"));
  await assert.rejects(() => lanes.create("admin-commerce", "lane-same", { ...input, destinationNodeId: origin.id }, "req-lane-same"));
  await assert.rejects(() => lanes.create("admin-commerce", "lane-inactive", { ...input, destinationNodeId: inactive.id }, "req-lane-inactive"));
  await assert.rejects(() => lanes.create("admin-commerce", "lane-bad-cutoff", { ...input, destinationNodeId: inactive.id, cutoffLocalTime: "25:00" } as any, "req-lane-bad-cutoff"));
  await assert.rejects(() => lanes.create("admin-commerce", "lane-bad-days", { ...input, destinationNodeId: inactive.id, serviceDays: [1,1] } as any, "req-lane-bad-days"));
  await assert.rejects(() => lanes.create("admin-commerce", "lane-bad-minutes", { ...input, destinationNodeId: inactive.id, typicalMinutes: 0 } as any, "req-lane-bad-minutes"));

  assert.ok((await lanes.list({ originNodeId: origin.id })).some((row) => row.id === first.id));
  assert.equal((await lanes.get(first.id)).id, first.id);
  const updated = await lanes.update("admin-commerce", first.id, "lane-update-1", { typicalMinutes: 150, priority: 3 }, "req-lane-update");
  assert.equal(updated.typicalMinutes, 150);
  assert.equal(updated.priority, 3);
  assert.equal(await db.auditEvent.count({ where: { entityId: first.id, action: { in: ["logistics.lane.created", "logistics.lane.updated"] } } }), 2);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: first.id, type: { in: ["logistics.lane.created", "logistics.lane.updated"] } } }), 2);
});

test("active lane used by an active route cannot be deactivated", async () => {
  const source = await makeNode("LANE_DEP_SOURCE");
  const dest = await makeNode("LANE_DEP_DEST");
  const lane = await lanes.create("admin-commerce", "lane-dep-create", { originNodeId: source.id, destinationNodeId: dest.id, mode: "linehaul", typicalMinutes: 60, serviceDays: [], priority: 0, active: true }, "req-lane-dep");
  const c = db as Database & Record<string, any>;
  const template = await c.deliveryWorkflowTemplate.create({ data: { name: "Lane dependency workflow", description: "", active: true } });
  const version = await c.deliveryWorkflowVersion.create({ data: { templateId: template.id, versionNumber: 1, status: "draft", revision: 1, createdBy: "admin-commerce" } });
  await c.deliveryWorkflowVersion.update({ where: { id: version.id }, data: { status: "published", publishedBy: "admin-commerce", publishedAt: new Date() } });
  const rule = await c.deliveryRouteRule.create({ data: { name: "Lane dependency route", originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery", destinationKind: "doorstep", workflowVersionId: version.id, priority: 1, active: false, createdBy: "admin-commerce" } });
  const stop1 = await c.deliveryRouteRuleStop.create({ data: { ruleId: rule.id, position: 1, nodeId: source.id, terminalRole: "transit" } });
  const stop2 = await c.deliveryRouteRuleStop.create({ data: { ruleId: rule.id, position: 2, nodeId: dest.id, terminalRole: "final_mile_dispatch" } });
  await c.deliveryRouteRuleLeg.create({ data: { ruleId: rule.id, position: 1, originStopId: stop1.id, destinationStopId: stop2.id, laneId: lane.id } });
  await c.deliveryRouteRule.update({ where: { id: rule.id }, data: { active: true } });

  await assert.rejects(() => lanes.update("admin-commerce", lane.id, "lane-deactivate", { active: false }, "req-lane-deactivate"), (error: any) => error?.status === 409 || error?.statusCode === 409);
  assert.equal((await lanes.get(lane.id)).active, true);
  assert.equal((await lanes.get(lane.id)).activeRouteRuleCount, 1);
});

test("lane controller refuses non-admin authority", async () => {
  const controller = new AdminLogisticsLanesController(lanes);
  const req = { actor: { id: "customer-a", role: "customer" }, requestId: "req-customer", get: () => undefined } as any;
  await assert.rejects(() => controller.list(req, {}), (error: any) => error?.status === 403 || error?.statusCode === 403);
});
