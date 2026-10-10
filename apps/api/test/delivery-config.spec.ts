import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { DeliveryConfigService } from "../src/delivery-config/delivery-config.service";
import { seedCommerceFixtures } from "./commerce-fixtures";
import { readConfig } from "../src/config";

let app: INestApplication;
let second: INestApplication;
let db: Database;
let secondDb: Database;
let delivery: DeliveryConfigService;
let secondDelivery: DeliveryConfigService;
let base: string;
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({1:"11".repeat(32)}),
});
const orderData = (reference: string) => ({
  reference, customerUserId: "customer-a", customerName: "Ama", customerPhone: "+233241111111",
  fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "mobile_money", paymentStatus: "pending",
  fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned", subtotalMinor: 1000, discountMinor: 0,
  deliveryFeeMinor: 1200, totalMinor: 2200, verificationKeyVersion: 1, verificationCodeHash: "a".repeat(64),
});
async function createOrder(reference: string) { return db.order.create({ data: orderData(reference) }); }
async function expectProblem(p: Promise<unknown>, status: number, code: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof ApiProblem); assert.equal(e.getStatus(), status);
    assert.equal((e.getResponse() as {code:string}).code, code); return true;
  });
}
before(async () => {
  app = await createApplication(config()); second = await createApplication(config());
  await app.listen(0, "127.0.0.1"); base = await app.getUrl();
  db = app.get(Database); secondDb = second.get(Database);
  await seedCommerceFixtures(db);
  delivery = app.get(DeliveryConfigService); secondDelivery = second.get(DeliveryConfigService);
});
after(async () => { await second?.close(); await app?.close(); });

test("public zones hide inactive configuration and expose slot/COD policy", async () => {
  const rows = await delivery.listZones();
  assert.deepEqual(rows.map((x) => x.id), ["zone-none", "zone-optional", "zone-required"]);
  const required = rows.find((x) => x.id === "zone-required")!;
  assert.equal(required.slotPolicy, "required"); assert.equal(required.codEnabled, true);
  const http = await fetch(base + "/api/v1/checkout/zones");
  assert.equal(http.status, 200); assert.equal((await http.json()).data.length, 3);
});

test("public slots show only active future capacity and derive booked count", async () => {
  const order = await createOrder("VG-SLOT-LIST");
  await db.$transaction((tx) => delivery.lockAndBookSlot(tx, {
    orderId: order.id, zoneId: "zone-required", slotId: "slot-future", now: new Date(),
  }, { actorId: "customer-a", requestId: "req-slot-list" }));
  const rows = await delivery.listSlots("zone-required");
  assert.ok(rows.some((x) => x.id === "slot-future" && x.booked === 1));
  assert.ok(rows.some((x) => x.id === "slot-final" && x.booked === 0));
  assert.ok(!rows.some((x) => x.id === "slot-past" || x.id === "slot-inactive"));
  for (const row of rows) { assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/); assert.match(row.window, /^\d{2}:\d{2}–\d{2}:\d{2}$/); }
});

test("slot booking rejects zone mismatch inactive and past slots without effects", async () => {
  for (const [slotId, zoneId] of [["slot-final","zone-optional"],["slot-inactive","zone-required"],["slot-past","zone-required"]] as const) {
    const order = await createOrder("VG-REJECT-" + slotId);
    await expectProblem(db.$transaction((tx) => delivery.lockAndBookSlot(tx, {
      orderId: order.id, zoneId, slotId, now: new Date(),
    }, { actorId: "customer-a", requestId: "req-"+slotId })), 400, "VALIDATION_FAILED");
    assert.equal(await db.deliverySlotBooking.count({ where: { orderId: order.id } }), 0);
  }
});

test("two independent clients cannot both book the final slot", async () => {
  const a = await createOrder("VG-RACE-A"), b = await createOrder("VG-RACE-B");
  const attempt = (database: Database, service: DeliveryConfigService, orderId: string) =>
    database.$transaction((tx) => service.lockAndBookSlot(tx, {
      orderId, zoneId: "zone-required", slotId: "slot-final", now: new Date(),
    }, { actorId: "customer-a", requestId: "req-race-"+orderId }));
  const results = await Promise.allSettled([attempt(db, delivery, a.id), attempt(secondDb, secondDelivery, b.id)]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const loser = results.find((x) => x.status === "rejected") as PromiseRejectedResult;
  assert.ok(loser.reason instanceof ApiProblem); assert.equal(loser.reason.getStatus(), 409);
  assert.equal((loser.reason.getResponse() as {code:string}).code, "CONFLICT");
  assert.equal(await db.deliverySlotBooking.count({ where: { slotId: "slot-final", state: "active" } }), 1);
});

test("release changes active booking once and emits events only once", async () => {
  const booking = await db.deliverySlotBooking.findFirstOrThrow({ where: { slotId: "slot-future", state: "active" } });
  const changed = await db.$transaction((tx) => delivery.releaseBooking(tx, booking.orderId, { actorId: "customer-a", requestId: "req-release" }));
  assert.equal(changed, 1);
  assert.equal(await db.$transaction((tx) => delivery.releaseBooking(tx, booking.orderId, { actorId: "customer-a", requestId: "req-release-2" })), 0);
  assert.equal(await db.auditEvent.count({ where: { action: "delivery.slot_released", entityId: booking.orderId } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { type: "delivery.slot_released", aggregateId: booking.orderId } }), 1);
});
