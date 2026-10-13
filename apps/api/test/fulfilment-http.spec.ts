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

async function createOrder(id: string) {
  const order = await db.order.create({
    data: {
      id,
      reference: `VG-HTTP-${id}`,
      customerUserId: "customer-a",
      customerName: "Ama Customer",
      customerPhone: "+233241111111",
      fulfilment: "delivery",
      paymentMethod: "mobile_money",
      paymentStatus: "succeeded",
      fulfilmentStatus: "awaiting_confirmation",
      deliveryStatus: "unassigned",
      subtotalMinor: 1000,
      totalMinor: 1000,
      verificationKeyVersion: 1,
      verificationCodeHash: "d".repeat(64),
      lines: {
        create: {
          id: `${id}-line-rice`,
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
      id: `${id}-reservation-rice`,
      positionId: "pos-rice",
      lotId: "lot-rice",
      claimType: "order",
      claimId: order.id,
      claimLineId: `${id}-line-rice`,
      generation: 1,
      quantity: "2",
      state: "active",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { order, reservation };
}

before(async () => {
  app = await createApplication();
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
});

after(async () => {
  await app.close();
});

test("administrator fulfilment reads are authenticated, role-restricted and bounded", async () => {
  await createOrder("fulfilment-http-read");
  const admin = await native("admin-commerce@example.test");
  const customer = await native("customer-a@example.test");

  assert.equal((await request("GET", "/admin/fulfilment")).response.status, 401);
  assert.equal((await request("GET", "/admin/fulfilment", { token: customer })).response.status, 403);

  const list = await request("GET", "/admin/fulfilment?page=1&perPage=1&status=awaiting_confirmation", { token: admin });
  assert.equal(list.response.status, 200);
  assert.equal(list.body.data.page, 1);
  assert.equal(list.body.data.perPage, 1);
  assert.equal(list.body.data.total, 1);
  assert.deepEqual(list.body.data.items[0].allowedActions, ["confirm"]);

  const invalid = await request("GET", "/admin/fulfilment?perPage=101", { token: admin });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, "VALIDATION_FAILED");
});

test("administrator can drive the exact seven-route fulfilment workflow with strict validation and replay protection", async () => {
  const fixture = await createOrder("fulfilment-http-flow");
  const admin = await native("admin-commerce@example.test");

  const noKey = await request("POST", `/admin/fulfilment/orders/${fixture.order.id}/confirm`, { token: admin, body: {} });
  assert.equal(noKey.response.status, 400);
  assert.equal(noKey.body.error.code, "VALIDATION_FAILED");

  const forged = await request("POST", `/admin/fulfilment/orders/${fixture.order.id}/confirm`, {
    token: admin,
    key: "fulfilment-http-forged-001",
    body: { actorId: "forged" },
  });
  assert.equal(forged.response.status, 400);

  const confirm = await request("POST", `/admin/fulfilment/orders/${fixture.order.id}/confirm`, {
    token: admin,
    key: "fulfilment-http-confirm-001",
    body: {},
  });
  assert.equal(confirm.response.status, 200);
  assert.equal(confirm.body.data.fulfilmentStatus, "confirmed");

  const confirmReplay = await request("POST", `/admin/fulfilment/orders/${fixture.order.id}/confirm`, {
    token: admin,
    key: "fulfilment-http-confirm-001",
    body: {},
  });
  assert.equal(confirmReplay.response.status, 200);
  assert.deepEqual(confirmReplay.body.data, confirm.body.data);

  const start = await request("POST", `/admin/fulfilment/orders/${fixture.order.id}/start-picking`, {
    token: admin,
    key: "fulfilment-http-start-001",
    body: {},
  });
  assert.equal(start.response.status, 200);
  assert.equal(start.body.data.fulfilmentStatus, "picking");

  const wrongPickMethod = await request("POST", `/admin/fulfilment/orders/${fixture.order.id}/picks/${fixture.reservation.id}`, {
    token: admin,
    key: "fulfilment-http-pick-wrong-method-001",
    body: { pickedQuantity: "2" },
  });
  assert.equal(wrongPickMethod.response.status, 404);

  const pick = await request("PUT", `/admin/fulfilment/orders/${fixture.order.id}/picks/${fixture.reservation.id}`, {
    token: admin,
    key: "fulfilment-http-pick-001",
    body: { pickedQuantity: "2" },
  });
  assert.equal(pick.response.status, 200);
  assert.equal(pick.body.data.fulfilmentStatus, "picking");

  const pack = await request("POST", `/admin/fulfilment/orders/${fixture.order.id}/pack`, {
    token: admin,
    key: "fulfilment-http-pack-001",
    body: { note: "sealed" },
  });
  assert.equal(pack.response.status, 200);
  assert.equal(pack.body.data.fulfilmentStatus, "packed");
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), "20");

  await db.paymentAttempt.create({
    data: {
      id: "fulfilment-http-capture",
      orderId: fixture.order.id,
      provider: "fake",
      method: "mobile_money",
      currency: "GHS",
      amountMinor: 1000,
      merchantReference: "FULFILMENT-HTTP-CAPTURE",
      providerRef: "FULFILMENT-HTTP-PROVIDER",
      status: "succeeded",
      initiationState: "accepted",
      settlementState: "settled",
      resolvedAt: new Date(),
    },
  });

  const handover = await request("POST", `/admin/fulfilment/orders/${fixture.order.id}/handover`, {
    token: admin,
    key: "fulfilment-http-handover-001",
    body: { note: "to dispatch" },
  });
  assert.equal(handover.response.status, 200);
  assert.equal(handover.body.data.fulfilmentStatus, "dispatched");
  assert.ok(handover.body.data.stockConsumedAt);
  assert.ok(handover.body.data.depletionId);

  const replay = await request("POST", `/admin/fulfilment/orders/${fixture.order.id}/handover`, {
    token: admin,
    key: "fulfilment-http-handover-001",
    body: { note: "to dispatch" },
  });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.data.depletionId, handover.body.data.depletionId);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), "18");
  assert.equal(await db.stockDepletion.count({ where: { claimId: fixture.order.id } }), 1);

  const detail = await request("GET", `/admin/fulfilment/orders/${fixture.order.id}`, { token: admin });
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.data.lines[0].reservations[0].lotNumber, "RICE");
  assert.deepEqual(detail.body.data.allowedActions, []);
  const encoded = JSON.stringify(detail.body.data);
  for (const secret of ["verificationCodeHash", "merchantReference", "providerRef", "rawBodyHash"])
    assert.equal(encoded.includes(secret), false);
});
