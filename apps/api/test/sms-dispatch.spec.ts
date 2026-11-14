import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { SmsDispatchService } from "../src/notifications/sms-dispatch.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication, db: Database, sms: SmsDispatchService;
const base = () => ({
  DATABASE_URL: process.env.DATABASE_URL!,
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
});
const enabled = () => ({
  ...base(),
  HUBTEL_SMS_ENABLED: "true",
  SMS_DISPATCH_WORKER_ENABLED: "true",
  SMS_DISPATCH_ACTIVATED_AT: new Date(Date.now() - 300000).toISOString(),
  HUBTEL_SMS_CLIENT_ID: "isolated-test",
  HUBTEL_SMS_CLIENT_SECRET: "isolated-test-secret",
  HUBTEL_SMS_SENDER_ID: "VarietyGroc",
});
async function makeOrder(id: string, optIn: boolean, phone = "+233241111111") {
  await db.order.create({ data: {
    id, reference: "VG-SMS-" + id, customerUserId: "customer-a",
    customerName: "Ama Customer", customerPhone: phone,
    smsUpdatesOptIn: optIn, fulfilment: "delivery",
    paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
    fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned",
    subtotalMinor: 200, totalMinor: 200,
    verificationKeyVersion: 1, verificationCodeHash: "a".repeat(64),
  } });
  return db.outboxEvent.create({ data: {
    type: "order.created", aggregateId: id,
    payload: { customerPhone: "+233555555555", message: "FORGED-PAYLOAD-SECRET" },
  } });
}
before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("SMS dispatch tests require a disposable PostgreSQL test database");
  app = await createApplication(readConfig(enabled()));
  await app.init();
  db = app.get(Database);
  sms = app.get(SmsDispatchService);
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => { await app?.close(); });

test("default/no consent means durable suppression with no phone or body", async () => {
  const event = await makeOrder("no-consent", false);
  assert.deepEqual(await sms.projectBatch(), {
    disabled: false, scanned: 1, queued: 0, suppressed: 1, busy: false,
  });
  const record = await db.smsDispatch.findUniqueOrThrow({ where: { sourceEventId: event.id } });
  assert.equal(record.state, "suppressed");
  assert.equal(record.recipientPhone, null);
  assert.equal(record.body, null);
  assert.deepEqual(await sms.projectBatch(), {
    disabled: false, scanned: 0, queued: 0, suppressed: 0, busy: false,
  });
  assert.equal((await sms.sendBatch({ send: async () => { throw Error("must never send"); } } as never)).attempted, 0);
});

test("consented order is queued once using real order data, never forged payload", async () => {
  const event = await makeOrder("opt-in-1", true);
  assert.deepEqual(await sms.projectBatch(), {
    disabled: false, scanned: 1, queued: 1, suppressed: 0, busy: false,
  });
  const record = await db.smsDispatch.findUniqueOrThrow({ where: { sourceEventId: event.id } });
  assert.equal(record.state, "pending");
  assert.equal(record.recipientPhone, "233241111111");
  assert.ok(!record.body?.includes("FORGED-PAYLOAD-SECRET"));
  assert.ok(!record.body?.includes("555555555"));
  assert.ok(record.body?.includes("VG-SMS-opt-in-1"));
  assert.equal((await sms.projectBatch()).scanned, 0);
});

test("provider acceptance is not delivery; a processed event is never sent twice", async () => {
  await makeOrder("accepted", true);
  await sms.projectBatch();
  let calls = 0;
  const fake = { send: async () => {
    calls++; return { state: "accepted", providerMessageId: "mock-msg-1" };
  } };
  assert.deepEqual(await sms.sendBatch(fake as never), {
    disabled: false, attempted: 1, accepted: 1, rejected: 0, unknown: 0,
  });
  const record = await db.smsDispatch.findFirstOrThrow();
  assert.equal(record.state, "accepted");
  assert.equal(record.providerMessageId, "mock-msg-1");
  assert.equal(record.deliveryConfirmedAt, null);
  assert.ok(record.acceptedAt);
  assert.equal((await sms.sendBatch(fake as never)).attempted, 0);
  assert.equal(calls, 1);
});

