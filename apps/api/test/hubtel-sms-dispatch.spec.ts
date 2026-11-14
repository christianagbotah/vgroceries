import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { NotificationService } from "../src/notifications/notification.service";
import { HubtelSmsDispatchService } from "../src/notifications/hubtel-sms-dispatch.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

const config = readConfig({
  ...process.env,
  HUBTEL_SMS_CLIENT_ID: "fake-test-sms-id",
  HUBTEL_SMS_CLIENT_SECRET: "fake-test-sms-secret",
  HUBTEL_SMS_SENDER_ID: "VARIETY",
  HUBTEL_SMS_DISPATCH_ENABLED: "true",
  HUBTEL_SMS_NOT_BEFORE: "2026-01-01T00:00:00Z",
  HUBTEL_SMS_ALLOWED_RECIPIENTS: "0241111111",
});

let app: INestApplication;
let db: Database;
let inbox: NotificationService;
let dispatch: HubtelSmsDispatchService;

async function order(id: string, phone: string) {
  await db.order.create({ data: {
    id, reference: "VG-SMS-" + id,
    customerUserId: "customer-a",
    customerName: "Test Customer", customerPhone: phone,
    fulfilment: "delivery", paymentMethod: "cash_on_delivery",
    paymentStatus: "unpaid", fulfilmentStatus: "awaiting_confirmation",
    deliveryStatus: "unassigned", subtotalMinor: 2500,
    totalMinor: 2500, verificationKeyVersion: 1,
    verificationCodeHash: "a".repeat(64),
  } });
  return db.outboxEvent.create({
    data: {
      aggregateId: id, type: "order.created",
      payload: { customerPhone: "UNTRUSTED_PAYLOAD", secret: "NEVER_SEND_THIS" },
    },
  });
}

before(async () => {
  app = await createApplication(config);
  await app.listen(0, "127.0.0.1");
  db = app.get(Database);
  inbox = app.get(NotificationService);
  dispatch = app.get(HubtelSmsDispatchService);
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => { await app.close(); });

test("SMS staging never sends; at most one queued dispatch per source notification", async () => {
  await order("sms-one", "+233241111111");
  await inbox.projectBatch();
  let calls = 0;
  const staged = await dispatch.stageBatch();
  assert.equal(staged.queued, 1);
  assert.equal(staged.skipped, 0);
  assert.equal(await db.smsDispatch.count(), 1);
  assert.equal((await dispatch.stageBatch()).queued, 0);
  const row = await db.smsDispatch.findFirstOrThrow();
  assert.equal(row.recipientPhone, "+233241111111");
  assert.ok(!row.message.includes("NEVER_SEND_THIS"));
  assert.equal(row.state, "queued");
  assert.equal(calls, 0);

  const fake = { send: async (_to: string, _content: string) => {
    calls++;
    return { state: "submitted" as const, messageId: "provider-msg-1" };
  } };
  assert.deepEqual(await dispatch.sendApprovedBatch(10, fake),
    { disabled: false, attempted: 1, submitted: 1, uncertain: 0 });
  assert.deepEqual(await dispatch.sendApprovedBatch(10, fake),
    { disabled: false, attempted: 0, submitted: 0, uncertain: 0 });
  assert.equal(calls, 1);
  const sent = await db.smsDispatch.findFirstOrThrow();
  assert.equal(sent.state, "submitted");
  assert.equal(sent.providerMessageId, "provider-msg-1");
  assert.ok(sent.attemptedAt && sent.resolvedAt);
});

test("SMS uncertain provider result cannot be retried automatically", async () => {
  await order("sms-unknown", "+233241111111");
  await inbox.projectBatch();
  await dispatch.stageBatch();
  let calls = 0;
  const fake = { send: async () => { calls++; throw new Error("timeout: maybe accepted"); } };
  assert.deepEqual(await dispatch.sendApprovedBatch(10, fake),
    { disabled: false, attempted: 1, submitted: 0, uncertain: 1 });
  assert.deepEqual(await dispatch.sendApprovedBatch(10, fake),
    { disabled: false, attempted: 0, submitted: 0, uncertain: 0 });
  assert.equal(calls, 1);
  assert.equal((await db.smsDispatch.findFirstOrThrow()).state, "uncertain");
});

test("SMS cannot send to non-allowlisted customer or invalid phone", async () => {
  await order("sms-unapproved", "+233242222222");
  await order("sms-invalid", "invalid-number");
  await inbox.projectBatch();
  const stage = await dispatch.stageBatch();
  assert.equal(stage.queued, 1);
  assert.equal(stage.skipped, 1);
  let calls = 0;
  const fake = { send: async () => { calls++; return { state: "submitted" as const }; } };
  const result = await dispatch.sendApprovedBatch(10, fake);
  assert.equal(result.attempted, 0);
  assert.equal(calls, 0);
  assert.equal(await db.smsDispatch.count({ where: { state: "skipped" } }), 1);
});

test("SMS dispatch requires explicit opt-in, cutoff and allowlist", async () => {
  const disabled = readConfig({
    ...process.env,
    HUBTEL_SMS_CLIENT_ID: "fake-id",
    HUBTEL_SMS_CLIENT_SECRET: "fake-secret",
    HUBTEL_SMS_SENDER_ID: "VARIETY",
    HUBTEL_SMS_DISPATCH_ENABLED: "false",
  });
  const safeService = new HubtelSmsDispatchService(db, disabled);
  assert.equal((await safeService.stageBatch()).disabled, true);
  assert.equal((await safeService.sendApprovedBatch()).disabled, true);
  assert.throws(
    () => readConfig({ ...process.env, HUBTEL_SMS_DISPATCH_ENABLED: "true" }),
    /Hubtel SMS credentials|SMS dispatch requires configured Hubtel SMS credentials/,
  );
  assert.throws(
    () => readConfig({
      ...process.env, HUBTEL_SMS_CLIENT_ID: "fake-id",
      HUBTEL_SMS_CLIENT_SECRET: "fake-secret", HUBTEL_SMS_SENDER_ID: "VARIETY",
      HUBTEL_SMS_DISPATCH_ENABLED: "true",
      HUBTEL_SMS_NOT_BEFORE: "2026-01-01T00:00:00Z",
    }),
    /HUBTEL_SMS_ALLOWED_RECIPIENTS/,
  );
});
