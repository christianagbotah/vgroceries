import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";
import { FakeRefundProvider } from "./fake-refund-provider";

let app: INestApplication;
let db: Database;
let base = "";

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  PAYMENT_PROVIDER_ID: "fake", PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted,bank_transfer",
  PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "1000",
  PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "pay.example.test",
});

beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Refund cancellation tests require an isolated *variety_foundation_test database");
  if (app) await app.close();
  app = await createApplication(config(), [new FakePaymentProvider()], [new FakeRefundProvider()]);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  await seedCommerceFixtures(db);
});
after(async () => { await app?.close(); });

async function post(path: string, body: unknown, headers: Record<string,string> = {}) {
  const response = await fetch(base + "/api/v1" + path, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}
async function customer() {
  const login = await post("/auth/sessions", { email: "customer-a@example.test", password: commerceTestPassword, client: "native" }, { origin: "http://localhost:3000" });
  assert.equal(login.response.status, 201);
  return login.body.data.accessToken as string;
}
async function electronicOrder(token: string, label: string) {
  const order = await post("/checkout/complete", {
    lines: [{ variantId: "var-salt", quantity: "1" }], customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: "mobile_money",
  }, { authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `refund-order-${label}` });
  assert.equal(order.response.status, 201);
  const orderId = order.body.data.orderId as string;
  const attempt = await post(`/orders/${orderId}/payment-attempts`, {}, {
    authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `refund-pay-${label}`,
  });
  assert.equal(attempt.response.status, 201);
  return { orderId, attemptId: attempt.body.data.attemptId as string };
}
async function markSucceeded(orderId: string, attemptId: string) {
  await db.paymentAttempt.update({ where: { id: attemptId }, data: {
    status: "succeeded", initiationState: "accepted", settlementState: "unsettled", resolvedAt: new Date(), version: { increment: 1 },
  } });
  await db.order.update({ where: { id: orderId }, data: { paymentStatus: "succeeded" } });
}
async function cancel(token: string, orderId: string, reason = "Changed my mind") {
  return post(`/account/orders/${orderId}/cancel`, { reason }, { authorization: `Bearer ${token}`, origin: "http://localhost:3000" });
}

test("successful capture cancellation creates atomic refund obligation before releasing stock", async () => {
  const token = await customer();
  const created = await electronicOrder(token, "paid");
  await markSucceeded(created.orderId, created.attemptId);
  const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: created.attemptId } });

  const result = await cancel(token, created.orderId, "  Customer   changed mind  ");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.fulfilmentStatus, "cancelled");

  const order = await db.order.findUniqueOrThrow({ where: { id: created.orderId } });
  assert.equal(order.fulfilmentStatus, "cancelled");
  assert.equal(order.paymentStatus, "refund_pending");
  assert.equal(order.cancelledReason, "Customer changed mind");
  assert.equal(await db.reservation.count({ where: { claimId: created.orderId, state: "active" } }), 0);

  const refunds = await db.refund.findMany({ where: { orderId: created.orderId } });
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].paymentAttemptId, created.attemptId);
  assert.equal(refunds[0].amountMinor, attempt.amountMinor);
  assert.equal(refunds[0].sourceType, "customer_cancellation");
  assert.equal(refunds[0].status, "awaiting_approval");
  assert.equal(await db.refundExecution.count({ where: { refundId: refunds[0].id } }), 0);
  assert.equal(await db.auditEvent.count({ where: { entityId: refunds[0].id, action: "refund.requested" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: refunds[0].id, type: "refund.requested" } }), 1);
  assert.equal(await db.orderEvent.count({ where: { orderId: created.orderId, action: "order.cancelled_with_refund" } }), 1);
});

