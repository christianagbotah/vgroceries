import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { LogisticsRouteRuleService } from "../src/logistics/logistics-route-rule.service";
import { ShipmentPlanningService } from "../src/logistics/shipment-planning.service";
import { publishedDoorstepWorkflow, publishedPickupWorkflow, routeNode, routeServices } from "./logistics-route-fixtures";

let app: INestApplication;
let db: Database;
let routes: LogisticsRouteRuleService;
let planning: ShipmentPlanningService;
let services: ReturnType<typeof routeServices>;
const runTag = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const key = (value: string) => `${value}-${runTag}`;
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true",
});

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  services = routeServices(db);
  routes = new LogisticsRouteRuleService(db);
  planning = new ShipmentPlanningService(routes);
});
after(async () => { await app?.close(); });

async function order(name: string, overrides: Record<string, unknown> = {}) {
  const row = await db.order.create({ data: {
    reference: `VG-PLAN-${name}-${runTag}`,
    customerUserId: "customer-a", customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "mobile_money", paymentStatus: "pending",
    fulfilmentStatus: "confirmed", deliveryStatus: "unassigned", logisticsExecutionRequired: true,
    subtotalMinor: 1990, deliveryFeeMinor: 1200, totalMinor: 3190,
    verificationKeyVersion: 1, verificationCodeHash: randomUUID().replace(/-/g, "").padEnd(64, "a").slice(0, 64),
    ...overrides,
  } });
  await db.orderDeliveryAddress.create({ data: {
    orderId: row.id, label: "Home", recipientName: "Ama Customer", phone: "+233241111111",
    locality: "Accra", street: "Liberation Road", landmark: "Near the station",
  } });
  return row;
}

async function activateDirect(sourceId: string, workflowVersionId: string, name: string, priority = 10) {
  const token = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const created = await routes.create("admin-commerce", key(`${token}-create`), {
    name: `${name} ${runTag}`, originNodeId: sourceId, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "doorstep", workflowVersionId, priority,
    stops: [{ position: 1, nodeId: sourceId, terminalRole: "final_mile_dispatch" }], legs: [],
  }, key(`${token}-create-req`));
  return routes.activate("admin-commerce", created.id, key(`${token}-activate`), { expectedVersion: created.version }, key(`${token}-activate-req`));
}

async function plan(orderId: string, originNodeId: string, extra: Record<string, unknown> = {}) {
  return db.$transaction((tx) => planning.planDeliveryShipment(tx, {
    orderId, originNodeId, destinationKind: "doorstep", ...extra,
  }));
}

function problemCode(error: any) { return error?.getResponse?.()?.code; }

test("transaction resolver shares deterministic priority, no-match, and ambiguity semantics", async () => {
  const workflow = await publishedDoorstepWorkflow(services.workflows, key("resolver"));
  const source = await routeNode(services.nodes, key("RESOLVE_SOURCE"), "head_office");
  const primary = await activateDirect(source.id, workflow.id, "Resolver primary", 50);
  await activateDirect(source.id, workflow.id, "Resolver lower", 10);
  const context = { originNodeId: source.id, fulfilment: "delivery" as const, deliveryZoneId: "zone-required", destinationKind: "doorstep" as const, locality: "Accra" };

  const selected = await db.$transaction((tx) => routes.resolveInTransaction(tx, context, new Date()));
  assert.equal(selected.id, primary.id);
  assert.equal(selected.stops.length, 1);

  await assert.rejects(
    () => db.$transaction((tx) => routes.resolveInTransaction(tx, { ...context, deliveryZoneId: "zone-optional" }, new Date())),
    (error: any) => problemCode(error) === "LOGISTICS_ROUTE_NOT_CONFIGURED",
  );

  const conflicting = await routes.create("admin-commerce", key("resolver-conflict-create"), {
    name: `Resolver conflict ${runTag}`, originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "doorstep", workflowVersionId: workflow.id, priority: 50,
    stops: [{ position: 1, nodeId: source.id, terminalRole: "final_mile_dispatch" }], legs: [],
  }, key("resolver-conflict-req"));
  await db.deliveryRouteRule.update({ where: { id: conflicting.id }, data: { active: true } });
  await assert.rejects(
    () => db.$transaction((tx) => routes.resolveInTransaction(tx, context, new Date())),
    (error: any) => problemCode(error) === "LOGISTICS_ROUTE_AMBIGUOUS",
  );
});

