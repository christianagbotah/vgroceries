import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

let appA: INestApplication;
let appB: INestApplication;
let db: Database;
let baseA: string;
let baseB: string;

async function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

async function native(base: string, email: string) {
  const result = await post(base, "/auth/sessions", {
    email,
    password: commerceTestPassword,
    client: "native",
  }, { origin: "http://localhost:3000" });
  assert.equal(result.response.status, 201);
  return result.body.data.accessToken as string;
}

async function createOperationalOrder(input: { id: string; status: "picking" | "packed" }) {
  const order = await db.order.create({
    data: {
      id: input.id,
      reference: `VG-RACE-${input.id}`,
      customerUserId: "customer-a",
      customerName: "Ama Customer",
      customerPhone: "+233241111111",
      fulfilment: "delivery",
      zoneId: "zone-required",
      paymentMethod: "cash_on_delivery",
      paymentStatus: "unpaid",
      fulfilmentStatus: input.status,
      deliveryStatus: "unassigned",
      subtotalMinor: 1000,
      totalMinor: 1000,
      verificationKeyVersion: 1,
      verificationCodeHash: "e".repeat(64),
      lines: {
        create: {
          id: `${input.id}-line-rice`,
          variantId: "var-rice",
          productId: "product-rice",
          productName: "Fixture Rice",
          variantName: "Weighted rice",
          unit: "kg",
          quantity: "2",
          unitPriceMinor: 500,
          lineTotalMinor: 1000,
        },
      },
    },
  });
  const reservation = await db.reservation.create({
    data: {
      id: `${input.id}-reservation-rice`,
      positionId: "pos-rice",
      lotId: "lot-rice",
      claimType: "order",
      claimId: order.id,
      claimLineId: `${input.id}-line-rice`,
      generation: 1,
      quantity: "2",
      state: "active",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const now = new Date();
  const run = await db.fulfilmentRun.create({
    data: {
      orderId: order.id,
      locationId: "loc_accra",
      confirmedBy: "admin-commerce",
      confirmedAt: now,
      pickingStartedBy: "admin-commerce",
      pickingStartedAt: now,
      packedBy: input.status === "packed" ? "admin-commerce" : undefined,
      packedAt: input.status === "packed" ? now : undefined,
      packNote: input.status === "packed" ? "sealed" : undefined,
    },
  });
  await db.fulfilmentPick.create({
    data: {
      fulfilmentRunId: run.id,
      orderId: order.id,
      orderLineId: `${input.id}-line-rice`,
      reservationId: reservation.id,
      lotId: "lot-rice",
      variantId: "var-rice",
      quantity: "2",
      pickedQuantity: "2",
      state: "picked",
      recordedBy: "admin-commerce",
      recordedAt: now,
    },
  });
  return { order, reservation };
}

before(async () => {
  appA = await createApplication();
  appB = await createApplication();
  await appA.listen(0, "127.0.0.1");
  await appB.listen(0, "127.0.0.1");
  baseA = await appA.getUrl();
  baseB = await appB.getUrl();
  db = appA.get(Database);
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
});

after(async () => {
  await appA.close();
  await appB.close();
});

test("two API instances racing handover consume physical stock exactly once", async () => {
  const fixture = await createOperationalOrder({ id: "fulfilment-race-handover", status: "packed" });
  const admin = await native(baseA, "admin-commerce@example.test");
  const path = `/admin/fulfilment/orders/${fixture.order.id}/handover`;

  const [left, right] = await Promise.all([
    post(baseA, path, { note: "first gate" }, { authorization: `Bearer ${admin}`, "idempotency-key": "race-handover-a-001" }),
    post(baseB, path, { note: "second gate" }, { authorization: `Bearer ${admin}`, "idempotency-key": "race-handover-b-001" }),
  ]);

  const statuses = [left.response.status, right.response.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 409]);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), "18");
  assert.equal(await db.stockDepletion.count({ where: { claimId: fixture.order.id } }), 1);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "consumed");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).fulfilmentStatus, "dispatched");
});

test("packing racing cancellation never leaves a cancelled order packed or mutates physical stock", async () => {
  const fixture = await createOperationalOrder({ id: "fulfilment-race-pack-cancel", status: "picking" });
  const admin = await native(baseA, "admin-commerce@example.test");
  const customer = await native(baseB, "customer-a@example.test");

  const [pack, cancel] = await Promise.all([
    post(baseA, `/admin/fulfilment/orders/${fixture.order.id}/pack`, { note: "sealed" }, {
      authorization: `Bearer ${admin}`,
      "idempotency-key": "race-pack-001",
    }),
    post(baseB, `/account/orders/${fixture.order.id}/cancel`, { reason: "Changed mind" }, {
      authorization: `Bearer ${customer}`,
      origin: "http://localhost:3000",
    }),
  ]);

  assert.equal(cancel.response.status, 200);
  assert.ok([200, 409].includes(pack.response.status));
  const order = await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
  assert.equal(order.fulfilmentStatus, "cancelled");
  assert.equal(order.stockConsumedAt, null);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), "20");
  assert.equal(await db.reservation.count({ where: { claimId: fixture.order.id, state: "active" } }), 0);
  assert.equal(await db.stockDepletion.count({ where: { claimId: fixture.order.id } }), 0);
});

test("handover racing cancellation resolves to exactly one irreversible winner", async () => {
  const fixture = await createOperationalOrder({ id: "fulfilment-race-cancel-handover", status: "packed" });
  const admin = await native(baseA, "admin-commerce@example.test");
  const customer = await native(baseB, "customer-a@example.test");

  const [handover, cancel] = await Promise.all([
    post(baseA, `/admin/fulfilment/orders/${fixture.order.id}/handover`, { note: "dispatch" }, {
      authorization: `Bearer ${admin}`,
      "idempotency-key": "race-cancel-handover-001",
    }),
    post(baseB, `/account/orders/${fixture.order.id}/cancel`, { reason: "Stop delivery" }, {
      authorization: `Bearer ${customer}`,
      origin: "http://localhost:3000",
    }),
  ]);

  assert.equal([handover.response.status, cancel.response.status].filter((status) => status === 200).length, 1);
  const order = await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
  const lot = await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } });
  const reservation = await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } });

  if (order.fulfilmentStatus === "dispatched") {
    assert.equal(lot.quantity.toString(), "18");
    assert.equal(reservation.state, "consumed");
    assert.ok(order.stockConsumedAt);
    assert.equal(await db.stockDepletion.count({ where: { claimId: fixture.order.id } }), 1);
    assert.equal(cancel.response.status, 409);
  } else {
    assert.equal(order.fulfilmentStatus, "cancelled");
    assert.equal(lot.quantity.toString(), "20");
    assert.equal(reservation.state, "released");
    assert.equal(order.stockConsumedAt, null);
    assert.equal(await db.stockDepletion.count({ where: { claimId: fixture.order.id } }), 0);
    assert.equal(handover.response.status, 409);
  }
});
