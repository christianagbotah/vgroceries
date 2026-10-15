import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let base: string;

async function request(
  method: string,
  path: string,
  input?: { token?: string; key?: string; body?: unknown },
) {
  const headers: Record<string, string> = {};
  if (input?.token) headers.authorization = `Bearer ${input.token}`;
  if (input?.key) headers["idempotency-key"] = input.key;
  if (input && Object.hasOwn(input, "body")) headers["content-type"] = "application/json";
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers,
    body: input && Object.hasOwn(input, "body") ? JSON.stringify(input.body) : undefined,
  });
  return { response, body: await response.json() };
}

async function native(email: string) {
  const response = await fetch(`${base}/api/v1/auth/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email, password: commerceTestPassword, client: "native" }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).data.accessToken as string;
}

async function seedRider(id = "rider-http-a", email = "rider-http-a@example.test") {
  const admin = await db.user.findUniqueOrThrow({ where: { id: "admin-commerce" } });
  await db.user.create({ data: {
    id,
    email,
    name: id === "rider-http-a" ? "Kojo Rider" : "Esi Rider",
    passwordHash: admin.passwordHash,
    role: "rider",
    active: true,
  } });
  return db.riderProfile.create({ data: {
    userId: id,
    phone: id === "rider-http-a" ? "+233240000201" : "+233240000202",
    kind: "in_house",
    vehicle: id === "rider-http-a" ? "Motorbike GR-201" : "Motorbike GR-202",
    zones: ["zone-required"],
    isAvailable: true,
  } });
}

async function createDeliveryOrder(id: string, input?: { handedOver?: boolean }) {
  const handedOver = input?.handedOver ?? true;
  return db.order.create({ data: {
    id,
    reference: `VG-DISPATCH-${id}`,
    customerUserId: "customer-a",
    customerName: "Ama Customer",
    customerPhone: "+233241111111",
    fulfilment: "delivery",
    zoneId: "zone-required",
    paymentMethod: "cash_on_delivery",
    paymentStatus: "unpaid",
    fulfilmentStatus: handedOver ? "dispatched" : "packed",
    deliveryStatus: "unassigned",
    subtotalMinor: 1000,
    deliveryFeeMinor: 1200,
    totalMinor: 2200,
    verificationKeyVersion: 1,
    verificationCodeHash: "d".repeat(64),
    stockConsumedAt: handedOver ? new Date() : null,
  } });
}

before(async () => {
  app = await createApplication();
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
  await seedRider();
});

after(async () => { await app.close(); });

test("dispatch queue is admin-only and assignment is impossible before fulfilment handover", async () => {
  const admin = await native("admin-commerce@example.test");
  const customer = await native("customer-a@example.test");
  const packed = await createDeliveryOrder("dispatch-http-packed", { handedOver: false });
  const ready = await createDeliveryOrder("dispatch-http-ready");

  assert.equal((await request("GET", "/dispatch/queue")).response.status, 401);
  assert.equal((await request("GET", "/dispatch/queue", { token: customer })).response.status, 403);

  const queue = await request("GET", "/dispatch/queue", { token: admin });
  assert.equal(queue.response.status, 200);
  assert.equal(queue.body.data.ready.some((row: { id: string }) => row.id === ready.id), true);
  assert.equal(queue.body.data.ready.some((row: { id: string }) => row.id === packed.id), false);

  const blocked = await request("POST", "/dispatch/assign", {
    token: admin,
    key: "dispatch-http-blocked-001",
    body: { orderId: packed.id, riderId: "rider-http-a" },
  });
  assert.equal(blocked.response.status, 409);
  assert.equal(blocked.body.error.code, "DISPATCH_HANDOVER_REQUIRED");
});

test("admin assignment is replay-safe and a rider cannot be double-booked", async () => {
  const admin = await native("admin-commerce@example.test");
  const first = await createDeliveryOrder("dispatch-http-first");
  const second = await createDeliveryOrder("dispatch-http-second");

  const assigned = await request("POST", "/dispatch/assign", {
    token: admin,
    key: "dispatch-http-assign-001",
    body: { orderId: first.id, riderId: "rider-http-a" },
  });
  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.body.data.status, "assigned");

  const replay = await request("POST", "/dispatch/assign", {
    token: admin,
    key: "dispatch-http-assign-001",
    body: { orderId: first.id, riderId: "rider-http-a" },
  });
  assert.equal(replay.response.status, 200);
  assert.deepEqual(replay.body.data, assigned.body.data);

  const busy = await request("POST", "/dispatch/assign", {
    token: admin,
    key: "dispatch-http-assign-002",
    body: { orderId: second.id, riderId: "rider-http-a" },
  });
  assert.equal(busy.response.status, 409);
  assert.equal(busy.body.error.code, "RIDER_BUSY");
});

test("rider job ownership comes from the authenticated session and lifecycle never changes stock or payment truth", async () => {
  const admin = await native("admin-commerce@example.test");
  const rider = await native("rider-http-a@example.test");
  await seedRider("rider-http-b", "rider-http-b@example.test");
  const otherRider = await native("rider-http-b@example.test");
  const order = await createDeliveryOrder("dispatch-http-lifecycle");

  const assigned = await request("POST", "/dispatch/assign", {
    token: admin,
    key: "dispatch-http-lifecycle-assign",
    body: { orderId: order.id, riderId: "rider-http-a" },
  });
  assert.equal(assigned.response.status, 200);
  const jobId = assigned.body.data.jobId as string;

  const own = await request("GET", "/rider/jobs", { token: rider });
  assert.equal(own.response.status, 200);
  assert.equal(own.body.data.jobs.some((job: { id: string }) => job.id === jobId), true);
  assert.equal((await request("GET", `/rider/jobs/${jobId}`, { token: otherRider })).response.status, 404);

  const stockBefore = await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } });
  const orderBefore = await db.order.findUniqueOrThrow({ where: { id: order.id } });

  for (const [action, key] of [
    ["accept", "dispatch-http-accept"],
    ["pickup", "dispatch-http-pickup"],
    ["out", "dispatch-http-out"],
  ] as const) {
    const result = await request("POST", `/rider/jobs/${jobId}/actions`, {
      token: rider,
      key,
      body: { action },
    });
    assert.equal(result.response.status, 200);
  }

  const noProof = await request("POST", `/rider/jobs/${jobId}/actions`, {
    token: rider,
    key: "dispatch-http-deliver-no-proof",
    body: { action: "deliver" },
  });
  assert.equal(noProof.response.status, 400);

  const delivered = await request("POST", `/rider/jobs/${jobId}/actions`, {
    token: rider,
    key: "dispatch-http-deliver",
    body: { action: "deliver", proofMethod: "pin", proofDetail: "4821" },
  });
  assert.equal(delivered.response.status, 200);
  assert.equal(delivered.body.data.status, "delivered");

  const stockAfter = await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } });
  const orderAfter = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(stockAfter.quantity.toString(), stockBefore.quantity.toString());
  assert.equal(orderAfter.stockConsumedAt?.toISOString(), orderBefore.stockConsumedAt?.toISOString());
  assert.equal(orderAfter.paymentStatus, "unpaid");
  assert.equal(orderAfter.deliveryStatus, "delivered");
});

test("rider actions reject client-selected rider identity", async () => {
  const admin = await native("admin-commerce@example.test");
  const rider = await native("rider-http-a@example.test");
  const order = await createDeliveryOrder("dispatch-http-forged-rider");
  const assigned = await request("POST", "/dispatch/assign", {
    token: admin,
    key: "dispatch-http-forged-assign",
    body: { orderId: order.id, riderId: "rider-http-a" },
  });
  const jobId = assigned.body.data.jobId as string;

  const forged = await request("POST", `/rider/jobs/${jobId}/actions`, {
    token: rider,
    key: "dispatch-http-forged-action",
    body: { action: "accept", riderId: "rider-http-b" },
  });
  assert.equal(forged.response.status, 400);
  assert.equal(forged.body.error.code, "VALIDATION_FAILED");
});