test("planning snapshots direct and multi-hop routes immutably and refuses a second shipment", async () => {
  const workflow = await publishedDoorstepWorkflow(services.workflows, key("snapshots"));
  const directSource = await routeNode(services.nodes, key("PLAN_DIRECT"), "fulfilment_center");
  const directRule = await activateDirect(directSource.id, workflow.id, "Direct planning", 20);
  const directOrder = await order("DIRECT");
  const direct = await plan(directOrder.id, directSource.id);
  assert.equal(direct.sequence, 1);
  assert.equal(direct.status, "planned");
  assert.equal(direct.routeRuleId, directRule.id);
  assert.equal(direct.stops.length, 1);
  assert.equal(direct.legs.length, 0);
  assert.equal(direct.custodyState, null);
  await assert.rejects(() => plan(directOrder.id, directSource.id), (error: any) => problemCode(error) === "SHIPMENT_ALREADY_PLANNED");
  assert.equal(await db.shipment.count({ where: { orderId: directOrder.id } }), 1);

  const source = await routeNode(services.nodes, key("PLAN_MULTI_SOURCE"), "head_office");
  const terminal = await routeNode(services.nodes, key("PLAN_MULTI_TERMINAL"), "hub");
  const lane = await services.lanes.create("admin-commerce", key("plan-multi-lane"), {
    originNodeId: source.id, destinationNodeId: terminal.id, mode: "linehaul", providerKey: "internal-fleet",
    typicalMinutes: 95, serviceDays: [1,2,3,4,5,6,7], priority: 0, active: true,
  }, key("plan-multi-lane-req"));
  const multiCreated = await routes.create("admin-commerce", key("plan-multi-route"), {
    name: `Multi planning ${runTag}`, originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "doorstep", workflowVersionId: workflow.id, priority: 30,
    stops: [
      { position: 1, nodeId: source.id, terminalRole: "transit" },
      { position: 2, nodeId: terminal.id, terminalRole: "final_mile_dispatch" },
    ], legs: [{ position: 1, laneId: lane.id }],
  }, key("plan-multi-route-req"));
  await routes.activate("admin-commerce", multiCreated.id, key("plan-multi-route-act"), { expectedVersion: multiCreated.version }, key("plan-multi-route-act-req"));
  const multiOrder = await order("MULTI");
  const multi = await plan(multiOrder.id, source.id);
  assert.equal(multi.stops.length, 2);
  assert.equal(multi.legs.length, 1);
  assert.equal(multi.legs[0]!.status, "planned");
  assert.equal(multi.stops[1]!.nodePublicName, terminal.publicName);
  assert.equal(multi.legs[0]!.typicalMinutes, 95);
  assert.equal(multi.legs[0]!.providerKey, "internal-fleet");

  await db.logisticsNode.update({ where: { id: terminal.id }, data: { publicName: `Renamed ${runTag}` } });
  await db.logisticsLane.update({ where: { id: lane.id }, data: { typicalMinutes: 180, providerKey: "changed-provider" } });
  const frozen = await db.shipment.findUniqueOrThrow({
    where: { id: multi.id }, include: { stops: { orderBy: { position: "asc" } }, legs: { orderBy: { position: "asc" } } },
  });
  assert.equal(frozen.stops[1]!.nodePublicName, terminal.publicName);
  assert.equal(frozen.legs[0]!.typicalMinutes, 95);
  assert.equal(frozen.legs[0]!.providerKey, "internal-fleet");
});

