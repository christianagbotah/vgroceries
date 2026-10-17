import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { DispatchEventService } from "../src/dispatch/dispatch-event.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication; let db: Database; let jobId = ""; let orderId = "";
const config = () => readConfig({ DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000", API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true", COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440", ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({1:"11".repeat(32)}) });

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated database required");
  app = await createApplication(config()); db = app.get(Database); await seedCommerceFixtures(db);
  const rider = await db.user.create({ data: { email: "event-rider@example.test", name: "Event Rider", passwordHash: "x", role: "rider" } });
  const profile = await db.riderProfile.create({ data: { userId: rider.id, phone: "+233241234570", kind: "in_house", vehicle: "motorcycle", availabilityState: "available", lastAvailabilityChangedAt: new Date() } });
  const order = await db.order.create({ data: { reference: "VG-DISPATCH-EVENT", customerUserId: "customer-a", customerName: "Ama", customerPhone: "+233241111111", fulfilment: "delivery", zoneId: "zone-required", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "dispatched", deliveryStatus: "assigned", subtotalMinor: 1000, deliveryFeeMinor: 100, totalMinor: 1100, verificationKeyVersion: 1, verificationCodeHash: "c".repeat(64), stockConsumedAt: new Date() } });
  orderId = order.id;
  await db.fulfilmentRun.create({ data: { orderId, locationId: "loc_accra", handedOverBy: "admin-commerce", handedOverAt: new Date(), handoverKind: "dispatch" } });
  jobId = (await db.deliveryJob.create({ data: { orderId, assignmentKind: "rider", riderProfileId: profile.id, status: "assigned", custodyState: "dispatch", assignedBy: "admin-commerce", assignedAt: new Date() } })).id;
});
after(async()=>{ await app?.close(); });

test("delivery transition writes delivery order audit and outbox history atomically", async () => {
  const service = new DispatchEventService();
  await db.$transaction((tx) => service.recordTransition(tx, { deliveryJobId: jobId, orderId, actorKind: "staff", actorId: "admin-commerce", action: "assigned", fromStatus: "unassigned", toStatus: "assigned", note: "assigned safely", safeMetadata: { assignmentKind: "rider" }, requestId: "req-event-1" }));
  assert.equal(await db.deliveryEvent.count({ where: { deliveryJobId: jobId } }), 1);
  assert.equal(await db.orderEvent.count({ where: { orderId, action: "delivery.assigned" } }), 1);
  assert.equal(await db.auditEvent.count({ where: { entityId: jobId, action: "delivery.assigned" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: orderId, type: "delivery.assigned" } }), 1);
  const outbox = await db.outboxEvent.findFirstOrThrow({ where: { aggregateId: orderId, type: "delivery.assigned" } });
  assert.equal((outbox.payload as Record<string, unknown>).requestId, "req-event-1");
});

test("operational delivery notes are customer-unsafe unless explicitly opted in", async () => {
  const service = new DispatchEventService();
  await db.$transaction((tx) => service.recordTransition(tx, {
    deliveryJobId: jobId,
    orderId,
    actorKind: "rider",
    actorId: "event-rider",
    action: "note",
    fromStatus: "assigned",
    toStatus: "assigned",
    note: "Gate security asked me to call dispatch",
    safeMetadata: {},
    requestId: "req-event-private-note",
  }));
  const event = await db.orderEvent.findFirstOrThrow({
    where: { orderId, action: "delivery.note" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(event.customerSafe, false);
});
