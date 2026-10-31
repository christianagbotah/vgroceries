import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { FulfilmentCommandService } from "../src/fulfilment/fulfilment-command.service";
import { LogisticsBootstrapService } from "../src/logistics/logistics-bootstrap.service";
import { LogisticsRouteRuleService } from "../src/logistics/logistics-route-rule.service";
import { LogisticsWorkflowService } from "../src/logistics/logistics-workflow.service";
import { ShipmentPlanningService } from "../src/logistics/shipment-planning.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let command: FulfilmentCommandService;
let bootstrap: LogisticsBootstrapService;
let routes: LogisticsRouteRuleService;
let workflows: LogisticsWorkflowService;
let planning: ShipmentPlanningService;

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  LOGISTICS_SHIPMENT_EXECUTION_ENABLED: "true",
});
const ctx = (key: string) => ({ actorId: "admin-commerce", requestId: `req-${key}`, idempotencyKey: key });
const future = () => new Date(Date.now() + 60 * 60 * 1000);

async function createOrder(id: string) {
  const order = await db.order.create({ data: {
    id, reference: `VG-SHIP-ACT-${id}`, customerUserId: "customer-a", customerName: "Ama Customer",
    customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required",
    paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned",
    subtotalMinor: 1000, deliveryFeeMinor: 1200, totalMinor: 2200, verificationKeyVersion: 1, verificationCodeHash: "b".repeat(64),
    lines: { create: { id: `${id}-line-rice`, variantId: "var-rice", productId: "product-rice", productName: "Fixture Rice", variantName: "Weighted rice", unit: "kg", quantity: "2", unitPriceMinor: 500, lineTotalMinor: 1000 } },
  } });
  await db.orderDeliveryAddress.create({ data: { orderId: order.id, label: "Home", recipientName: "Ama Customer", phone: "+233241111111", locality: "Labone", street: "A Street", ghanaPostGps: "GA-123-4567" } });
  const reservation = await db.reservation.create({ data: {
    id: `${id}-reservation-rice`, positionId: "pos-rice", lotId: "lot-rice", claimType: "order", claimId: order.id,
    claimLineId: `${id}-line-rice`, generation: 1, quantity: "2", state: "active", expiresAt: future(),
  } });
  return { order, reservation };
}

async function reachPacked(id: string) {
  const fixture = await createOrder(id);
  await command.confirm(id, ctx(`${id}-confirm`));
  await command.startPicking(id, ctx(`${id}-start`));
  await command.recordPick(id, fixture.reservation.id, { pickedQuantity: "2", note: "verified" }, ctx(`${id}-pick`));
  await command.pack(id, { note: "sealed" }, ctx(`${id}-pack`));
  return fixture;
}

async function planDoorstep(orderId: string, key: string) {
  return planning.planLegacy(orderId, "admin-commerce", `plan-${key}`, { destinationKind: "doorstep" }, `req-plan-${key}`);
}

async function publishedPickupWorkflow(key: string) {
  const template = await workflows.createTemplate("admin-commerce", `pickup-create-${key}`, { name: `Pickup ${key}`, active: true }, `req-pickup-create-${key}`);
  const draft = template.versions[0]!;
  const saved = await workflows.saveDraft(template.id, draft.id, "admin-commerce", `pickup-save-${key}`, { expectedRevision: 1, stages: [
    { stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Order placed", adminLabel: "Placed", customerVisible: true, showPlannedWhenPending: false, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false },
    { stageKey: "collected", eventKind: "customer_collected", customerTitleTemplate: "Collected", adminLabel: "Collected", customerVisible: true, showPlannedWhenPending: true, sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: false },
  ] as any }, `req-pickup-save-${key}`);
  const published = await workflows.publish(template.id, "admin-commerce", `pickup-publish-${key}`, { versionId: draft.id, expectedRevision: saved.revision }, `req-pickup-publish-${key}`);
  return published.versions.find((row) => row.id === draft.id)!;
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  db = app.get(Database);
  command = app.get(FulfilmentCommandService);
  bootstrap = app.get(LogisticsBootstrapService);
  routes = app.get(LogisticsRouteRuleService);
  workflows = app.get(LogisticsWorkflowService);
  planning = app.get(ShipmentPlanningService);
});
beforeEach(async () => { await seedCommerceFixtures(db); await bootstrap.ensureDirectDefaults("admin-commerce", "req-activation-defaults"); });
after(async () => { await app?.close(); });

test("direct one-stop shipment becomes final-mile-ready at source custody with one handover event", async () => {
  const fixture = await reachPacked("activate-direct");
  await planDoorstep(fixture.order.id, "direct");
  const source = await db.logisticsNode.findUniqueOrThrow({ where: { code: "VG_DIRECT_SOURCE" } });

  await command.handover(fixture.order.id, { note: "driver received" }, ctx("activate-direct-handover"));

  const shipment = await db.shipment.findFirstOrThrow({ where: { orderId: fixture.order.id }, include: { legs: true, events: true } });
  assert.equal(shipment.status, "final_mile_ready");
  assert.equal(shipment.currentNodeId, source.id);
  assert.equal(shipment.currentLegId, null);
  assert.equal(shipment.custody, "source_staff");
  assert.ok(shipment.activatedAt);
  assert.equal(shipment.legs.length, 0);
  assert.equal(shipment.events.length, 1);
  assert.equal(shipment.events[0]?.eventKind, "fulfilment_handed_over");
  assert.equal(shipment.events[0]?.nodeId, source.id);
  assert.equal(shipment.events[0]?.toCustody, "source_staff");
});

