import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { readConfig } from "../src/config";

let app: INestApplication;
let db: Database;
let base: string;
const env = (location = "loc_accra") => ({
  DATABASE_URL: process.env.DATABASE_URL!,
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: location,
  CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440",
  GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1",
  ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});
const orderData = (reference: string) => ({
  reference,
  customerUserId: "customer-a",
  customerName: "Ama A",
  customerPhone: "+233241111111",
  fulfilment: "collection",
  paymentMethod: "cash_counter",
  paymentStatus: "unpaid",
  fulfilmentStatus: "awaiting_confirmation",
  deliveryStatus: "unassigned",
  subtotalMinor: 100,
  discountMinor: 0,
  deliveryFeeMinor: 0,
  totalMinor: 100,
  verificationKeyVersion: 1,
  verificationCodeHash: "a".repeat(64),
});

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Tests require an isolated *variety_foundation_test database");
  app = await createApplication(readConfig(env()));
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  await db.$executeRawUnsafe(
    'TRUNCATE "User", "Category", "Location", "StockReceipt", "Idempotency", "AuditEvent", "OutboxEvent", "LoginThrottle", "GuestCheckoutSession", "CustomerAddress", "DeliveryZone", "DeliverySlot", "Order", "OrderDeliveryAddress", "OrderLine", "OrderEvent", "DeliverySlotBooking", "TrackingThrottle" CASCADE',
  );
  await db.user.createMany({ data: [
    { id: "customer-a", email: "a@example.test", name: "A", passwordHash: "unused", role: "customer" },
    { id: "customer-b", email: "b@example.test", name: "B", passwordHash: "unused", role: "customer" },
  ] });
  await db.location.createMany({ data: [
    { id: "loc_accra", name: "Accra", active: true },
    { id: "loc_inactive", name: "Inactive", active: false },
  ] });
  await db.deliveryZone.create({ data: {
    id: "zone-a", name: "Zone A", areas: ["Labone"], feeMinor: 1200,
    minimumOrderMinor: 5000, serviceHours: "08:00-18:00", cutoff: "16:00",
    slotsPerDay: 2, slotPolicy: "required", codEnabled: true,
  } });
  await db.deliverySlot.createMany({ data: [
    { id: "slot-a", zoneId: "zone-a", startsAt: new Date(Date.now()+3600000), endsAt: new Date(Date.now()+7200000), capacity: 1 },
    { id: "slot-b", zoneId: "zone-a", startsAt: new Date(Date.now()+10800000), endsAt: new Date(Date.now()+14400000), capacity: 1 },
  ] });
});
after(async () => { await app?.close(); });

test("order persistence enforces exactly one owner, nonnegative money, supported states and verification digest", async () => {
  await assert.rejects(() => db.order.create({ data: { ...orderData("VG-BAD-NONE"), customerUserId: null } }));
  const guest = await db.guestCheckoutSession.create({ data: {
    tokenHash: "1".repeat(64), csrfHash: "2".repeat(64), expiresAt: new Date(Date.now()+3600000),
  } });
  await assert.rejects(() => db.order.create({ data: { ...orderData("VG-BAD-BOTH"), guestSessionId: guest.id } }));
  await assert.rejects(() => db.order.create({ data: { ...orderData("VG-BAD-MONEY"), subtotalMinor: -1 } }));
  await assert.rejects(() => db.order.create({ data: { ...orderData("VG-BAD-STATUS"), paymentStatus: "invented" } }));
  await assert.rejects(() => db.order.create({ data: { ...orderData("VG-BAD-HASH"), verificationCodeHash: "plaintext" } }));
  const valid = await db.order.create({ data: orderData("VG-VALID") });
  assert.equal(valid.version, 1);
});