test("planning rejects inactive, unpublished, terminal-mismatched, and pickup-COD routes", async () => {
  const workflow = await publishedDoorstepWorkflow(services.workflows, key("reject"));

  const inactiveSource = await routeNode(services.nodes, key("INACTIVE_SOURCE"), "head_office");
  await routes.create("admin-commerce", key("inactive-route-create"), {
    name: `Inactive route ${runTag}`, originNodeId: inactiveSource.id, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "doorstep", workflowVersionId: workflow.id, priority: 10,
    stops: [{ position: 1, nodeId: inactiveSource.id, terminalRole: "final_mile_dispatch" }], legs: [],
  }, key("inactive-route-req"));
  const inactiveOrder = await order("INACTIVE");
  await assert.rejects(() => plan(inactiveOrder.id, inactiveSource.id), (error: any) => problemCode(error) === "LOGISTICS_ROUTE_NOT_CONFIGURED");

  const retiredSource = await routeNode(services.nodes, key("RETIRED_SOURCE"), "head_office");
  await activateDirect(retiredSource.id, workflow.id, "Retired workflow route", 10);
  await db.deliveryWorkflowVersion.update({ where: { id: workflow.id }, data: { status: "retired" } });
  const retiredOrder = await order("RETIRED");
  await assert.rejects(() => plan(retiredOrder.id, retiredSource.id), (error: any) => problemCode(error) === "RULE_VIOLATION");

  const mismatchWorkflow = await publishedDoorstepWorkflow(services.workflows, key("mismatch"));
  const mismatchSource = await routeNode(services.nodes, key("MISMATCH_SOURCE"), "head_office");
  const mismatchRule = await activateDirect(mismatchSource.id, mismatchWorkflow.id, "Mismatch route", 10);
  await db.deliveryRouteRuleStop.updateMany({ where: { ruleId: mismatchRule.id }, data: { terminalRole: "transit" } });
  const mismatchOrder = await order("MISMATCH");
  await assert.rejects(() => plan(mismatchOrder.id, mismatchSource.id), (error: any) => problemCode(error) === "RULE_VIOLATION");

  const pickupWorkflow = await publishedPickupWorkflow(services.workflows, key("pickup-cod"));
  const pickupSource = await routeNode(services.nodes, key("PICKUP_SOURCE"), "head_office");
  const pickup = await routeNode(services.nodes, key("PICKUP_TERMINAL"), "pickup_point");
  const pickupLane = await services.lanes.create("admin-commerce", key("pickup-cod-lane"), {
    originNodeId: pickupSource.id, destinationNodeId: pickup.id, mode: "internal_transfer", typicalMinutes: 30,
    serviceDays: [1,2,3,4,5,6,7], priority: 0, active: true,
  }, key("pickup-cod-lane-req"));
  const pickupRule = await routes.create("admin-commerce", key("pickup-cod-route"), {
    name: `Pickup COD ${runTag}`, originNodeId: pickupSource.id, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "pickup_point", finalPickupNodeId: pickup.id, workflowVersionId: pickupWorkflow.id, priority: 10,
    stops: [{ position: 1, nodeId: pickupSource.id, terminalRole: "transit" }, { position: 2, nodeId: pickup.id, terminalRole: "customer_pickup" }],
    legs: [{ position: 1, laneId: pickupLane.id }],
  }, key("pickup-cod-route-req"));
  await routes.activate("admin-commerce", pickupRule.id, key("pickup-cod-route-act"), { expectedVersion: pickupRule.version }, key("pickup-cod-route-act-req"));
  const pickupOrder = await order("PICKUP-COD", { paymentMethod: "cash_on_delivery" });
  await assert.rejects(
    () => plan(pickupOrder.id, pickupSource.id, { destinationKind: "pickup_point", finalPickupNodeId: pickup.id }),
    (error: any) => problemCode(error) === "LOGISTICS_PICKUP_COD_UNSUPPORTED",
  );
});

test("existing-order planning upgrades only logistics compatibility and never mutates stock, payment, refund, or Dispatch truth", async () => {
  const workflow = await publishedDoorstepWorkflow(services.workflows, key("existing"));
  const source = await routeNode(services.nodes, key("EXISTING_SOURCE"), "fulfilment_center");
  await activateDirect(source.id, workflow.id, "Existing planning", 10);
  const existing = await order("EXISTING", { logisticsExecutionRequired: false });
  const beforeOrder = await db.order.findUniqueOrThrow({ where: { id: existing.id }, select: {
    version: true, paymentStatus: true, fulfilmentStatus: true, deliveryStatus: true, stockConsumedAt: true, logisticsExecutionRequired: true,
  } });
  const before = {
    movements: await db.stockMovement.count(), depletions: await db.stockDepletion.count(),
    refunds: await db.refund.count(), jobs: await db.deliveryJob.count(),
  };

  const shipment = await db.$transaction((tx) => planning.planExistingDelivery(tx, {
    orderId: existing.id, originNodeId: source.id, destinationKind: "doorstep", expectedOrderVersion: beforeOrder.version,
  }));
  assert.equal(shipment.sequence, 1);

  const afterOrder = await db.order.findUniqueOrThrow({ where: { id: existing.id }, select: {
    version: true, paymentStatus: true, fulfilmentStatus: true, deliveryStatus: true, stockConsumedAt: true, logisticsExecutionRequired: true,
  } });
  assert.equal(afterOrder.logisticsExecutionRequired, true);
  assert.equal(afterOrder.version, beforeOrder.version + 1);
  assert.deepEqual(
    { paymentStatus: afterOrder.paymentStatus, fulfilmentStatus: afterOrder.fulfilmentStatus, deliveryStatus: afterOrder.deliveryStatus, stockConsumedAt: afterOrder.stockConsumedAt },
    { paymentStatus: beforeOrder.paymentStatus, fulfilmentStatus: beforeOrder.fulfilmentStatus, deliveryStatus: beforeOrder.deliveryStatus, stockConsumedAt: beforeOrder.stockConsumedAt },
  );
  assert.deepEqual({
    movements: await db.stockMovement.count(), depletions: await db.stockDepletion.count(),
    refunds: await db.refund.count(), jobs: await db.deliveryJob.count(),
  }, before);
});
