import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
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
  await seedCommerceFixtures(db);
});
after(async () => { await app?.close(); });

function models() {
  const c = db as Database & Record<string, any>;
  assert.ok(c.riderProfile, "RiderProfile Prisma model is missing");
  assert.ok(c.deliveryJob, "DeliveryJob Prisma model is missing");
  assert.ok(c.deliveryEvent, "DeliveryEvent Prisma model is missing");
  assert.ok(c.deliveryProof, "DeliveryProof Prisma model is missing");
  return c;
}

async function recordDispatchHandover(orderId: string) {
  await db.fulfilmentRun.create({ data: {
    orderId, locationId: "loc_accra", handedOverBy: "admin-commerce", handedOverAt: new Date(), handoverKind: "dispatch",
  } });
}

test("dispatch schema enforces rider profile and one job/proof per authority root", async () => {
  const c = models();
  const riderUser = await db.user.create({ data: { email: "dispatch-rider@example.test", name: "Rider One", passwordHash: "x", role: "rider" } });
  const profile = await c.riderProfile.create({ data: { userId: riderUser.id, phone: "+233241234567", kind: "in_house", vehicle: "motorcycle", availabilityState: "available", lastAvailabilityChangedAt: new Date() } });
  await assert.rejects(() => c.riderProfile.create({ data: { userId: riderUser.id, phone: "+233241234568", kind: "in_house", vehicle: "bicycle", availabilityState: "available", lastAvailabilityChangedAt: new Date() } }));
  await assert.rejects(() => c.riderProfile.update({ where: { id: profile.id }, data: { availabilityState: "busy" } }));

  const order = await db.order.create({ data: { reference: "VG-DISPATCH-SCHEMA", customerUserId: "customer-a", customerName: "Ama Customer", customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "dispatched", deliveryStatus: "unassigned", subtotalMinor: 1990, deliveryFeeMinor: 1200, totalMinor: 3190, verificationKeyVersion: 1, verificationCodeHash: "a".repeat(64), stockConsumedAt: new Date() } });
  await recordDispatchHandover(order.id);
  const job = await c.deliveryJob.create({ data: { orderId: order.id, assignmentKind: "rider", riderProfileId: profile.id, status: "assigned", custodyState: "dispatch", assignedBy: "admin-commerce", assignedAt: new Date() } });
  await assert.rejects(() => c.deliveryJob.create({ data: { orderId: order.id, assignmentKind: "rider", riderProfileId: profile.id, status: "assigned", custodyState: "dispatch", assignedBy: "admin-commerce", assignedAt: new Date() } }));
  await assert.rejects(() => c.deliveryProof.create({ data: { deliveryJobId: job.id, method: "pin", reference: "1234", recordedByKind: "rider", recordedById: riderUser.id, recordedAt: new Date() } }));
  const proof = await c.deliveryProof.create({ data: { deliveryJobId: job.id, method: "signature", reference: "sig-ref", recordedByKind: "rider", recordedById: riderUser.id, recordedAt: new Date() } });
  await assert.rejects(() => c.deliveryProof.create({ data: { deliveryJobId: job.id, method: "photo_note", reference: "second", recordedByKind: "rider", recordedById: riderUser.id, recordedAt: new Date() } }));
  assert.equal(proof.method, "signature");
});

test("dispatch schema rejects invalid assignment custody status and concurrent active rider ownership", async () => {
  const c = models();
  const riderUser = await db.user.create({ data: { email: "dispatch-rider-two@example.test", name: "Rider Two", passwordHash: "x", role: "rider" } });
  const profile = await c.riderProfile.create({ data: { userId: riderUser.id, phone: "+233241234569", kind: "contracted", vehicle: "car", availabilityState: "available", lastAvailabilityChangedAt: new Date() } });
  const makeOrder = async (reference: string) => {
    const order = await db.order.create({ data: { reference, customerUserId: "customer-a", customerName: "Ama Customer", customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "dispatched", deliveryStatus: "unassigned", subtotalMinor: 1990, deliveryFeeMinor: 1200, totalMinor: 3190, verificationKeyVersion: 1, verificationCodeHash: "b".repeat(64), stockConsumedAt: new Date() } });
    await recordDispatchHandover(order.id);
    return order;
  };
  const one = await makeOrder("VG-DISPATCH-ACTIVE-1");
  const two = await makeOrder("VG-DISPATCH-ACTIVE-2");
  const three = await makeOrder("VG-DISPATCH-BAD-TARGET");
  await c.deliveryJob.create({ data: { orderId: one.id, assignmentKind: "rider", riderProfileId: profile.id, status: "accepted", custodyState: "dispatch", assignedBy: "admin-commerce", assignedAt: new Date() } });
  await assert.rejects(() => c.deliveryJob.create({ data: { orderId: two.id, assignmentKind: "rider", riderProfileId: profile.id, status: "assigned", custodyState: "dispatch", assignedBy: "admin-commerce", assignedAt: new Date() } }));
  await assert.rejects(() => c.deliveryJob.create({ data: { orderId: three.id, assignmentKind: "manual_provider", status: "assigned", custodyState: "dispatch", assignedBy: "admin-commerce", assignedAt: new Date() } }));
});

