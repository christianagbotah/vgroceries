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
const runTag = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true",
});

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) {
    throw Error("Shipment schema tests require an isolated *variety_foundation_test database");
  }
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
});
after(async () => { await app?.close(); });

function models() {
  const c = db as Database & Record<string, any>;
  for (const name of ["shipment", "shipmentStop", "shipmentLeg", "shipmentEvent"]) {
    assert.ok(c[name], `${name} Prisma model is missing`);
  }
  return c;
}

async function node(c: any, key: string, kind = "hub") {
  return c.logisticsNode.create({ data: {
    code: `${key}_${runTag}`, name: `${key} ${runTag}`, publicName: key, kind,
    customerVisible: true, active: true,
  } });
}

async function publishedWorkflow(c: any, key: string) {
  const template = await c.deliveryWorkflowTemplate.create({ data: {
    name: `Shipment ${key} ${runTag}`, description: "", active: true,
  } });
  const version = await c.deliveryWorkflowVersion.create({ data: {
    templateId: template.id, versionNumber: 1, status: "draft", revision: 1, createdBy: "admin-shipment-schema",
  } });
  await c.workflowStageDefinition.create({ data: {
    workflowVersionId: version.id, stageKey: "handover", eventKind: "fulfilment_handed_over",
    customerTitleTemplate: "Handed over", adminLabel: "Handed over", customerVisible: true,
    showPlannedWhenPending: true, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false,
  } });
  await c.deliveryWorkflowVersion.update({ where: { id: version.id }, data: {
    status: "published", publishedBy: "admin-shipment-schema", publishedAt: new Date(),
  } });
  await c.deliveryWorkflowTemplate.update({ where: { id: template.id }, data: { currentPublishedVersionId: version.id } });
  return version;
}

async function order(c: any, key: string, logisticsExecutionRequired = true) {
  return c.order.create({ data: {
    reference: `VG-SHIP-${key}-${runTag}`, customerUserId: "customer-a", customerName: "Ama Customer",
    customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required",
    paymentMethod: "card_hosted", paymentStatus: "succeeded", fulfilmentStatus: "confirmed", deliveryStatus: "unassigned",
    subtotalMinor: 1990, deliveryFeeMinor: 1200, totalMinor: 3190, verificationKeyVersion: 1,
    verificationCodeHash: randomUUID().replace(/-/g, "").padEnd(64, "a").slice(0, 64), logisticsExecutionRequired,
  } });
}

async function shipmentContext(key: string) {
  const c = models();
  const origin = await node(c, `${key}_ORIGIN`, "fulfilment_center");
  const terminal = await node(c, `${key}_TERMINAL`, "hub");
  const extra = await node(c, `${key}_EXTRA`, "hub");
  const workflow = await publishedWorkflow(c, key);
  const orderRow = await order(c, key);
  const lane = await c.logisticsLane.create({ data: {
    originNodeId: origin.id, destinationNodeId: terminal.id, mode: "linehaul", typicalMinutes: 45,
    serviceDays: [1,2,3,4,5,6,7], priority: 0, active: true,
  } });
  const shipment = await c.shipment.create({ data: {
    orderId: orderRow.id, sequence: 1, workflowVersionId: workflow.id, status: "planned",
    originNodeId: origin.id, destinationKind: "doorstep", currentRouteRevision: 1,
    custodyState: null, version: 1,
  } });
  return { c, origin, terminal, extra, workflow, orderRow, lane, shipment };
}

async function stop(c: any, shipmentId: string, nodeRow: any, position: number, terminalRole: string, routeRevision = 1) {
  return c.shipmentStop.create({ data: {
    shipmentId, routeRevision, position, nodeId: nodeRow.id, nodeCode: nodeRow.code,
    nodePublicName: nodeRow.publicName, nodeKind: nodeRow.kind, kindLabel: nodeRow.kindLabel,
    terminalRole,
  } });
}

