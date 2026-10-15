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
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

function models() {
  const client = db as Database & {
    riderProfile?: any;
    deliveryJob?: any;
    deliveryJobEvent?: any;
    deliveryProvider?: any;
  };
  assert.ok(client.riderProfile, "RiderProfile Prisma model is missing");
  assert.ok(client.deliveryJob, "DeliveryJob Prisma model is missing");
  assert.ok(client.deliveryJobEvent, "DeliveryJobEvent Prisma model is missing");
  assert.ok(client.deliveryProvider, "DeliveryProvider Prisma model is missing");
  return {
    rider: client.riderProfile,
    job: client.deliveryJob,
    event: client.deliveryJobEvent,
    provider: client.deliveryProvider,
  };
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Dispatch/rider schema tests require an isolated *variety_foundation_test database");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
});

after(async () => { await app?.close(); });

test("dispatch authority persists rider profiles and permits only one active job per order", async () => {
  const { rider, job } = models();
  await db.user.upsert({
    where: { id: "rider-schema-a" },
    update: { active: true, role: "rider" },
    create: {
      id: "rider-schema-a", email: "rider-schema-a@example.test", name: "Kojo Rider",
      passwordHash: "test-only", role: "rider", active: true,
    },
  });
  const profile = await rider.create({ data: {
    userId: "rider-schema-a", phone: "+233240000101", kind: "in_house",
    vehicle: "Motorbike GR-101", zones: ["zone-required"], isAvailable: true,
  } });
  assert.equal(profile.isAvailable, true);
  await assert.rejects(() => rider.create({ data: {
    userId: "rider-schema-a", phone: "+233240000102", kind: "in_house",
    vehicle: "Motorbike GR-102", zones: [], isAvailable: true,
  } }));

  const order = await db.order.create({ data: {
    id: "dispatch-schema-order", reference: "VG-DISPATCH-SCHEMA", customerUserId: "customer-a",
    customerName: "Ama Customer", customerPhone: "+233241111111", fulfilment: "delivery",
    paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", fulfilmentStatus: "dispatched",
    deliveryStatus: "unassigned", subtotalMinor: 1000, totalMinor: 1000,
    verificationKeyVersion: 1, verificationCodeHash: "d".repeat(64), stockConsumedAt: new Date(),
  } });
  const created = await job.create({ data: {
    orderId: order.id, assignmentKind: "rider", riderUserId: profile.userId,
    status: "assigned", assignedAt: new Date(), createdBy: "admin-commerce",
  } });
  assert.equal(created.status, "assigned");
  await assert.rejects(() => job.create({ data: {
    orderId: order.id, assignmentKind: "manual", status: "assigned", createdBy: "admin-commerce",
  } }));
});

test("delivery job events are append-only custody history and contain no cash/remittance ledger", async () => {
  const { job, event } = models();
  const existing = await job.findUniqueOrThrow({ where: { orderId: "dispatch-schema-order" } });
  const row = await event.create({ data: {
    jobId: existing.id, actorId: "admin-commerce", actorKind: "staff", action: "assigned",
    note: "Dispatch assignment created after fulfilment handover.",
  } });
  assert.equal(row.action, "assigned");
  await assert.rejects(() => event.update({ where: { id: row.id }, data: { action: "tampered" } }));
  await assert.rejects(() => event.delete({ where: { id: row.id } }));

  const encoded = JSON.stringify(existing);
  for (const forbidden of ["cashCollectedAt", "remittedAt", "pendingRemittance", "amountMinor"])
    assert.equal(encoded.includes(forbidden), false);
});

test("delivery providers persist honest connectivity state without invented booking data", async () => {
  const { provider } = models();
  const row = await provider.create({ data: {
    id: "provider-manual-test", name: "Manual courier", capabilities: ["manual_booking"],
    status: "not_connected", notes: "Manual booking only", isConfigured: false,
  } });
  assert.equal(row.status, "not_connected");
  assert.equal(row.isConfigured, false);
});
