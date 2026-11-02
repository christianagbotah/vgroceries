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
const tag = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
let orderId = "";
let workflowVersionId = "";
let routeRuleId = "";
let sourceId = "";
let hubId = "";
let otherId = "";
let sourceHubLaneId = "";
let sourceOtherLaneId = "";

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

function models() {
  const c = db as Database & Record<string, any>;
  for (const name of ["shipment", "shipmentStop", "shipmentLeg", "shipmentEvent"])
    assert.ok(c[name], `${name} Prisma model is missing`);
  return c;
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Shipment schema tests require an isolated *variety_foundation_test database");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  const c = db as Database & Record<string, any>;
  const source = await c.logisticsNode.create({ data: { code: `SHIP_SRC_${tag}`, name: "Shipment source", publicName: "Shipment source", kind: "fulfilment_center", active: true } });
  const hub = await c.logisticsNode.create({ data: { code: `SHIP_HUB_${tag}`, name: "Shipment hub", publicName: "Shipment hub", kind: "hub", active: true } });
  const other = await c.logisticsNode.create({ data: { code: `SHIP_OTHER_${tag}`, name: "Other hub", publicName: "Other hub", kind: "hub", active: true } });
  sourceId = source.id; hubId = hub.id; otherId = other.id;
  sourceHubLaneId = (await c.logisticsLane.create({ data: { originNodeId: source.id, destinationNodeId: hub.id, mode: "linehaul", typicalMinutes: 120, serviceDays: [], priority: 0, active: true } })).id;
  sourceOtherLaneId = (await c.logisticsLane.create({ data: { originNodeId: source.id, destinationNodeId: other.id, mode: "linehaul", typicalMinutes: 60, serviceDays: [], priority: 0, active: true } })).id;
  const template = await c.deliveryWorkflowTemplate.create({ data: { name: `Shipment workflow ${tag}`, description: "", active: true } });
  const version = await c.deliveryWorkflowVersion.create({ data: { templateId: template.id, versionNumber: 1, status: "published", revision: 1, createdBy: "admin-schema", publishedBy: "admin-schema", publishedAt: new Date() } });
  workflowVersionId = version.id;
  const rule = await c.deliveryRouteRule.create({ data: {
    name: `Shipment route ${tag}`, originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "doorstep", workflowVersionId: version.id, priority: 0, active: true, createdBy: "admin-schema",
  } });
  routeRuleId = rule.id;
  const order = await db.order.create({ data: {
    reference: `VG-SHIP-SCHEMA-${tag}`, customerUserId: "customer-a", customerName: "Ama Customer",
    customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required",
    paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned",
    subtotalMinor: 1990, deliveryFeeMinor: 1200, totalMinor: 3190, verificationKeyVersion: 1, verificationCodeHash: "e".repeat(64),
  } });
  orderId = order.id;
});

after(async () => { await app?.close(); });

function shipmentData() {
  return {
    orderId, sequence: 1, workflowVersionId, routeRuleId, routeRevision: 1, status: "planned",
    originNodeId: sourceId, destinationKind: "doorstep", destinationAddress: {
      recipientName: "Ama Customer", locality: "Osu", street: "Oxford Street", landmark: "Near the junction", ghanaPostGps: "GA-123-4567",
    }, version: 1,
  };
}

test("shipment schema enforces one positive sequence per order and valid execution vocabularies", async () => {
  const c = models();
  const shipment = await c.shipment.create({ data: shipmentData() });
  assert.equal(shipment.sequence, 1);
  assert.equal(shipment.routeRevision, 1);
  await assert.rejects(() => c.shipment.create({ data: { ...shipmentData() } }));
  await assert.rejects(() => c.shipment.create({ data: { ...shipmentData(), orderId: orderId, sequence: 0 } }));
  await assert.rejects(() => c.shipment.update({ where: { id: shipment.id }, data: { routeRevision: 0 } }));
  await assert.rejects(() => c.shipment.update({ where: { id: shipment.id }, data: { status: "invented" } }));
  await assert.rejects(() => c.shipment.update({ where: { id: shipment.id }, data: { custody: "invented" } }));
});

