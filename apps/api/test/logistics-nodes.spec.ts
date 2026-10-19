import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { LogisticsNodeService } from "../src/logistics/logistics-node.service";
import { AdminLogisticsNodesController } from "../src/logistics/admin-logistics-nodes.controller";

let app: INestApplication;
let db: Database;
let service: LogisticsNodeService;
const config = () => readConfig({ DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true", COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440", ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({1:"11".repeat(32)}) });

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  service = new LogisticsNodeService(db);
});
after(async () => { await app?.close(); });

const baseNode = { code: " acc_hq ", name: " Accra Head Office ", publicName: " Accra Head Office ", kind: "head_office" as const, inventoryLocationId: "loc_accra", customerVisible: true, active: true };

test("admin node authority creates lists updates replays and emits audit/outbox evidence", async () => {
  const first = await service.create("admin-commerce", "node-create-1", baseNode, "req-node-1");
  assert.equal(first.code, "ACC_HQ");
  assert.equal(first.name, "Accra Head Office");
  assert.equal(first.inventoryLocationId, "loc_accra");
  assert.equal((first as any).stock, undefined);

  const replay = await service.create("admin-commerce", "node-create-1", baseNode, "req-node-replay");
  assert.equal(replay.id, first.id);
  await assert.rejects(() => service.create("admin-commerce", "node-create-1", { ...baseNode, publicName: "Changed" }, "req-node-conflict"));
  await assert.rejects(() => service.create("admin-commerce", "node-create-dup", { ...baseNode, code: "ACC_HQ", inventoryLocationId: null }, "req-node-dup"));
  await assert.rejects(() => service.create("admin-commerce", "node-create-inactive-location", { ...baseNode, code: "INACTIVE", inventoryLocationId: "loc_inactive" }, "req-node-inactive"));

  const listed = await service.list({ q: "acc" });
  assert.ok(listed.some((row) => row.id === first.id));
  const detail = await service.get(first.id);
  assert.equal(detail.dependencies?.inventoryLocationExists, true);
  assert.equal(detail.dependencies?.inventoryLocationActive, true);

  await assert.rejects(() => service.update("admin-commerce", first.id, "node-self-parent", { parentNodeId: first.id }, "req-node-self"));
  const updated = await service.update("admin-commerce", first.id, "node-update-1", { publicName: "Accra Central Office" }, "req-node-update");
  assert.equal(updated.publicName, "Accra Central Office");

  assert.equal(await db.auditEvent.count({ where: { entityId: first.id, action: { in: ["logistics.node.created", "logistics.node.updated"] } } }), 2);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: first.id, type: { in: ["logistics.node.created", "logistics.node.updated"] } } }), 2);
});

test("node deactivation fails closed while an active route depends on it", async () => {
  const source = await service.create("admin-commerce", "dep-source", { code: "DEP_SOURCE", name: "Source", publicName: "Source", kind: "hub", customerVisible: true, active: true }, "req-dep-source");
  const wf = await (db as any).deliveryWorkflowTemplate.create({ data: { name: "Dependency workflow", description: "", active: true } });
  const version = await (db as any).deliveryWorkflowVersion.create({ data: { templateId: wf.id, versionNumber: 1, status: "draft", revision: 1, createdBy: "admin-commerce" } });
  await (db as any).deliveryWorkflowVersion.update({ where: { id: version.id }, data: { status: "published", publishedBy: "admin-commerce", publishedAt: new Date() } });
  await (db as any).deliveryRouteRule.create({ data: { name: "Dependency route", originNodeId: source.id, deliveryZoneId: "zone-required", fulfilment: "delivery", destinationKind: "doorstep", workflowVersionId: version.id, priority: 1, active: true, createdBy: "admin-commerce" } });

  await assert.rejects(() => service.update("admin-commerce", source.id, "dep-deactivate", { active: false }, "req-dep-deactivate"), (error: any) => error?.status === 409 || error?.statusCode === 409);
  assert.equal((await service.get(source.id)).active, true);
  assert.equal((await service.get(source.id)).dependencies?.activeRouteRules, 1);
});

test("node controller refuses non-admin authority even when identity is present", async () => {
  const controller = new AdminLogisticsNodesController(service);
  const req = { actor: { id: "customer-a", role: "customer" }, requestId: "req-customer", get: () => undefined } as any;
  await assert.rejects(() => controller.list(req, {}), (error: any) => error?.status === 403 || error?.statusCode === 403);
});
