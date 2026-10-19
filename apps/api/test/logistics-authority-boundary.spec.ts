import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { LogisticsNodeService } from "../src/logistics/logistics-node.service";
import { LogisticsLaneService } from "../src/logistics/logistics-lane.service";
import { LogisticsWorkflowService } from "../src/logistics/logistics-workflow.service";
import { LogisticsRouteRuleService } from "../src/logistics/logistics-route-rule.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let nodes: LogisticsNodeService;
let lanes: LogisticsLaneService;
let workflows: LogisticsWorkflowService;
let routes: LogisticsRouteRuleService;
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({1:"11".repeat(32)}),
});

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  db = app.get(Database);
  nodes = app.get(LogisticsNodeService);
  lanes = app.get(LogisticsLaneService);
  workflows = app.get(LogisticsWorkflowService);
  routes = app.get(LogisticsRouteRuleService);
  await seedCommerceFixtures(db);
});
after(async () => { await app?.close(); });

async function runtimeSnapshot() {
  return JSON.parse(JSON.stringify({
    orders: await db.order.findMany({ orderBy: { id: "asc" } }),
    reservations: await db.reservation.findMany({ orderBy: { id: "asc" } }),
    stockLots: await db.stockLot.findMany({ orderBy: { id: "asc" } }),
    stockDepletions: await db.stockDepletion.findMany({ orderBy: { id: "asc" }, include: { lines: true } }),
    fulfilmentRuns: await db.fulfilmentRun.findMany({ orderBy: { id: "asc" }, include: { picks: true } }),
    deliveryJobs: await db.deliveryJob.findMany({ orderBy: { id: "asc" }, include: { events: true, proof: true } }),
    paymentAttempts: await db.paymentAttempt.findMany({ orderBy: { id: "asc" } }),
    refunds: await db.refund.findMany({ orderBy: { id: "asc" } }),
  }));
}

test("L1 configuration commands do not mutate runtime commerce authorities", async () => {
  const beforeState = await runtimeSnapshot();
  const source = await nodes.create("admin-commerce", "boundary-node-source", {
    code: "BOUNDARY_SOURCE", name: "Boundary Source", publicName: "Boundary Source", kind: "fulfilment_center", customerVisible: true, active: true,
  }, "req-boundary-node-source");
  const hub = await nodes.create("admin-commerce", "boundary-node-hub", {
    code: "BOUNDARY_HUB", name: "Boundary Hub", publicName: "Boundary Hub", kind: "hub", customerVisible: true, active: true,
  }, "req-boundary-node-hub");
  await nodes.update("admin-commerce", hub.id, "boundary-node-update", { publicName: "Boundary Regional Hub" }, "req-boundary-node-update");

  const lane = await lanes.create("admin-commerce", "boundary-lane-create", {
    originNodeId: source.id, destinationNodeId: hub.id, mode: "linehaul", typicalMinutes: 90,
    serviceDays: [1,2,3,4,5], priority: 0, active: true,
  }, "req-boundary-lane-create");
  await lanes.update("admin-commerce", lane.id, "boundary-lane-update", { typicalMinutes: 95 }, "req-boundary-lane-update");

  const template = await workflows.createTemplate("admin-commerce", "boundary-workflow-create", {
    name: "Boundary workflow", active: true,
  }, "req-boundary-workflow-create");
  const draft = template.versions[0]!;
  const saved = await workflows.saveDraft(template.id, draft.id, "admin-commerce", "boundary-workflow-save", {
    expectedRevision: draft.revision,
    stages: [
      { stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Order placed", adminLabel: "Order placed", customerVisible: true, showPlannedWhenPending: false, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false },
      { stageKey: "departed", eventKind: "shipment_departed", customerTitleTemplate: "Departed source", adminLabel: "Departed source", customerVisible: true, showPlannedWhenPending: true, sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: true },
      { stageKey: "delivered", eventKind: "delivered", customerTitleTemplate: "Delivered", adminLabel: "Delivered", customerVisible: true, showPlannedWhenPending: true, sortOrder: 3, exceptionSeverity: "info", notificationsAllowed: true },
    ],
  }, "req-boundary-workflow-save");
  const published = await workflows.publish(template.id, "admin-commerce", "boundary-workflow-publish", {
    versionId: draft.id, expectedRevision: saved.revision,
  }, "req-boundary-workflow-publish");
  const workflowVersionId = published.currentPublishedVersionId!;

  const rule = await routes.create("admin-commerce", "boundary-route-create", {
    name: "Boundary multi-hop", originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery",
    destinationKind: "doorstep", workflowVersionId, priority: 5,
    stops: [
      { position: 1, nodeId: source.id, terminalRole: "transit" },
      { position: 2, nodeId: hub.id, terminalRole: "final_mile_dispatch" },
    ],
    legs: [{ position: 1, laneId: lane.id }],
  }, "req-boundary-route-create");
  const activated = await routes.activate("admin-commerce", rule.id, "boundary-route-activate", {
    expectedVersion: rule.version,
  }, "req-boundary-route-activate");
  const simulation = await routes.simulate({
    originNodeId: source.id, fulfilment: "delivery", deliveryZoneId: "zone-required", destinationKind: "doorstep",
  });
  assert.equal(simulation.status, "matched");
  await routes.update("admin-commerce", rule.id, "boundary-route-deactivate", {
    expectedVersion: activated.version, active: false,
  }, "req-boundary-route-deactivate");

  const afterState = await runtimeSnapshot();
  assert.deepEqual(afterState, beforeState);
});
