import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { LogisticsRouteRuleService } from "../src/logistics/logistics-route-rule.service";
import { AdminLogisticsRouteRulesController } from "../src/logistics/admin-logistics-route-rules.controller";
import { publishedDoorstepWorkflow, routeNode, routeServices } from "./logistics-route-fixtures";

let app: INestApplication; let db: Database; let routes: LogisticsRouteRuleService; let services: ReturnType<typeof routeServices>;
const config = () => readConfig({ DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true", COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440", ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({1:"11".repeat(32)}) });
before(async () => { if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required"); app = await createApplication(config()); db = app.get(Database); await seedCommerceFixtures(db); services = routeServices(db); routes = new LogisticsRouteRuleService(db); });
after(async () => { await app?.close(); });

test("route rule authority supports direct multi-hop pickup and source collection structures", async () => {
  const wf = await publishedDoorstepWorkflow(services.workflows, "route-structures");
  const source = await routeNode(services.nodes, "ROUTE_STRUCT_SOURCE", "head_office");
  const hub = await routeNode(services.nodes, "ROUTE_STRUCT_HUB", "hub");
  const pickup = await routeNode(services.nodes, "ROUTE_STRUCT_PICKUP", "pickup_point");
  const lane = await services.lanes.create("admin-commerce", "route-struct-lane", { originNodeId: source.id, destinationNodeId: hub.id, mode: "linehaul", typicalMinutes: 120, serviceDays: [], priority: 0, active: true }, "req-route-struct-lane");
  const pickupLane = await services.lanes.create("admin-commerce", "route-pickup-lane", { originNodeId: hub.id, destinationNodeId: pickup.id, mode: "internal_transfer", typicalMinutes: 30, serviceDays: [], priority: 0, active: true }, "req-route-pickup-lane");

  const directInput = { name: "Direct doorstep", originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery" as const, destinationKind: "doorstep" as const, workflowVersionId: wf.id, priority: 10, stops: [{ position: 1, nodeId: source.id, terminalRole: "final_mile_dispatch" as const }], legs: [] };
  const direct = await routes.create("admin-commerce", "route-direct-create", directInput, "req-route-direct");
  assert.equal(direct.active, false); assert.equal(direct.stops.length, 1); assert.equal(direct.legs.length, 0);
  assert.equal((await routes.get(direct.id)).id, direct.id);
  assert.ok((await routes.list({ originNodeId: source.id })).some((row) => row.id === direct.id));
  assert.equal((await routes.create("admin-commerce", "route-direct-create", directInput, "req-replay")).id, direct.id);

  const multi = await routes.create("admin-commerce", "route-multi-create", { ...directInput, name: "Head office to hub", priority: 11, stops: [{ position: 1, nodeId: source.id, terminalRole: "transit" as const }, { position: 2, nodeId: hub.id, terminalRole: "final_mile_dispatch" as const }], legs: [{ position: 1, laneId: lane.id }] }, "req-route-multi");
  assert.equal(multi.legs[0]?.laneId, lane.id);

  const pickupRule = await routes.create("admin-commerce", "route-pickup-create", { ...directInput, name: "Remote pickup", priority: 12, destinationKind: "pickup_point" as const, finalPickupNodeId: pickup.id, stops: [{ position: 1, nodeId: source.id, terminalRole: "transit" as const }, { position: 2, nodeId: hub.id, terminalRole: "transit" as const }, { position: 3, nodeId: pickup.id, terminalRole: "customer_pickup" as const }], legs: [{ position: 1, laneId: lane.id }, { position: 2, laneId: pickupLane.id }] }, "req-route-pickup");
  assert.equal(pickupRule.finalPickupNodeId, pickup.id);

  const collection = await routes.create("admin-commerce", "route-collection-create", { name: "Source collection", originNodeId: source.id, fulfilment: "collection", destinationKind: "doorstep", workflowVersionId: wf.id, priority: 1, stops: [{ position: 1, nodeId: source.id, terminalRole: "customer_pickup" }], legs: [] } as any, "req-route-collection");
  assert.equal(collection.fulfilment, "collection");

  await assert.rejects(() => routes.create("admin-commerce", "route-bad-first", { ...directInput, name: "Bad first", stops: [{ position: 1, nodeId: hub.id, terminalRole: "final_mile_dispatch" } as any] }, "req-bad-first"));
  await assert.rejects(() => routes.create("admin-commerce", "route-cycle", { ...directInput, name: "Cycle", stops: [{ position: 1, nodeId: source.id, terminalRole: "transit" }, { position: 2, nodeId: source.id, terminalRole: "final_mile_dispatch" } as any], legs: [{ position: 1, laneId: lane.id }] }, "req-cycle"));
  await assert.rejects(() => routes.create("admin-commerce", "route-missing-leg", { ...directInput, name: "No leg", stops: [{ position: 1, nodeId: source.id, terminalRole: "transit" }, { position: 2, nodeId: hub.id, terminalRole: "final_mile_dispatch" } as any], legs: [] }, "req-missing-leg"));
  await assert.rejects(() => routes.create("admin-commerce", "route-wrong-lane", { ...directInput, name: "Wrong lane", stops: [{ position: 1, nodeId: source.id, terminalRole: "transit" }, { position: 2, nodeId: pickup.id, terminalRole: "final_mile_dispatch" } as any], legs: [{ position: 1, laneId: lane.id }] }, "req-wrong-lane"));

  const draftTemplate = await services.workflows.createTemplate("admin-commerce", "route-draft-wf", { name: "Unpublished route workflow", active: true }, "req-route-draft-wf");
  await assert.rejects(() => routes.create("admin-commerce", "route-draft-rule", { ...directInput, name: "Draft workflow", workflowVersionId: draftTemplate.versions[0]!.id }, "req-draft-rule"));
  const inactive = await routeNode(services.nodes, "ROUTE_INACTIVE_SOURCE", "hub", false);
  await assert.rejects(() => routes.create("admin-commerce", "route-inactive-source", { ...directInput, name: "Inactive source", originNodeId: inactive.id, stops: [{ position: 1, nodeId: inactive.id, terminalRole: "final_mile_dispatch" }] as any }, "req-inactive-source"));

  assert.ok(await db.auditEvent.count({ where: { action: "logistics.route_rule.created" } }) >= 4);
  assert.ok(await db.outboxEvent.count({ where: { type: "logistics.route_rule.created" } }) >= 4);
});

test("route rule controller refuses non-admin authority", async () => {
  const controller = new AdminLogisticsRouteRulesController(routes);
  const req = { actor: { id: "customer-a", role: "customer" }, requestId: "req-customer", get: () => undefined } as any;
  await assert.rejects(() => controller.list(req, {}), (error: any) => error?.status === 403 || error?.statusCode === 403);
});
