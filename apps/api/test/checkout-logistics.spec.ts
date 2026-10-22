import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { LogisticsRouteRuleService } from "../src/logistics/logistics-route-rule.service";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { publishedDoorstepWorkflow, publishedPickupWorkflow, routeNode, routeServices } from "./logistics-route-fixtures";

let app: INestApplication;
let db: Database;
let base: string;
let routes: LogisticsRouteRuleService;
let services: ReturnType<typeof routeServices>;
let serial = 0;
const key = (value: string) => `${value}-${++serial}`;

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

async function post(path: string, body: unknown, headers: Record<string,string> = {}) {
  const response = await fetch(`${base}/api/v1${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { response, body: await response.json() };
}
async function native() {
  const login = await post("/auth/sessions", { email: "customer-a@example.test", password: commerceTestPassword, client: "native" }, { origin: "http://localhost:3000" });
  assert.equal(login.response.status, 201);
  return login.body.data.accessToken as string;
}
async function complete(body: any, idempotencyKey: string, token: string) {
  return post("/checkout/complete", body, { origin: "http://localhost:3000", authorization: `Bearer ${token}`, "idempotency-key": idempotencyKey });
}
function deliveryBody(destination?: any) {
  return {
    lines: [{ variantId: "var-rice", quantity: "6" }], customerName: "Ama", customerPhone: "+233241111111", customerId: "customer-a",
    fulfilment: "delivery", ...(destination ? { deliveryDestination: destination } : {}), zoneId: "zone-required", slotId: "slot-future",
    addressId: "address-a", paymentMethod: "cash_on_delivery",
  };
}
async function sourceNode() {
  const source = await routeNode(services.nodes, key("CHECKOUT_SOURCE"), "fulfilment_center");
  await db.logisticsNode.update({ where: { id: source.id }, data: { inventoryLocationId: "loc_accra" } });
  return source;
}
async function directDoorstep(sourceId: string) {
  const workflow = await publishedDoorstepWorkflow(services.workflows, key("checkout-doorstep"));
  const created = await routes.create("admin-commerce", key("checkout-doorstep-create"), {
    name: key("Checkout doorstep"), originNodeId: sourceId, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "doorstep", workflowVersionId: workflow.id, priority: 50,
    stops: [{ position: 1, nodeId: sourceId, terminalRole: "final_mile_dispatch" }], legs: [],
  }, key("checkout-doorstep-request"));
  return routes.activate("admin-commerce", created.id, key("checkout-doorstep-activate"), { expectedVersion: created.version }, key("checkout-doorstep-activate-request"));
}
async function pickupRoute(sourceId: string, customerVisible = true) {
  const workflow = await publishedPickupWorkflow(services.workflows, key("checkout-pickup"));
  const pickup = await routeNode(services.nodes, key("CHECKOUT_PICKUP"), "pickup_point");
  const lane = await services.lanes.create("admin-commerce", key("checkout-pickup-lane"), {
    originNodeId: sourceId, destinationNodeId: pickup.id, mode: "linehaul", providerKey: "internal-fleet", typicalMinutes: 45,
    serviceDays: [1,2,3,4,5,6,7], priority: 0, active: true,
  }, key("checkout-pickup-lane-request"));
  const created = await routes.create("admin-commerce", key("checkout-pickup-route"), {
    name: key("Checkout pickup"), originNodeId: sourceId, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "pickup_point", finalPickupNodeId: pickup.id, workflowVersionId: workflow.id, priority: 50,
    stops: [{ position: 1, nodeId: sourceId, terminalRole: "transit" }, { position: 2, nodeId: pickup.id, terminalRole: "customer_pickup" }],
    legs: [{ position: 1, laneId: lane.id }],
  }, key("checkout-pickup-route-request"));
  await routes.activate("admin-commerce", created.id, key("checkout-pickup-activate"), { expectedVersion: created.version }, key("checkout-pickup-activate-request"));
  if (!customerVisible) await db.logisticsNode.update({ where: { id: pickup.id }, data: { customerVisible: false } });
  return pickup;
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  services = routeServices(db);
  routes = new LogisticsRouteRuleService(db);
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => { await app?.close(); });

test("flag-enabled delivery checkout atomically creates the immutable doorstep shipment snapshot", async () => {
  const source = await sourceNode();
  const route = await directDoorstep(source.id);
  const token = await native();
  const result = await complete(deliveryBody(), "checkout-logistics-success", token);
  assert.equal(result.response.status, 201);
  const order = await db.order.findUniqueOrThrow({ where: { id: result.body.data.orderId }, include: { shipment: { include: { stops: true, legs: true } } } });
  assert.equal(order.logisticsExecutionRequired, true);
  assert.equal(order.shipment?.sequence, 1);
  assert.equal(order.shipment?.routeRuleId, route.id);
  assert.equal(order.shipment?.destinationKind, "doorstep");
  assert.equal(order.shipment?.stops.length, 1);
  assert.equal(order.shipment?.legs.length, 0);
  assert.equal((order.shipment?.destinationAddressSnapshot as any)?.street, "A Street");
  assert.equal(await db.deliveryJob.count({ where: { orderId: order.id } }), 0);
});

test("missing logistics route rolls back order, stock hold, slot booking, shipment and checkout idempotency", async () => {
  await sourceNode();
  const token = await native();
  const baselineIdempotency = await db.idempotency.count();
  const result = await complete(deliveryBody(), "checkout-logistics-no-route", token);
  assert.equal(result.response.status, 422);
  assert.equal(result.body.error.code, "LOGISTICS_ROUTE_NOT_CONFIGURED");
  assert.deepEqual(await Promise.all([db.order.count(), db.reservation.count(), db.deliverySlotBooking.count(), db.shipment.count(), db.idempotency.count()]), [0,0,0,0,baselineIdempotency]);
});

test("checkout rejects hidden pickup centres before creating commerce state", async () => {
  const source = await sourceNode();
  const pickup = await pickupRoute(source.id, false);
  const token = await native();
  const baselineIdempotency = await db.idempotency.count();
  const result = await complete(deliveryBody({ kind: "pickup_point", finalPickupNodeId: pickup.id }), "checkout-hidden-pickup", token);
  assert.equal(result.response.status, 422);
  assert.equal(result.body.error.code, "LOGISTICS_PICKUP_NOT_AVAILABLE");
  assert.deepEqual(await Promise.all([db.order.count(), db.reservation.count(), db.shipment.count(), db.idempotency.count()]), [0,0,0,baselineIdempotency]);
});

test("checkout preserves planner authority by rejecting pickup cash-on-delivery atomically", async () => {
  const source = await sourceNode();
  const pickup = await pickupRoute(source.id, true);
  const token = await native();
  const baselineIdempotency = await db.idempotency.count();
  const result = await complete(deliveryBody({ kind: "pickup_point", finalPickupNodeId: pickup.id }), "checkout-pickup-cod", token);
  assert.equal(result.response.status, 422);
  assert.equal(result.body.error.code, "LOGISTICS_PICKUP_COD_UNSUPPORTED");
  assert.deepEqual(await Promise.all([db.order.count(), db.reservation.count(), db.shipment.count(), db.idempotency.count()]), [0,0,0,baselineIdempotency]);
});
