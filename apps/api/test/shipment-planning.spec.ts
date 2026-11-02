import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { LogisticsBootstrapService } from "../src/logistics/logistics-bootstrap.service";
import { LogisticsRouteRuleService } from "../src/logistics/logistics-route-rule.service";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let bootstrap: LogisticsBootstrapService;
let routes: LogisticsRouteRuleService;
let base = "";

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true",
});

async function post(path: string, body: unknown, headers: Record<string,string> = {}) {
  const r = await fetch(base + "/api/v1" + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { r, body: await r.json() };
}
async function native(email: string) {
  const x = await post("/auth/sessions", { email, password: commerceTestPassword, client: "native" }, { origin: "http://localhost:3000" });
  assert.equal(x.r.status, 201);
  return x.body.data.accessToken as string;
}
async function completeDelivery(key: string, token?: string) {
  return post("/checkout/complete", {
    lines: [{ variantId: "var-rice", quantity: "6" }], customerName: "Ama", customerPhone: "+233241111111",
    ...(token ? { customerId: "customer-a" } : {}), fulfilment: "delivery", zoneId: "zone-required",
    slotId: "slot-future", addressId: token ? "address-a" : undefined,
    guestAddress: token ? undefined : { recipientName: "Ama", phone: "+233241111111", locality: "Labone", street: "A Street", ghanaPostGps: "GA-123-4567" },
    paymentMethod: "cash_on_delivery",
  }, { origin: "http://localhost:3000", "idempotency-key": key, ...(token ? { authorization: `Bearer ${token}` } : {}) });
}

async function createLegacyDelivery(reference: string, status = "awaiting_confirmation") {
  const order = await db.order.create({ data: {
    reference, customerUserId: "customer-a", customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
    fulfilmentStatus: status, deliveryStatus: "unassigned", subtotalMinor: 1200, deliveryFeeMinor: 1200, totalMinor: 2400,
    verificationKeyVersion: 1, verificationCodeHash: "a".repeat(64),
  } });
  await db.orderDeliveryAddress.create({ data: { orderId: order.id, label: "Home", recipientName: "Ama Customer", phone: "+233241111111", locality: "Labone", street: "A Street", ghanaPostGps: "GA-123-4567" } });
  return order;
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  bootstrap = app.get(LogisticsBootstrapService);
  routes = app.get(LogisticsRouteRuleService);
});
beforeEach(async () => { await seedCommerceFixtures(db); await bootstrap.ensureDirectDefaults("admin-commerce", "req-direct-defaults"); });
after(async () => { await app?.close(); });

test("flag-on delivery checkout snapshots exactly one planned direct shipment and no movement event", async () => {
  const token = await native("customer-a@example.test");
  const x = await completeDelivery("shipment-direct-checkout", token);
  assert.equal(x.r.status, 201);
  const shipment = await db.shipment.findUniqueOrThrow({ where: { orderId_sequence: { orderId: x.body.data.orderId, sequence: 1 } }, include: { stops: true, legs: true, events: true } });
  assert.equal(shipment.status, "planned");
  assert.equal(shipment.routeRevision, 1);
  assert.equal(shipment.destinationKind, "doorstep");
  assert.equal((shipment.destinationAddress as any).street, "A Street");
  assert.equal(shipment.stops.length, 1);
  assert.equal(shipment.stops[0]?.terminalRole, "final_mile_dispatch");
  assert.equal(shipment.legs.length, 0);
  assert.equal(shipment.events.length, 0);
});

test("multi-hop checkout freezes node and lane display configuration into shipment snapshots", async () => {
  const defaults = await db.deliveryRouteRule.findFirstOrThrow({ where: { name: "VG Direct doorstep · zone-required" } });
  await db.deliveryRouteRule.update({ where: { id: defaults.id }, data: { active: false } });
  const source = await db.logisticsNode.findUniqueOrThrow({ where: { code: "VG_DIRECT_SOURCE" } });
  const hub = await db.logisticsNode.create({ data: { code: "SHIP_PLAN_HUB", name: "Planning hub", publicName: "Original Hub", kind: "hub", kindLabel: "Regional Hub", active: true } });
  const lane = await db.logisticsLane.create({ data: { originNodeId: source.id, destinationNodeId: hub.id, mode: "linehaul", providerKey: "internal-linehaul", typicalMinutes: 180, serviceDays: [], priority: 0, active: true } });
  const workflow = await db.deliveryWorkflowTemplate.findFirstOrThrow({ where: { name: "VG Direct doorstep default" } });
  const created = await routes.create("admin-commerce", "route-multihop-create", {
    name: "Multi-hop doorstep", originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "doorstep", workflowVersionId: workflow.currentPublishedVersionId!, priority: 10,
    stops: [{ position: 1, nodeId: source.id, terminalRole: "transit" }, { position: 2, nodeId: hub.id, terminalRole: "final_mile_dispatch" }],
    legs: [{ position: 1, laneId: lane.id }],
  }, "req-route-multihop-create");
  await routes.activate("admin-commerce", created.id, "route-multihop-activate", { expectedVersion: created.version }, "req-route-multihop-activate");

  const token = await native("customer-a@example.test");
  const x = await completeDelivery("shipment-multihop-checkout", token);
  assert.equal(x.r.status, 201);
  const shipment = await db.shipment.findFirstOrThrow({ where: { orderId: x.body.data.orderId }, include: { stops: { orderBy: { position: "asc" } }, legs: true } });
  assert.equal(shipment.stops[1]?.nodePublicName, "Original Hub");
  assert.equal(shipment.stops[1]?.nodeKindLabel, "Regional Hub");
  assert.equal(shipment.legs[0]?.mode, "linehaul");
  assert.equal(shipment.legs[0]?.providerKey, "internal-linehaul");
  assert.equal(shipment.legs[0]?.typicalMinutes, 180);

  await db.logisticsNode.update({ where: { id: hub.id }, data: { publicName: "Renamed Hub", kindLabel: "Changed" } });
  await db.logisticsLane.update({ where: { id: lane.id }, data: { mode: "third_party", providerKey: "changed-provider", typicalMinutes: 60 } });
  const frozen = await db.shipment.findUniqueOrThrow({ where: { id: shipment.id }, include: { stops: { orderBy: { position: "asc" } }, legs: true } });
  assert.equal(frozen.stops[1]?.nodePublicName, "Original Hub");
  assert.equal(frozen.stops[1]?.nodeKindLabel, "Regional Hub");
  assert.equal(frozen.legs[0]?.mode, "linehaul");
  assert.equal(frozen.legs[0]?.providerKey, "internal-linehaul");
  assert.equal(frozen.legs[0]?.typicalMinutes, 180);
});

