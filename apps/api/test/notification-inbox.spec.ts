import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { NotificationService } from "../src/notifications/notification.service";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication, db: Database, inbox: NotificationService, base: string;

async function createOrder(id: string, userId: string | null, reference: string) {
  let guestSessionId: string | undefined;
  if (!userId) {
    const guest = await db.guestCheckoutSession.create({ data: {
      tokenHash: "a".repeat(64), csrfHash: "b".repeat(64), expiresAt: new Date(Date.now() + 3600000),
    } });
    guestSessionId = guest.id;
  }
  await db.order.create({ data: {
    id, reference, customerUserId: userId, guestSessionId, customerName: "Fixture Customer",
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
  assert.ok(!delivered.body.includes("DO_NOT_LEAK"));
  assert.ok(records.every(item => !/cash was received|payment confirmed|real-time GPS|guaranteed ETA/i.test(item.body)));
});

test("cursor pagination visits tied-time messages once and excludes later arrivals", async () => {
  for (let index = 0; index < 5; index++) {
    await createOrder("page-order-" + index, "customer-a", "VG-PAGE-" + index);
  }
  await db.outboxEvent.updateMany({ data: { createdAt: new Date("2026-11-01T12:00:00Z") } });
  await inbox.projectBatch();
  const a = await token("customer-a@example.test");
  const first = await request("/account/notifications?limit=2", a);
  assert.equal(first.status, 200);
  assert.equal(typeof first.body.data.nextCursor, "string");
  const seen = first.body.data.items.map((item: { id: string }) => item.id);
  await createOrder("later-order", "customer-a", "VG-LATER");
  await inbox.projectBatch();
  let cursor: string | null = first.body.data.nextCursor;
  while (cursor) {
    const page = await request("/account/notifications?limit=2&cursor=" + encodeURIComponent(cursor), a);
    assert.equal(page.status, 200);
    seen.push(...page.body.data.items.map((item: { id: string }) => item.id));
    cursor = page.body.data.nextCursor;
  }
  assert.equal(seen.length, 5);
  assert.equal(new Set(seen).size, 5);
  const newer = await db.notification.findFirstOrThrow({ where: { orderId: "later-order" } });
  assert.ok(!seen.includes(newer.id));
  assert.equal((await request("/account/notifications?cursor=not-json", a)).status, 400);
  assert.equal((await request("/account/notifications?cursor=" + "a".repeat(513), a)).status, 400);
});

test("mark all read changes only the signed-in customer's unread inbox", async () => {
  for (let index = 0; index < 3; index++) await createOrder("read-order-" + index, "customer-a", "VG-READ-" + index);
  await createOrder("read-foreign-order", "customer-b", "VG-FOREIGN");
  await inbox.projectBatch();
  const a = await token("customer-a@example.test");
  const b = await token("customer-b@example.test");
  const first = await db.notification.findFirstOrThrow({ where: { recipientUserId: "customer-a" } });
  await request("/account/notifications/" + first.id + "/read", a, "POST");
  const result = await request("/account/notifications/read-all", a, "POST");
  assert.equal(result.status, 200);
  assert.equal(result.body.data.updatedCount, 2);
  assert.equal((await request("/account/notifications/read-all", a, "POST")).body.data.updatedCount, 0);
  assert.equal((await request("/account/notifications", a)).body.data.unreadCount, 0);
  assert.equal((await request("/account/notifications", b)).body.data.unreadCount, 1);
  assert.equal(await db.auditEvent.count({ where: { action: "notification.read_all" } }), 1);
});

test("web inbox mutations require the owning session's Origin and CSRF token", async () => {
  await createOrder("web-order", "customer-a", "VG-WEB");
  await inbox.projectBatch();
  const login = await fetch(base + "/api/v1/auth/sessions", {
    method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: JSON.stringify({ email: "customer-a@example.test", password: commerceTestPassword, client: "web" }),
  });
  assert.equal(login.status, 201);
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const csrf = (await login.json()).data.csrfToken as string;
  const invalidHeaders: Array<Record<string, string>> = [
    { cookie },
    { cookie, origin: "https://evil.example", "x-csrf-token": csrf },
    { cookie, origin: "http://localhost:3000", "x-csrf-token": "wrong" },
  ];
  for (const headers of invalidHeaders) {
    assert.equal((await fetch(base + "/api/v1/account/notifications/read-all", { method: "POST", headers })).status, 403);
  }
  const valid = await fetch(base + "/api/v1/account/notifications/read-all", {
    method: "POST", headers: { cookie, origin: "http://localhost:3000", "x-csrf-token": csrf },
  });
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).data.updatedCount, 1);
});

test("two concurrent projectors retain one receipt and one message per source event", async () => {
  await createOrder("concurrent-order", "customer-a", "VG-CONCURRENT");
  const results = await Promise.all([inbox.projectBatch(), inbox.projectBatch()]);
  assert.equal(results.reduce((total, result) => total + result.created, 0), 1);
  assert.equal(await db.notification.count(), 1);
  assert.equal(await db.notificationOutboxReceipt.count(), 1);
});

test("committed manual-provider delivery events receive the same customer updates", async () => {
  await createOrder("provider-order", "customer-a", "VG-PROVIDER");
  for (const type of ["delivery.provider_out_for_delivery", "delivery.provider_failed", "delivery.provider_delivered"]) {
    await db.outboxEvent.create({ data: { type, aggregateId: "provider-order", payload: {} } });
  }
  assert.equal((await inbox.projectBatch()).created, 4);
  assert.equal(await db.notification.count({ where: { kind: "delivery" } }), 3);
});

