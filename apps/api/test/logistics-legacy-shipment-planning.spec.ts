import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { LogisticsRouteRuleService } from "../src/logistics/logistics-route-rule.service";
import { ShipmentPlanningService } from "../src/logistics/shipment-planning.service";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { publishedDoorstepWorkflow, routeNode, routeServices } from "./logistics-route-fixtures";

let app: INestApplication;
let db: Database;
let routes: LogisticsRouteRuleService;
let planning: ShipmentPlanningService;
let services: ReturnType<typeof routeServices>;
const runTag = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const key = (value: string) => `${value}-${runTag}`;
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!,
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra",
  CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440",
  GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1",
  ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true",
});

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("isolated database required");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  services = routeServices(db);
  routes = new LogisticsRouteRuleService(db);
  planning = new ShipmentPlanningService(routes);
});
after(async () => { await app?.close(); });

async function legacyOrder(name: string, overrides: Record<string, unknown> = {}) {
  const order = await db.order.create({ data: {
    reference: `VG-LEGACY-${name}-${runTag}`,
    customerUserId: "customer-a",
    customerName: "Ama Customer",
    customerPhone: "+233241111111",
    fulfilment: "delivery",
    zoneId: "zone-required",
    paymentMethod: "mobile_money",
    paymentStatus: "pending",
    fulfilmentStatus: "confirmed",
    deliveryStatus: "unassigned",
    logisticsExecutionRequired: false,
    subtotalMinor: 1990,
    deliveryFeeMinor: 1200,
    totalMinor: 3190,
    verificationKeyVersion: 1,
    verificationCodeHash: randomUUID().replace(/-/g, "").padEnd(64, "a").slice(0, 64),
    ...overrides,
  } });
  await db.orderDeliveryAddress.create({ data: {
    orderId: order.id,
    label: "Home",
    recipientName: "Ama Customer",
    phone: "+233241111111",
    locality: "Labone",
    street: "A Street",
    ghanaPostGps: "GA-123-4567",
  } });
  const line = await db.orderLine.create({ data: {
    orderId: order.id,
    variantId: "var-rice",
    productName: "Fixture Rice",
    variantName: "Weighted rice",
    unit: "kg",
    quantity: "1",
    unitPriceMinor: 1990,
    lineTotalMinor: 1990,
  } });
  await db.reservation.create({ data: {
    positionId: "pos-rice",
    lotId: "lot-rice",
    claimType: "order",
    claimId: order.id,
    claimLineId: line.id,
    quantity: "1",
    state: "active",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  } });
  return { order, line };
}

async function activeDirectRoute(name: string) {
  const workflow = await publishedDoorstepWorkflow(services.workflows, key(`legacy-${name}`));
  const source = await routeNode(services.nodes, key(`LEGACY_SOURCE_${name}`), "fulfilment_center");
  await db.logisticsNode.update({ where: { id: source.id }, data: { inventoryLocationId: "loc_accra" } });
  const created = await routes.create("admin-commerce", key(`legacy-route-${name}`), {
    name: `Legacy route ${name} ${runTag}`,
    originNodeId: source.id,
    deliveryZoneId: "zone-required",
    fulfilment: "delivery",
    destinationKind: "doorstep",
    workflowVersionId: workflow.id,
    priority: 20,
    stops: [{ position: 1, nodeId: source.id, terminalRole: "final_mile_dispatch" }],
    legs: [],
  }, key(`legacy-route-${name}-req`));
  await routes.activate("admin-commerce", created.id, key(`legacy-route-${name}-activate`), {
    expectedVersion: created.version,
  }, key(`legacy-route-${name}-activate-req`));
  return source;
}

function problemCode(error: any) { return error?.getResponse?.()?.code; }

test("legacy unhanded delivery derives its source from exact reservation coverage and an existing fulfilment run", async () => {
  const source = await activeDirectRoute("derive");
  const { order } = await legacyOrder("DERIVE");
  await db.fulfilmentRun.create({ data: {
    orderId: order.id,
    locationId: "loc_accra",
    confirmedBy: "admin-commerce",
    confirmedAt: new Date(),
  } });

  const before = {
    movements: await db.stockMovement.count(),
    depletions: await db.stockDepletion.count(),
    jobs: await db.deliveryJob.count(),
    events: await db.shipmentEvent.count(),
  };
  const shipment = await db.$transaction((tx) => planning.planExistingDelivery(tx, {
    orderId: order.id,
    destinationKind: "doorstep",
    expectedOrderVersion: order.version,
  } as any));

  assert.equal(shipment.originNodeId, source.id);
  assert.equal(shipment.status, "planned");
  assert.equal(shipment.events.length, 0, "planning must not invent historical movement");
  const updated = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(updated.logisticsExecutionRequired, true);
  assert.equal(updated.version, order.version + 1);
  assert.deepEqual({
    movements: await db.stockMovement.count(),
    depletions: await db.stockDepletion.count(),
    jobs: await db.deliveryJob.count(),
    events: await db.shipmentEvent.count(),
  }, before);
});

test("legacy planning fails closed when fulfilment-run location conflicts with reservation authority", async () => {
  await activeDirectRoute("conflict");
  const { order } = await legacyOrder("CONFLICT");
  await db.location.create({ data: { id: key("loc-other"), name: "Other", active: true } });
  await db.fulfilmentRun.create({ data: {
    orderId: order.id,
    locationId: key("loc-other"),
    confirmedBy: "admin-commerce",
    confirmedAt: new Date(),
  } });

  await assert.rejects(
    () => db.$transaction((tx) => planning.planExistingDelivery(tx, {
      orderId: order.id,
      destinationKind: "doorstep",
      expectedOrderVersion: order.version,
    } as any)),
    (error: any) => problemCode(error) === "RESERVATION_LOST",
  );
  assert.equal(await db.shipment.count({ where: { orderId: order.id } }), 0);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).logisticsExecutionRequired, false);
});

test("legacy planning refuses stale versions and handed-over evidence without creating shipment facts", async () => {
  await activeDirectRoute("guards");
  const stale = await legacyOrder("STALE");
  await assert.rejects(
    () => db.$transaction((tx) => planning.planExistingDelivery(tx, {
      orderId: stale.order.id,
      destinationKind: "doorstep",
      expectedOrderVersion: stale.order.version + 1,
    } as any)),
    (error: any) => problemCode(error) === "ORDER_VERSION_CONFLICT",
  );

  const handed = await legacyOrder("HANDED", { stockConsumedAt: new Date(), fulfilmentStatus: "dispatched" });
  await assert.rejects(
    () => db.$transaction((tx) => planning.planExistingDelivery(tx, {
      orderId: handed.order.id,
      destinationKind: "doorstep",
      expectedOrderVersion: handed.order.version,
    } as any)),
    (error: any) => problemCode(error) === "SHIPMENT_ORDER_ALREADY_HANDED_OVER",
  );
  assert.equal(await db.shipment.count({ where: { orderId: { in: [stale.order.id, handed.order.id] } } }), 0);
});