test("no matching route and equal-priority ambiguity roll back checkout commerce state atomically", async () => {
  const token = await native("customer-a@example.test");
  await db.deliveryRouteRule.updateMany({ where: { deliveryZoneId: "zone-required" }, data: { active: false } });
  const noMatch = await completeDelivery("shipment-no-route", token);
  assert.equal(noMatch.r.status, 422);
  assert.equal(noMatch.body.error.code, "LOGISTICS_ROUTE_NOT_CONFIGURED");
  assert.deepEqual(await Promise.all([db.order.count(), db.reservation.count(), db.shipment.count(), db.idempotency.count({ where: { operation: "checkout.complete" } })]), [0,0,0,0]);

  await seedCommerceFixtures(db); await bootstrap.ensureDirectDefaults("admin-commerce", "req-direct-defaults-ambiguous");
  const ambiguousToken = await native("customer-a@example.test");
  const direct = await db.deliveryRouteRule.findFirstOrThrow({ where: { name: "VG Direct doorstep · zone-required" }, include: { stops: true } });
  await db.deliveryRouteRule.create({ data: {
    name: "Competing direct", originNodeId: direct.originNodeId, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "doorstep", workflowVersionId: direct.workflowVersionId, priority: direct.priority, active: true, createdBy: "admin-commerce",
    stops: { create: { position: 1, nodeId: direct.originNodeId, terminalRole: "final_mile_dispatch" } },
  } });
  const ambiguous = await completeDelivery("shipment-ambiguous-route", ambiguousToken);
  assert.equal(ambiguous.r.status, 409);
  assert.equal(ambiguous.body.error.code, "LOGISTICS_ROUTE_AMBIGUOUS");
  assert.deepEqual(await Promise.all([db.order.count(), db.reservation.count(), db.shipment.count(), db.idempotency.count({ where: { operation: "checkout.complete" } })]), [0,0,0,0]);
});

test("flag-on collection checkout remains shipment-free", async () => {
  const token = await native("customer-a@example.test");
  const x = await post("/checkout/complete", { lines: [{ variantId: "var-rice", quantity: "1" }], customerName: "Ama", customerPhone: "+233241111111", customerId: "customer-a", fulfilment: "collection", paymentMethod: "cash_counter" }, { origin: "http://localhost:3000", "idempotency-key": "shipment-collection", authorization: `Bearer ${token}` });
  assert.equal(x.r.status, 201);
  assert.equal(await db.shipment.count({ where: { orderId: x.body.data.orderId } }), 0);
});

test("admin legacy planning is admin-only replay-safe and refuses duplicate or handed-over planning", async () => {
  const legacy = await createLegacyDelivery("VG-LEGACY-PLAN");
  const customerToken = await native("customer-a@example.test");
  const forbidden = await post(`/admin/logistics/orders/${legacy.id}/plan`, { destinationKind: "doorstep" }, { authorization: `Bearer ${customerToken}`, "idempotency-key": "legacy-plan-forbidden" });
  assert.equal(forbidden.r.status, 403);

  const adminToken = await native("admin-commerce@example.test");
  const headers = { authorization: `Bearer ${adminToken}`, "idempotency-key": "legacy-plan-1" };
  const first = await post(`/admin/logistics/orders/${legacy.id}/plan`, { destinationKind: "doorstep" }, headers);
  assert.equal(first.r.status, 200);
  const replay = await post(`/admin/logistics/orders/${legacy.id}/plan`, { destinationKind: "doorstep" }, headers);
  assert.equal(replay.r.status, 200);
  assert.deepEqual(replay.body.data, first.body.data);
  assert.equal(await db.shipment.count({ where: { orderId: legacy.id } }), 1);
  const duplicate = await post(`/admin/logistics/orders/${legacy.id}/plan`, { destinationKind: "doorstep" }, { authorization: `Bearer ${adminToken}`, "idempotency-key": "legacy-plan-2" });
  assert.equal(duplicate.r.status, 409);
  assert.equal(await db.shipment.count({ where: { orderId: legacy.id } }), 1);

  const handed = await createLegacyDelivery("VG-LEGACY-HANDED", "dispatched");
  await db.fulfilmentRun.create({ data: { orderId: handed.id, locationId: "loc_accra", confirmedBy: "admin-commerce", confirmedAt: new Date(), handedOverBy: "admin-commerce", handedOverAt: new Date(), handoverKind: "dispatch" } });
  const afterHandover = await post(`/admin/logistics/orders/${handed.id}/plan`, { destinationKind: "doorstep" }, { authorization: `Bearer ${adminToken}`, "idempotency-key": "legacy-plan-handed" });
  assert.equal(afterHandover.r.status, 422);
  assert.equal(await db.shipment.count({ where: { orderId: handed.id } }), 0);
});