test("shipment root and route rows reject non-positive and duplicate sequence/positions", async () => {
  const { c, origin, terminal, workflow, orderRow, lane, shipment } = await shipmentContext("IDENTITY");

  await assert.rejects(() => c.shipment.create({ data: {
    orderId: orderRow.id, sequence: 0, workflowVersionId: workflow.id, status: "planned",
    originNodeId: origin.id, destinationKind: "doorstep", currentRouteRevision: 1,
    custodyState: null, version: 1,
  } }));
  await assert.rejects(() => c.shipment.create({ data: {
    orderId: orderRow.id, sequence: 1, workflowVersionId: workflow.id, status: "planned",
    originNodeId: origin.id, destinationKind: "doorstep", currentRouteRevision: 1,
    custodyState: null, version: 1,
  } }));

  await assert.rejects(() => stop(c, shipment.id, origin, 0, "transit"));
  const one = await stop(c, shipment.id, origin, 1, "transit");
  await assert.rejects(() => stop(c, shipment.id, terminal, 1, "final_mile_dispatch"));
  const two = await stop(c, shipment.id, terminal, 2, "final_mile_dispatch");

  await assert.rejects(() => c.shipmentLeg.create({ data: {
    shipmentId: shipment.id, routeRevision: 1, position: 0, originStopId: one.id, destinationStopId: two.id,
    laneId: lane.id, laneMode: lane.mode, providerKey: lane.providerKey, typicalMinutes: lane.typicalMinutes,
    status: "planned", version: 1,
  } }));
  await c.shipmentLeg.create({ data: {
    shipmentId: shipment.id, routeRevision: 1, position: 1, originStopId: one.id, destinationStopId: two.id,
    laneId: lane.id, laneMode: lane.mode, providerKey: lane.providerKey, typicalMinutes: lane.typicalMinutes,
    status: "planned", version: 1,
  } });
  await assert.rejects(() => c.shipmentLeg.create({ data: {
    shipmentId: shipment.id, routeRevision: 1, position: 1, originStopId: one.id, destinationStopId: two.id,
    laneId: lane.id, laneMode: lane.mode, providerKey: lane.providerKey, typicalMinutes: lane.typicalMinutes,
    status: "planned", version: 1,
  } }));
});

test("shipment legs must connect adjacent stops in the same shipment and revision", async () => {
  const a = await shipmentContext("ADJ_A");
  const b = await shipmentContext("ADJ_B");
  const one = await stop(a.c, a.shipment.id, a.origin, 1, "transit");
  const two = await stop(a.c, a.shipment.id, a.terminal, 2, "final_mile_dispatch");
  const three = await stop(a.c, a.shipment.id, a.extra, 3, "transit");
  const other = await stop(b.c, b.shipment.id, b.origin, 1, "transit");

  await assert.rejects(() => a.c.shipmentLeg.create({ data: {
    shipmentId: a.shipment.id, routeRevision: 1, position: 1, originStopId: one.id, destinationStopId: three.id,
    laneId: a.lane.id, laneMode: a.lane.mode, typicalMinutes: a.lane.typicalMinutes, status: "planned", version: 1,
  } }));
  await assert.rejects(() => a.c.shipmentLeg.create({ data: {
    shipmentId: a.shipment.id, routeRevision: 1, position: 1, originStopId: one.id, destinationStopId: other.id,
    laneId: a.lane.id, laneMode: a.lane.mode, typicalMinutes: a.lane.typicalMinutes, status: "planned", version: 1,
  } }));

  const valid = await a.c.shipmentLeg.create({ data: {
    shipmentId: a.shipment.id, routeRevision: 1, position: 1, originStopId: one.id, destinationStopId: two.id,
    laneId: a.lane.id, laneMode: a.lane.mode, typicalMinutes: a.lane.typicalMinutes, status: "planned", version: 1,
  } });
  await assert.rejects(() => a.c.shipmentLeg.update({ where: { id: valid.id }, data: { destinationStopId: three.id } }));
});

test("shipment timestamps and current location cannot contradict physical movement", async () => {
  const ctx = await shipmentContext("LOCATION");
  const one = await stop(ctx.c, ctx.shipment.id, ctx.origin, 1, "transit");
  const two = await stop(ctx.c, ctx.shipment.id, ctx.terminal, 2, "final_mile_dispatch");
  const departedAt = new Date("2026-10-22T11:00:00Z");
  const arrivedAt = new Date("2026-10-22T10:59:59Z");
  await assert.rejects(() => ctx.c.shipmentLeg.create({ data: {
    shipmentId: ctx.shipment.id, routeRevision: 1, position: 1, originStopId: one.id, destinationStopId: two.id,
    laneId: ctx.lane.id, laneMode: ctx.lane.mode, typicalMinutes: ctx.lane.typicalMinutes,
    status: "arrived", departedAt, arrivedAt, version: 1,
  } }));
  const leg = await ctx.c.shipmentLeg.create({ data: {
    shipmentId: ctx.shipment.id, routeRevision: 1, position: 1, originStopId: one.id, destinationStopId: two.id,
    laneId: ctx.lane.id, laneMode: ctx.lane.mode, typicalMinutes: ctx.lane.typicalMinutes,
    status: "planned", version: 1,
  } });
  await assert.rejects(() => ctx.c.shipment.update({ where: { id: ctx.shipment.id }, data: {
    status: "in_transit", currentNodeId: ctx.origin.id, currentLegId: leg.id,
  } }));

  const other = await shipmentContext("LOCATION_OTHER");
  const otherOne = await stop(other.c, other.shipment.id, other.origin, 1, "transit");
  const otherTwo = await stop(other.c, other.shipment.id, other.terminal, 2, "final_mile_dispatch");
  const otherLeg = await other.c.shipmentLeg.create({ data: {
    shipmentId: other.shipment.id, routeRevision: 1, position: 1, originStopId: otherOne.id, destinationStopId: otherTwo.id,
    laneId: other.lane.id, laneMode: other.lane.mode, typicalMinutes: other.lane.typicalMinutes,
    status: "planned", version: 1,
  } });
  await assert.rejects(() => ctx.c.shipment.update({ where: { id: ctx.shipment.id }, data: {
    status: "in_transit", currentNodeId: null, currentLegId: otherLeg.id,
  } }));
});

