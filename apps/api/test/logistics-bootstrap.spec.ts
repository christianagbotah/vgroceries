import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { LogisticsBootstrapService } from "../src/logistics/logistics-bootstrap.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let bootstrap: LogisticsBootstrapService;
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
  bootstrap = app.get(LogisticsBootstrapService);
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => { await app?.close(); });

test("direct bootstrap creates one source one published workflow and one active direct rule per active delivery zone", async () => {
  const result = await bootstrap.ensureDirectDefaults("admin-commerce", "req-bootstrap-1");
  assert.equal(result.sourceNodeCode, "VG_DIRECT_SOURCE");
  assert.equal(result.activeZoneCount, 3);
  assert.equal(result.routeRuleCount, 3);

  const source = await db.logisticsNode.findUnique({ where: { code: "VG_DIRECT_SOURCE" } });
  assert.ok(source);
  assert.equal(source.inventoryLocationId, "loc_accra");
  assert.equal(source.kind, "fulfilment_center");
  assert.equal(source.active, true);

  const workflows = await db.deliveryWorkflowTemplate.findMany({
    where: { name: "VG Direct doorstep default" }, include: { versions: { include: { stages: true } } },
  });
  assert.equal(workflows.length, 1);
  const workflow = workflows[0]!;
  assert.ok(workflow.currentPublishedVersionId);
  const published = workflow.versions.find((version) => version.id === workflow.currentPublishedVersionId)!;
  assert.equal(published.status, "published");
  assert.deepEqual(published.stages.sort((a,b)=>a.sortOrder-b.sortOrder).map((stage) => stage.eventKind), ["order_placed", "packed", "delivered"]);

  const rules = await db.deliveryRouteRule.findMany({
    where: { name: { startsWith: "VG Direct doorstep · " } }, include: { stops: true, legs: true }, orderBy: { deliveryZoneId: "asc" },
  });
  assert.equal(rules.length, 3);
  assert.deepEqual(rules.map((rule) => rule.deliveryZoneId), ["zone-none", "zone-optional", "zone-required"]);
  for (const rule of rules) {
    assert.equal(rule.active, true);
    assert.equal(rule.originNodeId, source.id);
    assert.equal(rule.destinationKind, "doorstep");
    assert.equal(rule.workflowVersionId, published.id);
    assert.equal(rule.stops.length, 1);
    assert.equal(rule.stops[0]?.nodeId, source.id);
    assert.equal(rule.stops[0]?.terminalRole, "final_mile_dispatch");
    assert.equal(rule.legs.length, 0);
  }
});

test("direct bootstrap is exactly idempotent and does not duplicate defaults", async () => {
  const first = await bootstrap.ensureDirectDefaults("admin-commerce", "req-bootstrap-first");
  const countsBefore = {
    nodes: await db.logisticsNode.count(), workflows: await db.deliveryWorkflowTemplate.count(),
    versions: await db.deliveryWorkflowVersion.count(), rules: await db.deliveryRouteRule.count(),
  };
  const second = await bootstrap.ensureDirectDefaults("admin-commerce", "req-bootstrap-second");
  const countsAfter = {
    nodes: await db.logisticsNode.count(), workflows: await db.deliveryWorkflowTemplate.count(),
    versions: await db.deliveryWorkflowVersion.count(), rules: await db.deliveryRouteRule.count(),
  };
  assert.deepEqual(second, first);
  assert.deepEqual(countsAfter, countsBefore);
});

test("direct bootstrap refuses incompatible stable defaults atomically", async () => {
  await db.logisticsNode.create({ data: {
    code: "VG_DIRECT_SOURCE", name: "Operator node", publicName: "Operator node", kind: "hub",
    customerVisible: false, active: true,
  } });
  await assert.rejects(
    () => bootstrap.ensureDirectDefaults("admin-commerce", "req-bootstrap-conflict"),
    (error: any) => error?.getResponse?.()?.code === "CONFLICT",
  );
  assert.equal(await db.deliveryWorkflowTemplate.count({ where: { name: "VG Direct doorstep default" } }), 0);
  assert.equal(await db.deliveryRouteRule.count({ where: { name: { startsWith: "VG Direct doorstep · " } } }), 0);
  const node = await db.logisticsNode.findUniqueOrThrow({ where: { code: "VG_DIRECT_SOURCE" } });
  assert.equal(node.name, "Operator node");
  assert.equal(node.inventoryLocationId, null);
});
