import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { ShipmentCollectionService } from "../src/logistics/shipment-collection.service";
import { ShipmentCustomerTrackingService } from "../src/logistics/shipment-customer-tracking.service";
import { VerificationCodeService } from "../src/orders/verification-code.service";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let collection: ShipmentCollectionService;
let verification: VerificationCodeService;
let tracking: ShipmentCustomerTrackingService;
let base: string;
const env = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true", LOGISTICS_CUSTOMER_PICKUP_ENABLED: "true",
});
const proof = (code: string) => ({
  verificationCode: code,
  receiverName: "Ama Mensah",
  identityCheck: "recipient_photo_id_checked",
});
async function fixture(tag: string) {
  const source = await db.logisticsNode.create({
    data: { code: `COLL_SRC_${tag}`, name: "Collection source", publicName: "Collection source", kind: "fulfilment_center", active: true },
  });
  const terminal = await db.logisticsNode.create({
    data: { code: `COLL_END_${tag}`, name: "Pickup centre", publicName: "Kumasi collection point", kind: "pickup_point", active: true, customerVisible: true },
  });
  const lane = await db.logisticsLane.create({ data: {
    originNodeId: source.id, destinationNodeId: terminal.id, mode: "linehaul",
    typicalMinutes: 90, priority: 0, serviceDays: [], active: true,
  } });
  const workflow = await db.deliveryWorkflowTemplate.create({ data: { name: `Pickup receipt ${tag}`, description: "Verified pickup receipt fixture", active: true } });
  const version = await db.deliveryWorkflowVersion.create({ data: {
    templateId: workflow.id, versionNumber: 1, status: "draft", revision: 1,
    createdBy: "admin-commerce", publishedBy: "admin-commerce", publishedAt: new Date(),
    stages: { create: [
      { stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Order placed", adminLabel: "Order placed", customerVisible: true, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false },
      { stageKey: "collected", eventKind: "customer_collected", customerTitleTemplate: "Collected", adminLabel: "Collected", customerVisible: true, sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: false },
    ] },
  } });
  await db.deliveryWorkflowVersion.update({ where: { id: version.id }, data: { status: "published" } });
  const route = await db.deliveryRouteRule.create({ data: {
    name: `Pickup receipt route ${tag}`, originNodeId: source.id, deliveryZoneId: "zone-required",
    fulfilment: "delivery", destinationKind: "pickup_point", finalPickupNodeId: terminal.id,
    workflowVersionId: version.id, active: true, priority: 10, createdBy: "admin-commerce",
  } });
  const orderId = randomUUID();
  const code = verification.codeFor(orderId, 1);
  const handled = new Date(Date.now() - 5 * 60 * 1000);
  const order = await db.order.create({ data: {
    id: orderId, reference: `VG-COLL-${tag}`, customerUserId: "customer-a",
    customerName: "Ama Mensah", customerPhone: "+233241111111",
    fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "mobile_money",
    paymentStatus: "succeeded", fulfilmentStatus: "dispatched", deliveryStatus: "unassigned",
    subtotalMinor: 2500, deliveryFeeMinor: 1000, totalMinor: 3500,
    verificationKeyVersion: 1, verificationCodeHash: verification.digestFor(orderId, code, 1),
    stockConsumedAt: handled,
    fulfilmentRun: { create: { locationId: "loc_accra", confirmedAt: handled,
      packedAt: handled, handedOverAt: handled, handedOverBy: "admin-commerce",
      handoverKind: "dispatch" } },
  } });
  const shipment = await db.shipment.create({ data: {
    orderId, sequence: 1, workflowVersionId: version.id, routeRuleId: route.id,
    status: "ready_for_pickup", originNodeId: source.id, destinationKind: "pickup_point",
    finalPickupNodeId: terminal.id, currentNodeId: terminal.id, custody: "node_staff",
    activatedAt: handled, version: 2,
  } });
  const s1 = await db.shipmentStop.create({ data: {
    shipmentId: shipment.id, routeRevision: 1, position: 1, nodeId: source.id,
    nodeCode: source.code, nodePublicName: source.publicName, nodeKind: source.kind,
    nodeKindLabel: source.kindLabel, terminalRole: "transit",
  } });
  const s2 = await db.shipmentStop.create({ data: {
    shipmentId: shipment.id, routeRevision: 1, position: 2, nodeId: terminal.id,
    nodeCode: terminal.code, nodePublicName: terminal.publicName, nodeKind: terminal.kind,
    nodeKindLabel: terminal.kindLabel, terminalRole: "customer_pickup",
  } });
  await db.shipmentLeg.create({ data: {
    shipmentId: shipment.id, routeRevision: 1, position: 1,
    originStopId: s1.id, destinationStopId: s2.id, laneId: lane.id, mode: lane.mode,
    typicalMinutes: lane.typicalMinutes, status: "arrived",
    departedAt: new Date(handled.getTime() + 30000), arrivedAt: new Date(handled.getTime() + 60000),
  } });
  return { source, terminal, order, shipment, code };
}

async function auth(email: string) {
  const r = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email, password: commerceTestPassword, client: "native" }),
  });
  const json = await r.json();
  assert.equal(r.status, 201, JSON.stringify(json));
  return json.data.accessToken as string;
}
async function post(path: string, token: string, body: unknown, key: string) {
  const r = await fetch(base + "/api/v1" + path, {
    method: "POST", headers: {
      authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw new Error("Collection tests require a dedicated isolated PostgreSQL database.");
  app = await createApplication(env());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  collection = app.get(ShipmentCollectionService);
  verification = app.get(VerificationCodeService);
  tracking = app.get(ShipmentCustomerTrackingService);
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => { await app?.close(); });

test("paid, handed-over pickup is collected once with immutable receipt, ledger, and correct customer timeline", async () => {
  const x = await fixture("SUCCESS");
  const beforeStock = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();
  const token = await auth("admin-commerce@example.test");
  const first = await post(`/admin/logistics/shipments/${x.shipment.id}/collect`, token, proof(x.code), "collect-success");
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const result = first.data.data;
  assert.equal(result.shipmentId, x.shipment.id);
  assert.equal(result.nodeId, x.terminal.id);
  assert.equal(result.status, "completed");
  const after = await db.shipment.findUniqueOrThrow({ where: { id: x.shipment.id } });
  assert.equal(after.status, "completed");
  assert.equal(after.custody, "customer");
  assert.equal(after.currentNodeId, null);
  assert.ok(after.completedAt);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: x.order.id } })).fulfilmentStatus, "collected");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: x.order.id } })).deliveryStatus, "unassigned");
  const receipt = await db.shipmentCollectionReceipt.findUniqueOrThrow({ where: { shipmentId: x.shipment.id } });
  assert.equal(receipt.id, result.receiptId);
  assert.equal(receipt.receiverName, "Ama Mensah");
  assert.equal(receipt.identityCheck, "recipient_photo_id_checked");
  const event = await db.shipmentEvent.findUniqueOrThrow({ where: { id: receipt.eventId } });
  assert.equal(event.eventKind, "customer_collected");
  assert.equal(event.toCustody, "customer");
  assert.equal(event.nodeId, x.terminal.id);
  assert.equal((await tracking.project(x.order.id))?.state, "collected");
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: x.shipment.id, type: "logistics.shipment.customer_collected" } }), 1);
  assert.equal(await db.orderEvent.count({ where: { orderId: x.order.id, action: "logistics.customer_collected" } }), 1);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), beforeStock);
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: x.order.id } }), 0);
  assert.equal(await db.deliveryJob.count({ where: { orderId: x.order.id } }), 0);
  assert.ok(!JSON.stringify(result).includes(x.code));
  assert.ok(!JSON.stringify(result).includes("Ama Mensah"));
  const audit = await db.auditEvent.findFirstOrThrow({where:{entityId:x.shipment.id,action:"logistics.shipment.customer_collected"}});
  const outbox = await db.outboxEvent.findFirstOrThrow({where:{aggregateId:x.shipment.id,type:"logistics.shipment.customer_collected"}});
  const replayProof = await db.idempotency.findUniqueOrThrow({where:{
    actorId_operation_key:{actorId:"admin-commerce",operation:`logistics.shipment.collect:${x.shipment.id}`,key:"collect-success"},
  }});
  assert.ok(!JSON.stringify({audit:audit.details,outbox:outbox.payload,replay:replayProof.outcome}).includes(x.code));
  assert.ok(!JSON.stringify(audit.details).includes("Ama Mensah"));
  assert.ok(!JSON.stringify(event.safeMetadata).includes("Ama"));
  const replay = await post(`/admin/logistics/shipments/${x.shipment.id}/collect`, token, proof(x.code), "collect-success");
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.data.data, result);
  assert.equal(await db.shipmentCollectionReceipt.count({ where: { shipmentId: x.shipment.id } }), 1);
  const secondKey = await post(`/admin/logistics/shipments/${x.shipment.id}/collect`, token, proof(x.code), "collect-second-key");
  assert.equal(secondKey.status, 422);
  const changed = await post(`/admin/logistics/shipments/${x.shipment.id}/collect`, token, { ...proof(x.code), receiverName: "Changed name" }, "collect-success");
  assert.equal(changed.status, 409);
  await assert.rejects(() => db.shipmentCollectionReceipt.update({ where: { id: receipt.id }, data: { receiverName: "Changed" } }));
  await assert.rejects(() => db.shipmentCollectionReceipt.delete({ where: { id: receipt.id } }));
});

