import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { LogisticsWorkflowService } from "../src/logistics/logistics-workflow.service";

let app: INestApplication;
let db: Database;
let workflows: LogisticsWorkflowService;
const config = () => readConfig({ DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true", COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440", ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({1:"11".repeat(32)}) });

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  workflows = new LogisticsWorkflowService(db);
});
after(async () => { await app?.close(); });

const stage = (stageKey: string, eventKind: string, sortOrder: number, title: string) => ({
  stageKey, eventKind, customerTitleTemplate: title, adminLabel: title,
  customerVisible: true, showPlannedWhenPending: sortOrder > 1, sortOrder,
  exceptionSeverity: "info" as const, notificationsAllowed: true,
});
const validStages = () => [
  stage("placed", "order_placed", 1, "Order placed"),
  stage("packed", "packed", 2, "Packed"),
  stage("delivered", "delivered", 3, "Delivered"),
] as any;

test("workflow authority creates saves publishes clones and preserves published history", async () => {
  const created = await workflows.createTemplate("admin-commerce", "wf-create-1", { name: " Nationwide doorstep ", description: " Route workflow ", active: true }, "req-wf-create");
  assert.equal(created.name, "Nationwide doorstep");
  assert.equal(created.currentPublishedVersionId, null);
  assert.equal(created.versions.length, 1);
  const draft = created.versions[0]!;
  assert.equal(draft.status, "draft");
  assert.equal(draft.versionNumber, 1);
  assert.equal(draft.revision, 1);

  const saved = await workflows.saveDraft(created.id, draft.id, "admin-commerce", "wf-save-1", { expectedRevision: 1, defaultSlaMinutes: 1440, stages: validStages() }, "req-wf-save");
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.stages.map((row) => row.eventKind), ["order_placed", "packed", "delivered"]);

  const published = await workflows.publish(created.id, "admin-commerce", "wf-publish-1", { versionId: draft.id, expectedRevision: 2 }, "req-wf-publish");
  assert.equal(published.currentPublishedVersionId, draft.id);
  assert.equal(published.versions.find((row) => row.id === draft.id)?.status, "published");
  await assert.rejects(() => workflows.saveDraft(created.id, draft.id, "admin-commerce", "wf-illegal-edit", { expectedRevision: 2, stages: validStages() }, "req-illegal"));

  const cloned = await workflows.createDraft(created.id, "admin-commerce", "wf-draft-2", "req-wf-draft-2");
  assert.equal(cloned.versionNumber, 2);
  assert.equal(cloned.status, "draft");
  assert.equal(cloned.revision, 1);
  assert.deepEqual(cloned.stages.map((row) => row.customerTitleTemplate), saved.stages.map((row) => row.customerTitleTemplate));
  await assert.rejects(() => workflows.createDraft(created.id, "admin-commerce", "wf-draft-duplicate", "req-wf-draft-duplicate"));

  const editedStages = validStages();
  editedStages[1] = { ...editedStages[1], customerTitleTemplate: "Packed and ready" };
  const savedTwo = await workflows.saveDraft(created.id, cloned.id, "admin-commerce", "wf-save-2", { expectedRevision: 1, defaultSlaMinutes: 1200, stages: editedStages }, "req-wf-save-2");
  const publishedTwo = await workflows.publish(created.id, "admin-commerce", "wf-publish-2", { versionId: cloned.id, expectedRevision: savedTwo.revision }, "req-wf-publish-2");
  assert.equal(publishedTwo.currentPublishedVersionId, cloned.id);
  const old = publishedTwo.versions.find((row) => row.id === draft.id)!;
  assert.equal(old.status, "published");
  assert.equal(old.stages[1]?.customerTitleTemplate, "Packed");

  await assert.rejects(() => db.workflowStageDefinition.update({ where: { id: old.stages[0]!.id! }, data: { customerTitleTemplate: "Rewritten" } }));
  await assert.rejects(() => db.workflowStageDefinition.delete({ where: { id: old.stages[0]!.id! } }));
  assert.ok(await db.auditEvent.count({ where: { action: { startsWith: "logistics.workflow." } } }) >= 6);
  assert.ok(await db.outboxEvent.count({ where: { type: { startsWith: "logistics.workflow." } } }) >= 6);
});

test("workflow safety blocks financial or false delivery truth in presentation", async () => {
  const created = await workflows.createTemplate("admin-commerce", "wf-safety-create", { name: "Safety workflow", active: true }, "req-wf-safety");
  const version = created.versions[0]!;
  for (const [key, eventKind, title] of [
    ["paid", "packed", "Paid"],
    ["cash", "custom_checkpoint", "Cash remitted"],
    ["refund", "shipment_arrived", "Refunded"],
    ["false-delivery", "packed", "Delivery complete"],
  ] as const) {
    await assert.rejects(() => workflows.saveDraft(created.id, version.id, "admin-commerce", `wf-safe-${key}`, {
      expectedRevision: 1,
      stages: [stage("placed", "order_placed", 1, "Order placed"), stage(key, eventKind, 2, title), stage("done", "delivered", 3, "Delivered") as any],
    } as any, `req-${key}`));
  }

  const good = await workflows.saveDraft(created.id, version.id, "admin-commerce", "wf-safe-good", { expectedRevision: 1, stages: validStages() }, "req-safe-good");
  assert.equal(good.revision, 2);
});

test("publication fails closed on invalid stage topology", async () => {
  const created = await workflows.createTemplate("admin-commerce", "wf-topology-create", { name: "Topology workflow", active: true }, "req-wf-topology");
  const version = created.versions[0]!;

  await assert.rejects(() => workflows.publish(created.id, "admin-commerce", "wf-empty-publish", { versionId: version.id, expectedRevision: 1 }, "req-empty"));
  const wrongFirst = await workflows.saveDraft(created.id, version.id, "admin-commerce", "wf-wrong-first", {
    expectedRevision: 1,
    stages: [stage("packed", "packed", 1, "Packed"), stage("delivered", "delivered", 2, "Delivered") as any],
  } as any, "req-wrong-first");
  await assert.rejects(() => workflows.publish(created.id, "admin-commerce", "wf-wrong-first-publish", { versionId: version.id, expectedRevision: wrongFirst.revision }, "req-wrong-first-publish"));

  const duplicateComplete = await workflows.saveDraft(created.id, version.id, "admin-commerce", "wf-duplicate-complete", {
    expectedRevision: wrongFirst.revision,
    stages: [stage("placed", "order_placed", 1, "Order placed"), stage("done1", "delivered", 2, "Delivered"), stage("done2", "customer_collected", 3, "Collected") as any],
  } as any, "req-duplicate-complete");
  await assert.rejects(() => workflows.publish(created.id, "admin-commerce", "wf-duplicate-complete-publish", { versionId: version.id, expectedRevision: duplicateComplete.revision }, "req-duplicate-complete-publish"));

  const nonterminal = await workflows.saveDraft(created.id, version.id, "admin-commerce", "wf-no-terminal", { expectedRevision: duplicateComplete.revision, stages: [stage("placed", "order_placed", 1, "Order placed"), stage("packed", "packed", 2, "Packed") as any] }, "req-no-terminal");
  await assert.rejects(() => workflows.publish(created.id, "admin-commerce", "wf-no-terminal-publish", { versionId: version.id, expectedRevision: nonterminal.revision }, "req-no-terminal-publish"));
});