test("shipment stops and legs require positive adjacent snapshots and ordered timestamps", async () => {
  const c = models();
  const shipment = await c.shipment.findFirstOrThrow({ where: { orderId, sequence: 1 } });
  await assert.rejects(() => c.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 0, position: 1, nodeId: sourceId, nodeCode: "SRC", nodePublicName: "Source", nodeKind: "fulfilment_center", terminalRole: "transit" } }));
  await assert.rejects(() => c.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 0, nodeId: sourceId, nodeCode: "SRC", nodePublicName: "Source", nodeKind: "fulfilment_center", terminalRole: "transit" } }));
  const one = await c.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 1, nodeId: sourceId, nodeCode: `SHIP_SRC_${tag}`, nodePublicName: "Shipment source", nodeKind: "fulfilment_center", terminalRole: "transit" } });
  const two = await c.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 2, nodeId: hubId, nodeCode: `SHIP_HUB_${tag}`, nodePublicName: "Shipment hub", nodeKind: "hub", terminalRole: "final_mile_dispatch" } });
  const three = await c.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 3, nodeId: otherId, nodeCode: `SHIP_OTHER_${tag}`, nodePublicName: "Other hub", nodeKind: "hub", terminalRole: "transit" } });
  await assert.rejects(() => c.shipmentStop.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 2, nodeId: otherId, nodeCode: "DUP", nodePublicName: "Duplicate", nodeKind: "hub", terminalRole: "transit" } }));
  await assert.rejects(() => c.shipmentLeg.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 0, originStopId: one.id, destinationStopId: two.id, laneId: sourceHubLaneId, mode: "linehaul", typicalMinutes: 120, status: "planned", version: 1 } }));
  await assert.rejects(() => c.shipmentLeg.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 1, originStopId: one.id, destinationStopId: three.id, laneId: sourceOtherLaneId, mode: "linehaul", typicalMinutes: 60, status: "planned", version: 1 } }));
  const leg = await c.shipmentLeg.create({ data: { shipmentId: shipment.id, routeRevision: 1, position: 1, originStopId: one.id, destinationStopId: two.id, laneId: sourceHubLaneId, mode: "linehaul", typicalMinutes: 120, status: "ready", version: 1 } });
  await assert.rejects(() => c.shipmentLeg.update({ where: { id: leg.id }, data: { departedAt: new Date("2026-10-30T20:00:00Z"), arrivedAt: new Date("2026-10-30T19:00:00Z") } }));
});

test("shipment route snapshots are immutable while execution fields remain mutable", async () => {
  const c = models();
  const shipment = await c.shipment.findFirstOrThrow({ where: { orderId, sequence: 1 } });
  const stop = await c.shipmentStop.findFirstOrThrow({ where: { shipmentId: shipment.id, position: 1 } });
  const leg = await c.shipmentLeg.findFirstOrThrow({ where: { shipmentId: shipment.id, position: 1 } });
  await assert.rejects(() => c.shipmentStop.update({ where: { id: stop.id }, data: { nodePublicName: "Rewritten history" } }));
  await assert.rejects(() => c.shipmentLeg.update({ where: { id: leg.id }, data: { mode: "third_party" } }));
  const departedAt = new Date("2026-10-30T20:00:00Z");
  const moved = await c.shipmentLeg.update({ where: { id: leg.id }, data: { status: "in_transit", departedAt, version: { increment: 1 } } });
  assert.equal(moved.status, "in_transit");
  assert.equal(moved.version, 2);
});

test("shipment events are append-only evidence", async () => {
  const c = models();
  const shipment = await c.shipment.findFirstOrThrow({ where: { orderId, sequence: 1 } });
  const event = await c.shipmentEvent.create({ data: {
    shipmentId: shipment.id, routeRevision: 1, eventKind: "fulfilment_handed_over", nodeId: sourceId,
    actorKind: "staff", actorId: "admin-schema", toCustody: "source_staff", customerTitle: "Handed over",
    safeMetadata: {}, requestId: `req-ship-${tag}`, occurredAt: new Date("2026-10-30T20:00:00Z"),
  } });
  await assert.rejects(() => c.shipmentEvent.update({ where: { id: event.id }, data: { customerTitle: "Rewritten" } }));
  await assert.rejects(() => c.shipmentEvent.delete({ where: { id: event.id } }));
});