test("a customer cannot act as collection staff and wrong order code creates no receipt", async () => {
  const x = await fixture("FORBIDDEN");
  const customer = await auth("customer-a@example.test");
  const denied = await post(`/admin/logistics/shipments/${x.shipment.id}/collect`, customer, proof(x.code), "customer-attempt");
  assert.equal(denied.status, 403);
  const admin = await auth("admin-commerce@example.test");
  const bad = await post(`/admin/logistics/shipments/${x.shipment.id}/collect`, admin, proof("0000000000"), "wrong-code");
  assert.equal(bad.status, 422);
  assert.equal(bad.data.error.code, "PICKUP_VERIFICATION_FAILED");
  assert.equal(await db.shipmentCollectionReceipt.count(), 0);
  assert.equal((await db.shipment.findUniqueOrThrow({ where: { id: x.shipment.id } })).status, "ready_for_pickup");
});

test("unpaid, cash, wrong pickup node and missing handover cannot close shipment", async () => {
  for (const [tag, change] of [
    ["UNPAID", async (x: Awaited<ReturnType<typeof fixture>>) => db.order.update({ where: { id: x.order.id }, data: { paymentStatus: "pending" } })],
    ["CASH", async (x: Awaited<ReturnType<typeof fixture>>) => db.order.update({ where: { id: x.order.id }, data: { paymentMethod: "cash_on_delivery", paymentStatus: "unpaid" } })],
    ["NODE", async (x: Awaited<ReturnType<typeof fixture>>) => db.shipment.update({ where: { id: x.shipment.id }, data: { currentNodeId: x.source.id } })],
    ["HANDOVER", async (x: Awaited<ReturnType<typeof fixture>>) => db.order.update({ where: { id: x.order.id }, data: { stockConsumedAt: null } })],
  ] as const) {
    const x = await fixture(tag);
    await change(x);
    await assert.rejects(() => collection.collect(x.shipment.id, "admin-commerce", `block-${tag}`, proof(x.code), `req-block-${tag}`),
      (error: any) => error?.getStatus?.() === 422);
    assert.equal(await db.shipmentCollectionReceipt.count({ where: { shipmentId: x.shipment.id } }), 0);
    assert.equal((await db.shipment.findUniqueOrThrow({ where: { id: x.shipment.id } })).status, "ready_for_pickup");
  }
});

