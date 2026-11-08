import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { productionOpenApi } from "../src/http/production-openapi";
import { Database } from "../src/database/database";
import { LogisticsBootstrapService } from "../src/logistics/logistics-bootstrap.service";
import { LogisticsRouteRuleService } from "../src/logistics/logistics-route-rule.service";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";
import { FakeRefundProvider } from "./fake-refund-provider";
import { publishedPickupWorkflow, routeServices } from "./logistics-route-fixtures";

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
  LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true", LOGISTICS_CUSTOMER_PICKUP_ENABLED: "true",
  PAYMENT_PROVIDER_ID: "fake", PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted,bank_transfer",
  PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "1000",
  PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "pay.example.test",
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
async function completeDelivery(key: string, token?: string, overrides: Record<string, unknown> = {}) {
  return post("/checkout/complete", {
    lines: [{ variantId: "var-rice", quantity: "6" }], customerName: "Ama", customerPhone: "+233241111111",
    ...(token ? { customerId: "customer-a" } : {}), fulfilment: "delivery", zoneId: "zone-required",
    slotId: "slot-future", addressId: token ? "address-a" : undefined,
    guestAddress: token ? undefined : { recipientName: "Ama", phone: "+233241111111", locality: "Labone", street: "A Street", ghanaPostGps: "GA-123-4567" },
    paymentMethod: "cash_on_delivery",
    ...overrides,
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
  app = await createApplication(config(), [new FakePaymentProvider()], [new FakeRefundProvider()]);
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

async function configurePickupRoute(key: string) {
  const source = await db.logisticsNode.findUniqueOrThrow({ where: { code: "VG_DIRECT_SOURCE" } });
  const pickup = await db.logisticsNode.create({ data: {
    code: `PICKUP_${key.toUpperCase()}`, name: "Internal pickup location",
    publicName: "Kumasi Central Collection", kind: "pickup_point", kindLabel: "Pickup centre",
    active: true, customerVisible: true, locality: "Kumasi", publicDirections: "Ask for the collection counter.",
  } });
  const lane = await db.logisticsLane.create({ data: {
    originNodeId: source.id, destinationNodeId: pickup.id, mode: "internal_transfer",
    typicalMinutes: 180, serviceDays: [], priority: 0, active: true,
  } });
  const workflow = await publishedPickupWorkflow(routeServices(db).workflows, key);
  const rule = await routes.create("admin-commerce", `pickup-${key}-create`, {
    name: `Pickup option ${key}`, originNodeId: source.id, deliveryZoneId: "zone-required",
    fulfilment: "delivery", destinationKind: "pickup_point", finalPickupNodeId: pickup.id,
    workflowVersionId: workflow.id, priority: 10,
    stops: [{ position: 1, nodeId: source.id, terminalRole: "transit" },
      { position: 2, nodeId: pickup.id, terminalRole: "customer_pickup" }],
    legs: [{ position: 1, laneId: lane.id }],
  }, `req-pickup-${key}-create`);
  await routes.activate("admin-commerce", rule.id, `pickup-${key}-activate`,
    { expectedVersion: rule.version }, `req-pickup-${key}-activate`);
  return pickup;
}

test("pickup options expose only configured, active, customer-visible destination metadata", async () => {
  const pickup = await configurePickupRoute("discover");
  const url = base + "/api/v1/checkout/zones/zone-required/pickup-points";
  const first = await fetch(url);
  assert.equal(first.status, 200);
  const payload = await first.json();
  assert.equal(payload.data.enabled, true);
  assert.deepEqual(payload.data.points, [{
    id: pickup.id,
    name: "Kumasi Central Collection",
    kindLabel: "Pickup centre",
    locality: "Kumasi", region: null, addressLine: null,
    ghanaPostGps: null, directions: "Ask for the collection counter.", contact: null,
    feeMinor: 1200, feeBasis: "zone_delivery",
  }]);
  assert.ok(!JSON.stringify(payload.data).includes("Internal pickup location"));
  const byLocale = await (await fetch(url + "?locality=Labone")).json();
  assert.equal(byLocale.data.points.length, 1);
  await db.logisticsNode.update({ where: { id: pickup.id }, data: { active: false } });
  const afterDisable = await (await fetch(url)).json();
  assert.deepEqual(afterDisable.data.points, []);
  const token = await native("customer-a@example.test");
  const denied = await completeDelivery("pickup-disabled-node", token, {
    destinationKind: "pickup_point", finalPickupNodeId: pickup.id, expectedDeliveryFeeMinor: 1200,
    addressId: undefined, guestAddress: undefined,
    paymentMethod: "mobile_money",
  });
  assert.equal(denied.r.status, 422);
  assert.equal(denied.body.error.code, "LOGISTICS_ROUTE_NOT_CONFIGURED");
  assert.equal(await db.order.count(), 0);
});

test("configured remote pickup checkout freezes the exact pickup node without inventing delivery address", async () => {
  const pickup = await configurePickupRoute("success");
  const token = await native("customer-a@example.test");
  const x = await completeDelivery("pickup-checkout-success", token, {
    destinationKind: "pickup_point", finalPickupNodeId: pickup.id, expectedDeliveryFeeMinor: 1200,
    addressId: undefined, guestAddress: undefined,
    paymentMethod: "mobile_money",
  });
  assert.equal(x.r.status, 201, JSON.stringify(x.body));
  const shipment = await db.shipment.findFirstOrThrow({ where: { orderId: x.body.data.orderId },
    include: { stops: { orderBy: { position: "asc" } }, legs: true } });
  assert.equal(shipment.destinationKind, "pickup_point");
  assert.equal(shipment.finalPickupNodeId, pickup.id);
  assert.equal(shipment.stops.at(-1)?.terminalRole, "customer_pickup");
  assert.equal(shipment.legs.length, 1);
  assert.equal(await db.orderDeliveryAddress.count({ where: { orderId: x.body.data.orderId } }), 0);
  const snapshot = await db.orderPickupSnapshot.findUniqueOrThrow({ where: { orderId: x.body.data.orderId } });
  assert.equal(snapshot.nodeId, pickup.id);
  assert.equal(snapshot.name, "Kumasi Central Collection");
  assert.equal(snapshot.feeBasis, "zone_delivery");
  assert.equal(snapshot.feeMinor, 1200);
  assert.ok(snapshot.transportWindowStart && snapshot.transportWindowEnd);
  const replay = await completeDelivery("pickup-checkout-success", token, {
    destinationKind: "pickup_point", finalPickupNodeId: pickup.id, expectedDeliveryFeeMinor: 1200,
    addressId: undefined, guestAddress: undefined,
    paymentMethod: "mobile_money",
  });
  assert.equal(replay.r.status, 201);
  assert.equal(replay.body.data.orderId, x.body.data.orderId);
  assert.equal(await db.shipment.count({ where: { orderId: x.body.data.orderId } }), 1);
});

test("pickup checkout rejects missing or foreign route nodes and never creates partial commerce state", async () => {
  const token = await native("customer-a@example.test");
  const incomplete = await completeDelivery("pickup-checkout-missing", token, {
    destinationKind: "pickup_point", addressId: undefined, guestAddress: undefined,
  });
  assert.equal(incomplete.r.status, 400);
  const forbidden = await completeDelivery("pickup-checkout-injected", token, {
    destinationKind: "pickup_point", finalPickupNodeId: "not-a-configured-node", expectedDeliveryFeeMinor: 1200,
    addressId: undefined, guestAddress: undefined,
    paymentMethod: "mobile_money",
  });
  assert.equal(forbidden.r.status, 422);
  assert.equal(forbidden.body.error.code, "LOGISTICS_ROUTE_NOT_CONFIGURED");
  const badCollection = await post("/checkout/complete", {
    lines: [{ variantId: "var-rice", quantity: "1" }], customerName: "Ama", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: "cash_counter",
    destinationKind: "pickup_point", finalPickupNodeId: "not-a-configured-node",
  }, { origin: "http://localhost:3000", "idempotency-key": "pickup-collection-not-allowed",
    authorization: `Bearer ${token}` });
  assert.equal(badCollection.r.status, 400);
  assert.deepEqual(await Promise.all([
    db.order.count(), db.shipment.count(), db.reservation.count(),
    db.idempotency.count({ where: { operation: "checkout.complete" } }),
  ]), [0, 0, 0, 0]);
});


test("production OpenAPI describes the public pickup discovery and checkout fields without claiming activation", () => {
  const doc = productionOpenApi(app) as any;
  const path = doc.paths["/api/v1/checkout/zones/{zoneId}/pickup-points"];
  assert.ok(path?.get);
  assert.deepEqual(path.get.security, []);
  assert.deepEqual(path.get.responses["200"].content["application/json"].schema, {
    $ref: "#/components/schemas/CheckoutPickupOptionsResponseEnvelope",
  });
  const request = doc.components.schemas.CheckoutCompleteRestRequest;
  assert.ok(request.properties.destinationKind);
  assert.ok(request.properties.finalPickupNodeId);
  assert.equal(doc.paths["/api/v1/checkout/complete"].post.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/CheckoutCompleteRestRequest");
});

test("pickup quote and checkout use the centre's configured fee, reject changed prices and freeze customer-safe details", async () => {
  const pickup=await configurePickupRoute("PRICE");
  await db.logisticsNode.update({where:{id:pickup.id},data:{
    pickupFeeMinor:350, publicName:"Kumasi Riverside Counter",
    addressLine:"14 River Road",locality:"Kumasi",region:"Ashanti",
    ghanaPostGps:"AK-123-4567",publicDirections:"Ask for counter 3.",publicContact:"+233240000001",
  }});
  const discovered=await (await fetch(base+"/api/v1/checkout/zones/zone-required/pickup-points")).json();
  assert.equal(discovered.data.points.length,1);
  const option=discovered.data.points[0];
  assert.equal(option.feeMinor,350);
  assert.equal(option.feeBasis,"centre_pickup");
  assert.equal(option.name,"Kumasi Riverside Counter");

  const quote=await post("/checkout/quote",{lines:[{variantId:"var-rice",quantity:"6"}],
    zoneId:"zone-required",destinationKind:"pickup_point",finalPickupNodeId:pickup.id});
  assert.equal(quote.r.status,200,JSON.stringify(quote.body));
  assert.equal(quote.body.data.deliveryFeeMinor,350);
  assert.equal(quote.body.data.feeBasis,"centre_pickup");
  assert.equal(quote.body.data.totalMinor,1194+350);
  assert.equal(quote.body.data.meetsMinimum,true);

  const token=await native("customer-a@example.test");
  const selected={destinationKind:"pickup_point" as const,finalPickupNodeId:pickup.id,
    addressId:undefined,guestAddress:undefined,paymentMethod:"mobile_money"};
  const mismatch=await completeDelivery("price-stale",token,{...selected,expectedDeliveryFeeMinor:1200});
  assert.equal(mismatch.r.status,409,JSON.stringify(mismatch.body));
  assert.equal(mismatch.body.error.code,"PICKUP_FEE_CHANGED");
  assert.equal(mismatch.body.error.details.currentFeeMinor,350);
  assert.deepEqual(await Promise.all([
    db.order.count(),db.shipment.count(),db.orderPickupSnapshot.count(),
    db.reservation.count(),db.idempotency.count({where:{operation:"checkout.complete"}}),
  ]),[0,0,0,0,0]);

  const placed=await completeDelivery("price-accept",token,{...selected,expectedDeliveryFeeMinor:350});
  assert.equal(placed.r.status,201,JSON.stringify(placed.body));
  const id=placed.body.data.orderId as string;
  const original=await db.order.findUniqueOrThrow({where:{id},include:{pickupSnapshot:true,slot:true}});
  assert.equal(original.deliveryFeeMinor,350);
  assert.equal(original.totalMinor,1544);
  assert.equal(original.pickupSnapshot?.name,"Kumasi Riverside Counter");
  assert.equal(original.pickupSnapshot?.feeBasis,"centre_pickup");
  assert.equal(original.pickupSnapshot?.feeMinor,350);
  assert.equal(original.pickupSnapshot?.transportWindowStart?.getTime(),original.slot?.startsAt.getTime());
  assert.equal(original.pickupSnapshot?.transportWindowEnd?.getTime(),original.slot?.endsAt.getTime());

  const status=await fetch(base+`/api/v1/orders/${id}`,{headers:{authorization:`Bearer ${token}`}});
  assert.equal(status.status,200);
  const current=(await status.json()).data;
  assert.equal(current.pickupPoint.name,"Kumasi Riverside Counter");
  assert.equal(current.pickupPoint.directions,"Ask for counter 3.");
  assert.equal(current.pickupPoint.feeMinor,350);
  assert.equal(current.pickupPoint.transportWindow.startsAt,original.slot?.startsAt.toISOString());
  assert.ok(!JSON.stringify(current.pickupPoint).includes(pickup.id));
  assert.ok(!JSON.stringify(current.pickupPoint).includes("Internal pickup location"));

  await db.logisticsNode.update({where:{id:pickup.id},data:{
    publicName:"Different Name",publicDirections:"Different directions",
    pickupFeeMinor:0,publicContact:"+233240000002",
  }});
  const updated=(await (await fetch(base+`/api/v1/orders/${id}`,{
    headers:{authorization:`Bearer ${token}`},
  })).json()).data;
  assert.deepEqual(updated.pickupPoint,current.pickupPoint);
  const replay=await completeDelivery("price-accept",token,{...selected,expectedDeliveryFeeMinor:350});
  assert.equal(replay.r.status,201);
  assert.equal(replay.body.data.orderId,id);
  assert.equal(await db.orderPickupSnapshot.count(),1);
  await assert.rejects(()=>db.orderPickupSnapshot.update({where:{orderId:id},data:{name:"Forged"}}));
  await assert.rejects(()=>db.orderPickupSnapshot.delete({where:{orderId:id}}));
  assert.equal((await db.orderPickupSnapshot.findUniqueOrThrow({where:{orderId:id}})).name,"Kumasi Riverside Counter");
});

test("pickup centre explicitly set to zero rate is free, but blank rate retains zone fee", async () => {
  const pickup=await configurePickupRoute("FREE");
  const token=await native("customer-a@example.test");
  await db.logisticsNode.update({where:{id:pickup.id},data:{pickupFeeMinor:0}});
  const price=await post("/checkout/quote",{
    lines:[{variantId:"var-rice",quantity:"6"}],zoneId:"zone-required",
    destinationKind:"pickup_point",finalPickupNodeId:pickup.id,
  });
  assert.equal(price.r.status,200);
  assert.equal(price.body.data.deliveryFeeMinor,0);
  assert.equal(price.body.data.feeBasis,"centre_pickup");
  const free=await completeDelivery("free-price",token,{
    destinationKind:"pickup_point",finalPickupNodeId:pickup.id,
    addressId:undefined,guestAddress:undefined,paymentMethod:"mobile_money",
    expectedDeliveryFeeMinor:0,
  });
  assert.equal(free.r.status,201,JSON.stringify(free.body));
  const snapshot=await db.orderPickupSnapshot.findUniqueOrThrow({where:{orderId:free.body.data.orderId}});
  assert.equal(snapshot.feeMinor,0);
  assert.equal(snapshot.feeBasis,"centre_pickup");

  await db.logisticsNode.update({where:{id:pickup.id},data:{pickupFeeMinor:null}});
  const zone=(await (await fetch(base+"/api/v1/checkout/zones/zone-required/pickup-points")).json()).data;
  assert.equal(zone.points[0].feeMinor,1200);
  assert.equal(zone.points[0].feeBasis,"zone_delivery");
});

test("snapshot database guard rejects forged non-pickup orders and pickup fee overrides on non-pickup nodes", async () => {
  const token=await native("customer-a@example.test");
  const created=await completeDelivery("not-pickup",token);
  assert.equal(created.r.status,201);
  const ordinaryId=created.body.data.orderId as string;
  const original=await db.logisticsNode.findFirstOrThrow({where:{code:"VG_DIRECT_SOURCE"}});
  await assert.rejects(()=>db.logisticsNode.update({where:{id:original.id},data:{pickupFeeMinor:500}}));
  await assert.rejects(()=>db.orderPickupSnapshot.create({data:{
    orderId:ordinaryId,nodeId:original.id,name:"Forged",feeBasis:"centre_pickup",feeMinor:1200,
  }}));
  assert.equal(await db.orderPickupSnapshot.count(),0);
});