test("provider rejection or unknown timeout must never result in blind retries", async () => {
  await makeOrder("refused", true);
  await makeOrder("uncertain", true);
  await sms.projectBatch();
  let calls = 0;
  const fake = { send: async () => {
    calls++;
    if (calls === 1) return { state: "rejected", reason: "rate_limited" };
    throw Error("Network timeout after possible provider acceptance");
  } };
  assert.deepEqual(await sms.sendBatch(fake as never), {
    disabled: false, attempted: 2, accepted: 0, rejected: 1, unknown: 1,
  });
  const states = (await db.smsDispatch.findMany()).map(row => row.state).sort();
  assert.deepEqual(states, ["rejected", "unknown"]);
  assert.equal((await sms.sendBatch(fake as never)).attempted, 0);
  assert.equal(calls, 2);
});

test("delivery lookup confirms the handset only after the provider reports Delivered", async () => {
  await makeOrder("delivered", true);
  await sms.projectBatch();
  await sms.sendBatch({ send: async () => ({ state: "accepted", providerMessageId: "sms-01" }) } as never);
  const before = await db.smsDispatch.findFirstOrThrow();
  assert.equal(before.state, "accepted");
  assert.equal(before.deliveryConfirmedAt, null);
  const checked = await sms.reconcileBatch({
    lookupDelivery: async (id: string) => {
      assert.equal(id, "sms-01"); return { state: "delivered" };
    },
  } as never);
  assert.deepEqual(checked, { disabled: false, checked: 1, delivered: 1, failed: 0, pending: 0, unknown: 0 });
  const afterRow = await db.smsDispatch.findFirstOrThrow();
  assert.equal(afterRow.state, "delivered");
  assert.ok(afterRow.deliveryConfirmedAt);
  assert.equal((await sms.reconcileBatch({ lookupDelivery: async () => { throw Error("no retry"); } } as never)).checked, 0);
});

test("lookup failures retain accepted state, without sending a second SMS", async () => {
  await makeOrder("lookup-error", true);
  await sms.projectBatch();
  await sms.sendBatch({ send: async () => ({ state: "accepted", providerMessageId: "sms-02" }) } as never);
  assert.equal((await sms.reconcileBatch({
    lookupDelivery: async () => { throw Error("Hubtel status unavailable"); },
  } as never)).unknown, 1);
  assert.equal((await db.smsDispatch.findFirstOrThrow()).state, "accepted");
});

test("invalid Ghana phones and events with no order are suppressed", async () => {
  await makeOrder("bad-phone", true, "not-a-gh-mobile");
  await db.outboxEvent.create({ data: {
    type: "delivery.delivered", aggregateId: "missing-order", payload: {},
  } });
  assert.deepEqual(await sms.projectBatch(), {
    disabled: false, scanned: 2, queued: 0, suppressed: 2, busy: false,
  });
  assert.equal(await db.smsDispatch.count({ where: { state: "pending" } }), 0);
});

test("historical events before activation are never queued during cutover", async () => {
  const event = await makeOrder("old-event", true);
  await db.outboxEvent.update({
    where: { id: event.id },
    data: { createdAt: new Date(Date.now() - 3600000) },
  });
  assert.equal((await sms.projectBatch()).scanned, 0);
  assert.equal(await db.smsDispatch.count(), 0);
});

test("SMS worker disabled in config prevents projection and all sends", async () => {
  await makeOrder("disabled", true);
  const inactive = new SmsDispatchService(db, readConfig(base()));
  assert.deepEqual(await inactive.projectBatch(), {
    disabled: true, scanned: 0, queued: 0, suppressed: 0, busy: false,
  });
  assert.deepEqual(await inactive.sendBatch(), {
    disabled: true, attempted: 0, accepted: 0, rejected: 0, unknown: 0,
  });
  assert.equal(await db.smsDispatch.count(), 0);
});

test("worker requires explicit cutover timestamp and independently enabled Hubtel sender", () => {
  assert.throws(() => readConfig({ ...enabled(), SMS_DISPATCH_ACTIVATED_AT: "" }));
  assert.throws(() => readConfig({ ...enabled(), HUBTEL_SMS_ENABLED: "false" }));
  assert.throws(() => readConfig({ ...enabled(), SMS_DISPATCH_ACTIVATED_AT: "2027-12-01T00:00:00Z" }));
  assert.equal(readConfig(base()).smsDispatchWorkerEnabled, false);
});