test("multi-hop shipment activates at source with first leg ready", async () => {
  const direct = await db.deliveryRouteRule.findFirstOrThrow({ where: { name: "VG Direct doorstep · zone-required" } });
  await db.deliveryRouteRule.update({ where: { id: direct.id }, data: { active: false } });
  const source = await db.logisticsNode.findUniqueOrThrow({ where: { code: "VG_DIRECT_SOURCE" } });
  const hub = await db.logisticsNode.create({ data: { code: "ACT_HUB", name: "Activation hub", publicName: "Activation hub", kind: "hub", active: true } });
  const lane = await db.logisticsLane.create({ data: { originNodeId: source.id, destinationNodeId: hub.id, mode: "linehaul", typicalMinutes: 120, serviceDays: [], priority: 0, active: true } });
  const workflow = await db.deliveryWorkflowTemplate.findFirstOrThrow({ where: { name: "VG Direct doorstep default" } });
  const created = await routes.create("admin-commerce", "act-multihop-create", {
    name: "Activation multi-hop", originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery", destinationKind: "doorstep",
    workflowVersionId: workflow.currentPublishedVersionId!, priority: 10,
    stops: [{ position: 1, nodeId: source.id, terminalRole: "transit" }, { position: 2, nodeId: hub.id, terminalRole: "final_mile_dispatch" }],
    legs: [{ position: 1, laneId: lane.id }],
  }, "req-act-multihop-create");
  await routes.activate("admin-commerce", created.id, "act-multihop-activate", { expectedVersion: created.version }, "req-act-multihop-activate");
  const fixture = await reachPacked("activate-multihop");
  await planDoorstep(fixture.order.id, "multihop");

  await command.handover(fixture.order.id, {}, ctx("activate-multihop-handover"));

  const shipment = await db.shipment.findFirstOrThrow({ where: { orderId: fixture.order.id }, include: { legs: { orderBy: { position: "asc" } } } });
  assert.equal(shipment.status, "at_node");
  assert.equal(shipment.currentNodeId, source.id);
  assert.equal(shipment.currentLegId, null);
  assert.equal(shipment.custody, "source_staff");
  assert.equal(shipment.legs[0]?.status, "ready");
});

test("one-stop pickup-terminal shipment becomes ready-for-pickup and never final-mile-ready", async () => {
  const direct = await db.deliveryRouteRule.findFirstOrThrow({ where: { name: "VG Direct doorstep · zone-required" } });
  await db.deliveryRouteRule.update({ where: { id: direct.id }, data: { active: false } });
  const source = await db.logisticsNode.findUniqueOrThrow({ where: { code: "VG_DIRECT_SOURCE" } });
  const workflow = await publishedPickupWorkflow("activation");
  const created = await routes.create("admin-commerce", "act-pickup-create", {
    name: "Source pickup terminal", originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "pickup_point", finalPickupNodeId: source.id, workflowVersionId: workflow.id, priority: 20,
    stops: [{ position: 1, nodeId: source.id, terminalRole: "customer_pickup" }], legs: [],
  }, "req-act-pickup-create");
  await routes.activate("admin-commerce", created.id, "act-pickup-activate", { expectedVersion: created.version }, "req-act-pickup-activate");
  const fixture = await reachPacked("activate-pickup");
  await planning.planLegacy(fixture.order.id, "admin-commerce", "plan-pickup", { destinationKind: "pickup_point", finalPickupNodeId: source.id }, "req-plan-pickup");

  await command.handover(fixture.order.id, {}, ctx("activate-pickup-handover"));

  const shipment = await db.shipment.findFirstOrThrow({ where: { orderId: fixture.order.id } });
  assert.equal(shipment.status, "ready_for_pickup");
  assert.notEqual(shipment.status, "final_mile_ready");
  assert.equal(shipment.currentNodeId, source.id);
  assert.equal(shipment.custody, "source_staff");
  assert.equal(await db.deliveryJob.count({ where: { orderId: fixture.order.id } }), 0);
});

test("flag-on delivery handover without planned shipment rolls stock and operational state back", async () => {
  const fixture = await reachPacked("activate-missing");
  const lotBefore = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();

  await assert.rejects(
    () => command.handover(fixture.order.id, {}, ctx("activate-missing-handover")),
    (error: any) => error?.getStatus?.() === 422 && error?.getResponse?.()?.code === "SHIPMENT_NOT_PLANNED",
  );

  const order = await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
  const run = await db.fulfilmentRun.findUniqueOrThrow({ where: { orderId: fixture.order.id } });
  assert.equal(order.fulfilmentStatus, "packed");
  assert.equal(order.stockConsumedAt, null);
  assert.equal(run.handedOverAt, null);
  assert.equal(run.handedOverBy, null);
  assert.equal(run.handoverKind, null);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), lotBefore);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "active");
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: fixture.order.id } }), 0);
  assert.equal(await db.orderEvent.count({ where: { orderId: fixture.order.id, action: "fulfilment.handed_over" } }), 0);
  assert.equal(await db.auditEvent.count({ where: { entityId: fixture.order.id, action: "fulfilment.handed_over" } }), 0);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: fixture.order.id, type: "fulfilment.handed_over" } }), 0);
  assert.equal(await db.idempotency.count({ where: { actorId: "admin-commerce", operation: "fulfilment.command", key: "activate-missing-handover" } }), 0);
});