test("concurrent collections cannot both commit different receipts", async () => {
  const x = await fixture("RACE");
  const results = await Promise.allSettled([
    collection.collect(x.shipment.id, "admin-commerce", "race-first", proof(x.code), "req-race-1"),
    collection.collect(x.shipment.id, "admin-commerce", "race-second", proof(x.code), "req-race-2"),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.shipmentCollectionReceipt.count({ where: { shipmentId: x.shipment.id } }), 1);
  assert.equal(await db.shipmentEvent.count({ where: { shipmentId: x.shipment.id, eventKind: "customer_collected" } }), 1);
});

test("the remote pickup feature gate refuses collection even with a valid, ready paid shipment", async () => {
  const x = await fixture("FLAG");
  const closed = new ShipmentCollectionService(db, { ...env(), customerPickupEnabled: false }, verification);
  await assert.rejects(() => closed.collect(x.shipment.id, "admin-commerce", "gate-closed", proof(x.code), "req-closed"),
    (error: any) => error?.getStatus?.() === 503);
  assert.equal(await db.shipmentCollectionReceipt.count(), 0);
  assert.equal((await db.shipment.findUniqueOrThrow({where:{id:x.shipment.id}})).status,"ready_for_pickup");
});

test("direct writes cannot forge a receipt without completed shipment, verified payment and matching event", async () => {
  const x = await fixture("BYPASS");
  const at = new Date();
  const receiptId = randomUUID(), eventId = randomUUID();
  await assert.rejects(() => db.shipmentEvent.create({ data: {
    id: eventId, shipmentId:x.shipment.id, routeRevision:1, nodeId:x.terminal.id,
    eventKind:"customer_collected", actorKind:"staff", actorId:"admin-commerce",
    fromCustody:"node_staff",toCustody:"customer",safeMetadata:{receiptId},requestId:"bypass-test",occurredAt:at,
  } }));
  await assert.rejects(() => db.shipmentCollectionReceipt.create({data:{
    id:receiptId,shipmentId:x.shipment.id,orderId:x.order.id,nodeId:x.terminal.id,eventId,
    staffActorId:"admin-commerce",receiverName:"Ama Mensah",identityCheck:"recipient_photo_id_checked",
    verificationKeyVersion:1,collectedAt:at,
  } }));
  assert.equal(await db.shipmentCollectionReceipt.count(),0);
});