test("failed message creation rolls back its receipt and remains retryable", async () => {
  await createOrder("rollback-order", "customer-a", "VG-ROLLBACK");
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_notification_fixture() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'notification fixture failure'; END; $$ LANGUAGE plpgsql`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_notification_fixture BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION reject_notification_fixture()`);
  try {
    await assert.rejects(() => inbox.projectBatch());
    assert.equal(await db.notification.count(), 0);
    assert.equal(await db.notificationOutboxReceipt.count(), 0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_notification_fixture ON "Notification"`);
    await db.$executeRawUnsafe(`DROP FUNCTION reject_notification_fixture()`);
  }
  assert.equal((await inbox.projectBatch()).created, 1);
});

test("database writes cannot change message evidence or redirect it to another account", async () => {
  const source = await createOrder("integrity-order", "customer-a", "VG-INTEGRITY");
  await assert.rejects(() => db.notification.create({ data: {
    recipientUserId: "customer-b", orderId: "integrity-order", sourceEventId: source.id,
    kind: "order", title: "Forged recipient", body: "This must be rejected.",
  } }));
  await inbox.projectBatch();
  const row = await db.notification.findFirstOrThrow();
  await assert.rejects(() => db.notification.update({ where: { id: row.id }, data: { body: "Changed evidence" } }));
  await assert.rejects(() => db.notification.update({ where: { id: row.id }, data: { recipientUserId: "customer-b" } }));
  await inbox.markRead("customer-a", row.id, "read-test");
  await assert.rejects(() => db.notification.update({ where: { id: row.id }, data: { readAt: null } }));
  await assert.rejects(() => db.notificationOutboxReceipt.update({ where: { sourceEventId: source.id }, data: { outcome: "no_recipient" } }));
});

test("committed pickup booking/cancellation events create owner-only in-app confirmations without leaked payload",async()=>{
  await createOrder("notif-pickup-a","customer-a","VG-PICKUP-ONE");
  const sourceA=await db.outboxEvent.create({data:{
    type:"pickup.appointment_booked",aggregateId:"notif-pickup-a",
    payload:{customerUserId:"customer-b",verificationCode:"SECRET-NOT-EXPOSED",providerPhone:"+233999999999"},
  }});
  const sourceB=await db.outboxEvent.create({data:{
    type:"pickup.appointment_cancelled",aggregateId:"notif-pickup-a",
    payload:{receiverName:"HIDDEN-RECEIVER",paymentStatus:"not-a-financial-record"},
  }});
  assert.deepEqual(await inbox.projectBatch(),{scanned:3,created:3,busy:false});
  assert.deepEqual(await inbox.projectBatch(),{scanned:0,created:0,busy:false});
  const records=await db.notification.findMany({where:{orderId:"notif-pickup-a"}});
  assert.equal(records.length,3);
  assert.ok(records.every(row=>row.recipientUserId==="customer-a"));
  const booked=records.find(row=>row.sourceEventId===sourceA.id);
  const cancelled=records.find(row=>row.sourceEventId===sourceB.id);
  assert.equal(booked?.title,"Collection appointment booked");
  assert.equal(cancelled?.title,"Collection appointment cancelled");
  assert.equal(booked?.kind,"delivery");
  assert.ok(booked?.body.includes("View order details"));
  assert.ok(cancelled?.body.includes("Your order is not cancelled"));
  assert.ok(records.every(row=>!/SECRET-NOT-EXPOSED|HIDDEN-RECEIVER|233999999999|payment confirmed|guaranteed arrival/i.test(row.body)));
  assert.equal(await db.notificationOutboxReceipt.count({where:{outcome:"created"}}),3);
  const tokenA=await token("customer-a@example.test");
  const tokenB=await token("customer-b@example.test");
  assert.equal((await request("/account/notifications",tokenA)).body.data.unreadCount,3);
  assert.equal((await request("/account/notifications",tokenB)).body.data.unreadCount,0);
});
test("guest pickup appointment events are acknowledged without manufacturing an account inbox",async()=>{
  await createOrder("notif-guest-pickup",null,"VG-GUEST-PICKUP");
  for(const type of ["pickup.appointment_booked","pickup.appointment_cancelled"]){
    await db.outboxEvent.create({data:{type,aggregateId:"notif-guest-pickup",payload:{customerUserId:"customer-a"}}});
  }
  assert.deepEqual(await inbox.projectBatch(),{scanned:3,created:0,busy:false});
  assert.equal(await db.notification.count(),0);
  assert.equal(await db.notificationOutboxReceipt.count({where:{outcome:"no_recipient"}}),3);
});
test("pickup confirmation source cannot be redirected to another customer by a direct database write",async()=>{
  await createOrder("notif-pickup-integrity","customer-a","VG-PICKUP-INTEGRITY");
  const source=await db.outboxEvent.create({data:{
    type:"pickup.appointment_booked",aggregateId:"notif-pickup-integrity",payload:{},
  }});
  await assert.rejects(()=>db.notification.create({data:{
    recipientUserId:"customer-b",orderId:"notif-pickup-integrity",sourceEventId:source.id,
    kind:"delivery",title:"Forged booking",body:"Cannot redirect an appointment.",
  }}));
  const projected=await inbox.projectBatch();
  assert.equal(projected.created,2);
  assert.equal(await db.notification.count({where:{recipientUserId:"customer-b"}}),0);
});
