import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { LogisticsRouteRuleService } from "../src/logistics/logistics-route-rule.service";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";
import { publishedPickupWorkflow, routeNode, routeServices } from "./logistics-route-fixtures";

let app: INestApplication;
let db: Database;
let base: string;
let routes: LogisticsRouteRuleService;
let services: ReturnType<typeof routeServices>;
let serial = 0;
const key = (value: string) => `${value}-${++serial}`;

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }), LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true",
});

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${base}/api/v1${path}`, init);
  return { response, body: await response.json() };
}
async function post(path: string, body: unknown, headers: Record<string,string> = {}) {
  return request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
async function native() {
  const login = await post("/auth/sessions", { email: "customer-a@example.test", password: commerceTestPassword, client: "native" }, { origin: "http://localhost:3000" });
  assert.equal(login.response.status, 201); return login.body.data.accessToken as string;
}
async function sourceNode() {
  const source = await routeNode(services.nodes, key("PICKUP_SOURCE"), "fulfilment_center");
  await db.logisticsNode.update({ where: { id: source.id }, data: { inventoryLocationId: "loc_accra" } });
  return source;
}
async function pickupRoute(sourceId: string, visible = true) {
  const workflow = await publishedPickupWorkflow(services.workflows, key("pickup-workflow"));
  const pickup = await routeNode(services.nodes, key("PICKUP_POINT"), "pickup_point");
  await db.logisticsNode.update({ where: { id: pickup.id }, data: {
    publicName: "Osu Pickup Centre", addressLine: "Oxford Street", locality: "Osu", region: "Greater Accra",
    ghanaPostGps: "GA-123-4567", publicDirections: "Opposite the post office", publicContact: "+233241234567", customerVisible: visible,
  } });
  const lane = await services.lanes.create("admin-commerce", key("pickup-lane"), {
    originNodeId: sourceId, destinationNodeId: pickup.id, mode: "linehaul", providerKey: "internal-fleet", typicalMinutes: 45,
    serviceDays: [1,2,3,4,5,6,7], priority: 0, active: true,
  }, key("pickup-lane-request"));
  const created = await routes.create("admin-commerce", key("pickup-route-create"), {
    name: key("Internal pickup route"), originNodeId: sourceId, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "pickup_point", finalPickupNodeId: pickup.id, workflowVersionId: workflow.id, priority: 50,
    stops: [{ position: 1, nodeId: sourceId, terminalRole: "transit" }, { position: 2, nodeId: pickup.id, terminalRole: "customer_pickup" }],
    legs: [{ position: 1, laneId: lane.id }],
  }, key("pickup-route-request"));
  await routes.activate("admin-commerce", created.id, key("pickup-route-activate"), { expectedVersion: created.version }, key("pickup-route-activate-request"));
  return { pickup, route: created, lane };
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config(), [new FakePaymentProvider()]); await app.listen(0, "127.0.0.1"); base = await app.getUrl();
  db = app.get(Database); services = routeServices(db); routes = new LogisticsRouteRuleService(db);
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => { await app?.close(); });

test("pickup options expose only customer-safe public node fields from active routes", async () => {
  const source = await sourceNode(); const { pickup, route, lane } = await pickupRoute(source.id, true);
  const result = await request("/checkout/pickup-options?zoneId=zone-required");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.data, [{
    nodeId: pickup.id, publicName: "Osu Pickup Centre", addressLine: "Oxford Street", locality: "Osu", region: "Greater Accra",
    ghanaPostGps: "GA-123-4567", publicDirections: "Opposite the post office", publicContact: "+233241234567",
  }]);
  const serialized = JSON.stringify(result.body.data);
  assert.equal(serialized.includes(route.id), false);
  assert.equal(serialized.includes(lane.id), false);
  assert.equal(serialized.includes("Internal pickup route"), false);
  assert.equal(serialized.includes("internal-fleet"), false);
});

test("hidden pickup nodes are omitted rather than exposed as selectable destinations", async () => {
  const source = await sourceNode(); await pickupRoute(source.id, false);
  const result = await request("/checkout/pickup-options?zoneId=zone-required");
  assert.equal(result.response.status, 200); assert.deepEqual(result.body.data, []);
});

test("remote pickup checkout succeeds without persisting a doorstep address snapshot", async () => {
  const source = await sourceNode(); const { pickup } = await pickupRoute(source.id, true); const token = await native();
  const result = await post("/checkout/complete", {
    lines: [{ variantId: "var-rice", quantity: "6" }], customerName: "Ama", customerPhone: "+233241111111", customerId: "customer-a",
    fulfilment: "delivery", deliveryDestination: { kind: "pickup_point", finalPickupNodeId: pickup.id }, zoneId: "zone-required", slotId: "slot-future",
    paymentMethod: "mobile_money", idempotencyKey: "pickup-no-address-body",
  }, { origin: "http://localhost:3000", authorization: `Bearer ${token}`, "idempotency-key": "pickup-no-address-body" });
  assert.equal(result.response.status, 201);
  const order = await db.order.findUniqueOrThrow({ where: { id: result.body.data.orderId }, include: { deliveryAddress: true, shipments: true } });
  assert.equal(order.deliveryAddress, null); assert.equal(order.logisticsExecutionRequired, true); assert.equal(order.shipments.length, 1);
  assert.equal(order.shipments[0]!.destinationKind, "pickup_point"); assert.equal(order.shipments[0]!.finalPickupNodeId, pickup.id);
  assert.equal(order.shipments[0]!.destinationAddressSnapshot, null);
});
