import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { NotificationService } from "../src/notifications/notification.service";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication, db: Database, inbox: NotificationService, base: string;

async function createOrder(id: string, userId: string | null, reference: string) {
  await db.order.create({ data: {
    id, reference, customerUserId: userId, customerName: "Fixture Customer",
    customerPhone: "+233241111111", fulfilment: "delivery",
    paymentMethod: "cash_on_delivery", paymentStatus: "unpaid",
    fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned",
    subtotalMinor: 500, totalMinor: 500, verificationKeyVersion: 1,
    verificationCodeHash: "a".repeat(64),
  } });
  return db.outboxEvent.create({ data: {
    type: "order.created", aggregateId: id,
    payload: { orderId: id, customerUserId: "customer-b", secret: "NEVER_EXPOSE_ME" },
  } });
}
async function token(email: string) {
  const response = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ email, password: commerceTestPassword, client: "native" }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).data.accessToken as string;
}
async function request(path: string, bearer?: string, method = "GET") {
  const response = await fetch(base + "/api/v1" + path, {
    method, headers: bearer ? { authorization: "Bearer " + bearer } : {},
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  app = await createApplication();
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  inbox = app.get(NotificationService);
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => { await app.close(); });

test("projector is exact-once, ignores forged recipient payload and records guest skip", async () => {
  const source = await createOrder("notification-order-a", "customer-a", "VG-INBOX-A");
  await createOrder("notification-guest", null, "VG-INBOX-GUEST");
  const initial = await inbox.projectBatch();
  assert.deepEqual(initial, { scanned: 2, created: 1, busy: false });
  assert.deepEqual(await inbox.projectBatch(), { scanned: 0, created: 0, busy: false });
  assert.equal(await db.notification.count(), 1);
  const result = await db.notification.findFirstOrThrow();
  assert.equal(result.recipientUserId, "customer-a");
  assert.equal(result.sourceEventId, source.id);
  assert.ok(!result.body.includes("NEVER_EXPOSE_ME"));
  assert.ok(!result.body.includes("customer-b"));
  assert.equal(await db.notificationOutboxReceipt.count({ where: { outcome: "no_recipient" } }), 1);
});

test("inbox endpoint is owner-scoped; marking read is idempotent and audited once", async () => {
  await createOrder("notification-order-1", "customer-a", "VG-ORDER-1");
  await inbox.projectBatch();
  const a = await token("customer-a@example.test");
  const b = await token("customer-b@example.test");
  const admin = await token("admin-commerce@example.test");
  assert.equal((await request("/account/notifications")).status, 401);
  assert.equal((await request("/account/notifications", admin)).status, 403);
  assert.equal((await request("/account/notifications?limit=0", a)).status, 400);
  const own = await request("/account/notifications", a);
  assert.equal(own.status, 200);
  assert.equal(own.body.data.unreadCount, 1);
  assert.equal(own.body.data.items.length, 1);
  const id = own.body.data.items[0].id as string;
  assert.equal((await request("/account/notifications", b)).body.data.unreadCount, 0);
  assert.equal((await request("/account/notifications/" + id + "/read", b, "POST")).status, 404);
  assert.equal((await request("/account/notifications/" + id + "/read", a, "POST")).status, 200);
  assert.equal((await request("/account/notifications/" + id + "/read", a, "POST")).status, 200);
  assert.equal((await request("/account/notifications", a)).body.data.unreadCount, 0);
  assert.equal(await db.auditEvent.count({ where: { action: "notification.read", entityId: id } }), 1);
});

test("inbox copy never implies a paid COD delivery, refunds, GPS or ETA", async () => {
  await createOrder("notification-order-cod", "customer-a", "VG-COD-1");
  await db.outboxEvent.create({ data: { type: "delivery.delivered",
    aggregateId: "notification-order-cod", payload: { secret: "DO_NOT_LEAK", paid: false } } });
  await inbox.projectBatch();
  const records = await db.notification.findMany({ orderBy: { createdAt: "asc" } });
  assert.equal(records.length, 2);
  const delivered = records.find(item => item.title === "Delivery recorded");
  assert.ok(delivered);
  assert.match(delivered.body, /remittance remain separate/);
  assert.ok(!delivered.body.includes("DO_NOT_LEAK"));
  assert.ok(records.every(item => !/cash was received|payment confirmed|real-time GPS|guaranteed ETA/i.test(item.body)));
});