test("delivery slots require positive capacity and order references/bookings stay unique", async () => {
  await assert.rejects(() => db.deliverySlot.create({ data: {
    id: "slot-zero", zoneId: "zone-a", startsAt: new Date(Date.now()+3600000), endsAt: new Date(Date.now()+7200000), capacity: 0,
  } }));
  const order = await db.order.create({ data: orderData("VG-UNIQUE") });
  await assert.rejects(() => db.order.create({ data: orderData("VG-UNIQUE") }));
  await db.deliverySlotBooking.create({ data: { orderId: order.id, slotId: "slot-a" } });
  await assert.rejects(() => db.deliverySlotBooking.create({ data: { orderId: order.id, slotId: "slot-b" } }));
  const badBookingOrder = await db.order.create({ data: orderData("VG-BAD-BOOK") });
  await assert.rejects(() => db.deliverySlotBooking.create({ data: { orderId: badBookingOrder.id, slotId: "slot-b", state: "invented" } }));
});

test("addresses require real owners and immutable order history cannot be rewritten or deleted", async () => {
  await assert.rejects(() => db.customerAddress.create({ data: {
    userId: "missing", label: "Home", recipientName: "Nobody", phone: "+233241111111", locality: "Accra", street: "Road",
  } }));
  const address = await db.customerAddress.create({ data: {
    userId: "customer-a", label: "Home", recipientName: "Ama", phone: "+233241111111", locality: "Accra", street: "Road",
  } });
  assert.equal(address.userId, "customer-a");
  const order = await db.order.create({ data: orderData("VG-IMMUTABLE") });
  const snapshot = await db.orderDeliveryAddress.create({ data: {
    orderId: order.id, label: "Home", recipientName: "Ama", phone: "+233241111111", locality: "Accra", street: "Road",
  } });
  const line = await db.orderLine.create({ data: {
    orderId: order.id, variantId: "variant-snapshot", productId: "product-snapshot", productName: "Rice", variantName: "1kg", unit: "kg", quantity: "1.25", unitPriceMinor: 500, lineTotalMinor: 625,
  } });
  const event = await db.orderEvent.create({ data: { orderId: order.id, actorKind: "customer", actorId: "customer-a", action: "order.created", customerSafe: true } });
  await assert.rejects(() => db.orderLine.update({ where: { id: line.id }, data: { productName: "Changed" } }));
  await assert.rejects(() => db.orderLine.delete({ where: { id: line.id } }));
  await assert.rejects(() => db.orderDeliveryAddress.update({ where: { orderId: snapshot.orderId }, data: { street: "Changed" } }));
  await assert.rejects(() => db.orderDeliveryAddress.delete({ where: { orderId: snapshot.orderId } }));
  await assert.rejects(() => db.orderEvent.update({ where: { id: event.id }, data: { action: "rewritten" } }));
  await assert.rejects(() => db.orderEvent.delete({ where: { id: event.id } }));
});

test("tracking throttle has a durable unique key", async () => {
  await db.trackingThrottle.create({ data: { key: "a".repeat(64), windowStart: new Date(), attempts: 1 } });
  await assert.rejects(() => db.trackingThrottle.create({ data: { key: "a".repeat(64), windowStart: new Date(), attempts: 1 } }));
});

test("readiness fails closed for absent or inactive commerce location while liveness stays up", async () => {
  assert.equal((await fetch(base + "/api/v1/health/ready")).status, 200);
  for (const config of [readConfig({ ...env(), COMMERCE_LOCATION_ID: undefined, CHECKOUT_PAYMENT_HOLD_MINUTES: undefined, CHECKOUT_OFFLINE_HOLD_MINUTES: undefined, GUEST_CHECKOUT_TTL_MINUTES: undefined, ORDER_VERIFICATION_ACTIVE_VERSION: undefined, ORDER_VERIFICATION_KEYS: undefined }), readConfig(env("loc_inactive"))]) {
    const x = await createApplication(config);
    await x.listen(0, "127.0.0.1");
    const u = await x.getUrl();
    assert.equal((await fetch(u + "/api/v1/health/live")).status, 200);
    assert.equal((await fetch(u + "/api/v1/health/ready")).status, 503);
    await x.close();
  }
});