test("dispatch schema requires detail when failure reason is other", async () => {
  const c = models();
  const order = await db.order.create({ data: { reference: "VG-DISPATCH-OTHER-REASON", customerUserId: "customer-a", customerName: "Ama Customer", customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "dispatched", deliveryStatus: "failed", subtotalMinor: 1990, deliveryFeeMinor: 1200, totalMinor: 3190, verificationKeyVersion: 1, verificationCodeHash: "c".repeat(64), stockConsumedAt: new Date() } });
  await recordDispatchHandover(order.id);
  await assert.rejects(() => c.deliveryJob.create({ data: { orderId: order.id, assignmentKind: "manual_provider", providerKey: "manual", status: "failed", custodyState: "dispatch", assignedBy: "admin-commerce", assignedAt: new Date(), failedAt: new Date(), failureReasonCode: "other" } }));
  const accepted = await c.deliveryJob.create({ data: { orderId: order.id, assignmentKind: "manual_provider", providerKey: "manual", status: "failed", custodyState: "dispatch", assignedBy: "admin-commerce", assignedAt: new Date(), failedAt: new Date(), failureReasonCode: "other", failureNote: "Courier encountered an unclassified security closure" } });
  assert.equal(accepted.failureReasonCode, "other");
});

test("delivery event and proof history are append-only", async () => {
  const c = models();
  const rows = await db.$queryRaw<Array<{ trigger_name: string }>>`SELECT tgname AS trigger_name FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('DeliveryEvent_append_only','DeliveryProof_append_only') ORDER BY tgname`;
  assert.deepEqual(rows.map((r) => r.trigger_name), ["DeliveryEvent_append_only", "DeliveryProof_append_only"]);
});


test("dispatch schema rejects a job root without authoritative fulfilment handover", async () => {
  const c = models();
  const order = await db.order.create({ data: {
    reference: "VG-DISPATCH-NO-HANDOVER", customerUserId: "customer-a", customerName: "Ama Customer",
    customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required",
    paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "dispatched",
    deliveryStatus: "unassigned", subtotalMinor: 1990, deliveryFeeMinor: 1200, totalMinor: 3190,
    verificationKeyVersion: 1, verificationCodeHash: "d".repeat(64), stockConsumedAt: new Date(),
  } });
  await assert.rejects(() => c.deliveryJob.create({ data: {
    orderId: order.id, assignmentKind: "manual_provider", providerKey: "manual-test",
    status: "assigned", custodyState: "dispatch", assignedBy: "admin-commerce", assignedAt: new Date(),
  } }));
});

test("dispatch schema cannot release failed rider custody before physical return", async () => {
  const c = models();
  const riderUser = await db.user.create({ data: {
    email: "dispatch-return-custody@example.test", name: "Custody Rider", passwordHash: "x", role: "rider",
  } });
  const profile = await c.riderProfile.create({ data: {
    userId: riderUser.id, phone: "+233241234570", kind: "in_house", vehicle: "motorcycle",
    availabilityState: "available", lastAvailabilityChangedAt: new Date(),
  } });
  const order = await db.order.create({ data: {
    reference: "VG-DISPATCH-CUSTODY-GUARD", customerUserId: "customer-a", customerName: "Ama Customer",
    customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required",
    paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "dispatched",
    deliveryStatus: "failed", subtotalMinor: 1990, deliveryFeeMinor: 1200, totalMinor: 3190,
    verificationKeyVersion: 1, verificationCodeHash: "e".repeat(64), stockConsumedAt: new Date(),
  } });
  await recordDispatchHandover(order.id);
  const job = await c.deliveryJob.create({ data: {
    orderId: order.id, assignmentKind: "rider", riderProfileId: profile.id, status: "failed",
    custodyState: "rider", assignedBy: "admin-commerce", assignedAt: new Date(), pickedUpAt: new Date(),
    failedAt: new Date(), failureReasonCode: "customer_unavailable",
  } });
  await assert.rejects(() => c.deliveryJob.update({ where: { id: job.id }, data: { status: "unassigned" } }));
});