test("route snapshot identity and shipment event history are immutable", async () => {
  const ctx = await shipmentContext("IMMUTABLE");
  const one = await stop(ctx.c, ctx.shipment.id, ctx.origin, 1, "transit");
  const two = await stop(ctx.c, ctx.shipment.id, ctx.terminal, 2, "final_mile_dispatch");
  const leg = await ctx.c.shipmentLeg.create({ data: {
    shipmentId: ctx.shipment.id, routeRevision: 1, position: 1, originStopId: one.id, destinationStopId: two.id,
    laneId: ctx.lane.id, laneMode: ctx.lane.mode, typicalMinutes: ctx.lane.typicalMinutes,
    status: "planned", version: 1,
  } });
  await assert.rejects(() => ctx.c.shipmentStop.update({ where: { id: one.id }, data: { nodePublicName: "Rewritten" } }));
  await assert.rejects(() => ctx.c.shipmentStop.delete({ where: { id: one.id } }));
  await assert.rejects(() => ctx.c.shipmentLeg.update({ where: { id: leg.id }, data: { laneId: ctx.lane.id, routeRevision: 2 } }));

  const event = await ctx.c.shipmentEvent.create({ data: {
    shipmentId: ctx.shipment.id, legId: leg.id, nodeId: ctx.origin.id, routeRevision: 1,
    eventKind: "fulfilment_handed_over", actorKind: "staff", actorId: "admin-shipment-schema",
    priorCustody: null, newCustody: "source_staff", safeMetadata: {}, requestId: `req-${runTag}-immutable`,
    occurredAt: new Date(),
  } });
  await assert.rejects(() => ctx.c.shipmentEvent.update({ where: { id: event.id }, data: { eventKind: "shipment_departed" } }));
  await assert.rejects(() => ctx.c.shipmentEvent.delete({ where: { id: event.id } }));
});

async function dispatchReadyOrder(c: any, key: string, logisticsExecutionRequired: boolean) {
  const row = await order(c, key, logisticsExecutionRequired);
  const at = new Date();
  await c.order.update({ where: { id: row.id }, data: {
    fulfilmentStatus: "dispatched", stockConsumedAt: at,
  } });
  await c.fulfilmentRun.create({ data: {
    orderId: row.id, locationId: "loc_accra", handedOverBy: "admin-shipment-schema", handedOverAt: at, handoverKind: "dispatch",
  } });
  return { row, at };
}

test("DeliveryJob preserves legacy handover compatibility but new routed orders require final-mile Shipment readiness", async () => {
  const c = models();
  const legacy = await dispatchReadyOrder(c, "LEGACY", false);
  const legacyJob = await c.deliveryJob.create({ data: {
    orderId: legacy.row.id, assignmentKind: "manual_provider", providerKey: "manual-test",
    status: "assigned", custodyState: "dispatch", assignedBy: "admin-shipment-schema", assignedAt: new Date(legacy.at.getTime() + 1000),
  } });
  assert.equal(legacyJob.orderId, legacy.row.id);

  const required = await dispatchReadyOrder(c, "REQUIRED", true);
  await assert.rejects(() => c.deliveryJob.create({ data: {
    orderId: required.row.id, assignmentKind: "manual_provider", providerKey: "manual-test",
    status: "assigned", custodyState: "dispatch", assignedBy: "admin-shipment-schema", assignedAt: new Date(required.at.getTime() + 1000),
  } }));

  const origin = await node(c, "DISPATCH_ORIGIN", "fulfilment_center");
  const terminal = await node(c, "DISPATCH_TERMINAL", "hub");
  const workflow = await publishedWorkflow(c, "DISPATCH");
  const shipment = await c.shipment.create({ data: {
    orderId: required.row.id, sequence: 1, workflowVersionId: workflow.id, status: "planned",
    originNodeId: origin.id, destinationKind: "doorstep", currentRouteRevision: 1,
    custodyState: null, version: 1,
  } });
  await stop(c, shipment.id, origin, 1, "transit");
  await stop(c, shipment.id, terminal, 2, "final_mile_dispatch");
  const readyAt = new Date(required.at.getTime() + 500);
  await c.shipment.update({ where: { id: shipment.id }, data: {
    status: "final_mile_ready", currentNodeId: terminal.id, currentLegId: null,
    custodyState: "node_staff", activatedAt: required.at, finalMileReadyAt: readyAt,
  } });
  const job = await c.deliveryJob.create({ data: {
    orderId: required.row.id, assignmentKind: "manual_provider", providerKey: "manual-test",
    status: "assigned", custodyState: "dispatch", assignedBy: "admin-shipment-schema", assignedAt: new Date(readyAt.getTime() + 1000),
  } });
  assert.equal(job.orderId, required.row.id);
});