test("same-reason cancelled replay creates only a newly missing refund after late stale success", async () => {
  const token = await customer();
  const created = await electronicOrder(token, "late-success");
  await db.paymentAttempt.update({ where: { id: created.attemptId }, data: {
    status: "failed", initiationState: "rejected", resolvedAt: new Date(), version: { increment: 1 },
  } });
  await db.order.update({ where: { id: created.orderId }, data: { paymentStatus: "failed" } });

  const first = await cancel(token, created.orderId, "No longer needed");
  assert.equal(first.response.status, 200);
  assert.equal(await db.refund.count({ where: { orderId: created.orderId } }), 0);

  const stale = await db.paymentAttempt.create({ data: {
    orderId: created.orderId, provider: "fake", method: "mobile_money", currency: "GHS",
    amountMinor: (await db.order.findUniqueOrThrow({ where: { id: created.orderId } })).totalMinor,
    merchantReference: "LATE-CANCEL-STALE-1", providerRef: "LATE-CANCEL-PROV-1",
    status: "succeeded", initiationState: "accepted", settlementState: "unsettled", resolvedAt: new Date(),
  } });

  const replay = await cancel(token, created.orderId, "  No   longer needed ");
  assert.equal(replay.response.status, 200);
  const refunds = await db.refund.findMany({ where: { orderId: created.orderId } });
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].paymentAttemptId, stale.id);
  assert.equal(refunds[0].amountMinor, stale.amountMinor);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: created.orderId } })).paymentStatus, "refund_pending");

  assert.equal((await cancel(token, created.orderId, "No longer needed")).response.status, 200);
  assert.equal(await db.refund.count({ where: { orderId: created.orderId } }), 1);
  assert.equal((await cancel(token, created.orderId, "Different reason")).response.status, 409);
});

test("live payment and handover protections block paid cancellation without refund obligations", async () => {
  const token = await customer();
  const live = await electronicOrder(token, "live");
  assert.equal((await cancel(token, live.orderId)).response.status, 422);
  assert.equal(await db.refund.count({ where: { orderId: live.orderId } }), 0);

  for (const state of ["dispatched", "delivered", "collected"] as const) {
    const created = await electronicOrder(token, `handover-${state}`);
    await markSucceeded(created.orderId, created.attemptId);
    await db.order.update({ where: { id: created.orderId }, data: { fulfilmentStatus: state } });
    assert.equal((await cancel(token, created.orderId)).response.status, 409);
    assert.equal(await db.refund.count({ where: { orderId: created.orderId } }), 0);
  }
  const consumed = await electronicOrder(token, "handover-consumed");
  await markSucceeded(consumed.orderId, consumed.attemptId);
  await db.order.update({ where: { id: consumed.orderId }, data: { stockConsumedAt: new Date() } });
  assert.equal((await cancel(token, consumed.orderId)).response.status, 409);
  assert.equal(await db.refund.count({ where: { orderId: consumed.orderId } }), 0);
});

test("refund audit/outbox failure rolls back paid cancellation refund and stock release together", async () => {
  const token = await customer();
  const created = await electronicOrder(token, "rollback");
  await markSucceeded(created.orderId, created.attemptId);
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_refund_requested_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='refund.requested' THEN RAISE EXCEPTION 'refund requested outbox fault'; END IF; RETURN NEW; END; $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_refund_requested_outbox BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION reject_refund_requested_outbox()`);
  try {
    const failed = await cancel(token, created.orderId, "Rollback me");
    assert.equal(failed.response.status, 500);
    const order = await db.order.findUniqueOrThrow({ where: { id: created.orderId } });
    assert.notEqual(order.fulfilmentStatus, "cancelled");
    assert.equal(order.paymentStatus, "succeeded");
    assert.equal(await db.refund.count({ where: { orderId: created.orderId } }), 0);
    assert.ok(await db.reservation.count({ where: { claimId: created.orderId, state: "active" } }));
    assert.equal(await db.orderEvent.count({ where: { orderId: created.orderId, action: "order.cancelled_with_refund" } }), 0);
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER reject_refund_requested_outbox ON "OutboxEvent"`);
    await db.$executeRawUnsafe(`DROP FUNCTION reject_refund_requested_outbox()`);
  }
});
