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
const stages = (packedTitle: string) => [
  { stageKey: "placed", eventKind: "order_placed", customerTitleTemplate: "Order placed", adminLabel: "Placed", customerVisible: true, showPlannedWhenPending: false, sortOrder: 1, exceptionSeverity: "info", notificationsAllowed: false },
  { stageKey: "packed", eventKind: "packed", customerTitleTemplate: packedTitle, adminLabel: "Packed", customerVisible: true, showPlannedWhenPending: true, sortOrder: 2, exceptionSeverity: "info", notificationsAllowed: false },
  { stageKey: "delivered", eventKind: "delivered", customerTitleTemplate: "Delivered", adminLabel: "Delivered", customerVisible: true, showPlannedWhenPending: true, sortOrder: 3, exceptionSeverity: "info", notificationsAllowed: false },
] as any;

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  workflows = new LogisticsWorkflowService(db);
});
after(async () => { await app?.close(); });

test("stale concurrent draft edit conflicts without overwriting the winner", async () => {
  const template = await workflows.createTemplate("admin-commerce", "wf-concurrency-create", { name: "Concurrent workflow", active: true }, "req-create");
  const draft = template.versions[0]!;
  const editorA = await workflows.saveDraft(template.id, draft.id, "admin-commerce", "wf-editor-a", { expectedRevision: 1, stages: stages("Packed by A") }, "req-editor-a");
  assert.equal(editorA.revision, 2);
  await assert.rejects(() => workflows.saveDraft(template.id, draft.id, "admin-commerce", "wf-editor-b", { expectedRevision: 1, stages: stages("Packed by B") }, "req-editor-b"), (error: any) => error?.status === 409 || error?.statusCode === 409);
  const afterConflict = await workflows.getTemplate(template.id);
  const current = afterConflict.versions.find((row) => row.id === draft.id)!;
  assert.equal(current.revision, 2);
  assert.equal(current.stages.find((row) => row.stageKey === "packed")?.customerTitleTemplate, "Packed by A");
});
