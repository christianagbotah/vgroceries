import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { PaymentOutcomeService } from "../src/payments/payment-outcome.service";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";

let app: INestApplication;
let base = "";
let db: Database;
let outcomes: PaymentOutcomeService;
let fake: FakePaymentProvider;

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
    throw Error("Payment cancellation tests require an isolated *variety_foundation_test database");
  if (app) await app.close();
  fake = new FakePaymentProvider();
  app = await createApplication(config(), [fake]);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  outcomes = app.get(PaymentOutcomeService);
  await seedCommerceFixtures(db);
});
after(async () => { await app?.close(); });

async function postJson(path: string, body: unknown, headers: Record<string,string> = {}) {
  const response = await fetch(base + "/api/v1" + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { response, body: await response.json() };
}
async function getJson(path: string, headers: Record<string,string> = {}) {
  const response = await fetch(base + "/api/v1" + path, { headers });
  return { response, body: await response.json() };
}
async function customer() {
  const login = await postJson("/auth/sessions", { email: "customer-a@example.test", password: commerceTestPassword, client: "native" }, { origin: "http://localhost:3000" });
  assert.equal(login.response.status, 201);
  return login.body.data.accessToken as string;
}
async function orderAndAttempt(token: string, label: string) {
  const order = await postJson("/checkout/complete", {
    lines: [{ variantId: "var-salt", quantity: "1" }], customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: "mobile_money",
  }, { authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `pc-order-${label}` });
  assert.equal(order.response.status, 201);
  const orderId = order.body.data.orderId as string;
  const initiated = await postJson(`/orders/${orderId}/payment-attempts`, {}, {
    authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `pc-pay-${label}`,
  });
  assert.equal(initiated.response.status, 201);
  const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: initiated.body.data.attemptId } });
  return { order, orderId, attempt };
}
async function cancel(token: string, orderId: string, reason = "Changed my mind") {
  return postJson(`/account/orders/${orderId}/cancel`, { reason }, { authorization: `Bearer ${token}`, origin: "http://localhost:3000" });
}

test("live payment attempts block cancellation while failed and expired attempts release safely", async () => {
  const token = await customer();
  for (const live of ["initiated", "pending"] as const) {
    const created = await orderAndAttempt(token, `live-${live}`);
    await db.paymentAttempt.update({ where: { id: created.attempt.id }, data: { status: live, initiationState: live === "pending" ? "accepted" : "created", version: { increment: 1 } } });
    const blocked = await cancel(token, created.orderId);
    assert.equal(blocked.response.status, 422);
    assert.equal(blocked.body.error.code, "RULE_VIOLATION");
    assert.ok(String(blocked.body.error.message).toLowerCase().includes("reconcil"));
    assert.ok(await db.reservation.count({ where: { claimId: created.orderId, state: "active" } }));
    assert.notEqual((await db.order.findUniqueOrThrow({ where: { id: created.orderId } })).fulfilmentStatus, "cancelled");
    await db.paymentAttempt.update({ where: { id: created.attempt.id }, data: { status: "failed", initiationState: "rejected", resolvedAt: new Date(), version: { increment: 1 } } });
    await db.order.update({ where: { id: created.orderId }, data: { paymentStatus: "failed" } });
    assert.equal((await cancel(token, created.orderId)).response.status, 200);
  }

  const expired = await orderAndAttempt(token, "terminal-expired");
  await db.paymentAttempt.update({ where: { id: expired.attempt.id }, data: { status: "expired", resolvedAt: new Date(), version: { increment: 1 } } });
  await db.order.update({ where: { id: expired.orderId }, data: { paymentStatus: "expired" } });
  assert.equal((await cancel(token, expired.orderId)).response.status, 200);

  const captured = await orderAndAttempt(token, "captured-attempt");
  await db.paymentAttempt.update({ where: { id: captured.attempt.id }, data: { status: "succeeded", resolvedAt: new Date(), version: { increment: 1 } } });
  // Deliberately leave the order row pending: cancellation must trust the durable
  // attempt authority too, not only the denormalized Order.paymentStatus field.
  const refused = await cancel(token, captured.orderId);
  assert.equal(refused.response.status, 422);
  assert.ok(String(refused.body.error.message).toLowerCase().includes("refund"));
  assert.ok(await db.reservation.count({ where: { claimId: captured.orderId, state: "active" } }));
});

test("verified success racing cancellation serializes to paid order and refused cancellation", async () => {
  const token = await customer();
  const created = await orderAndAttempt(token, "success-cancel-race");

  let unlock!: () => void;
  let locked!: () => void;
  const gate = new Promise<void>((resolve) => { unlock = resolve; });
  const ready = new Promise<void>((resolve) => { locked = resolve; });
  const holder = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${created.orderId} FOR UPDATE`;
    locked();
    await gate;
  });
  await ready;

  const cancellation = cancel(token, created.orderId, "Race cancellation");
  await new Promise((resolve) => setTimeout(resolve, 25));
  const success = db.$transaction((tx) => outcomes.apply(tx, created.attempt.id, {
    providerId: "fake",
    merchantReference: created.attempt.merchantReference,
    providerReference: created.attempt.providerRef ?? undefined,
    state: "succeeded",
    amountMinor: created.attempt.amountMinor,
    currency: "GHS",
  }, { actorId: "payment-provider", requestId: "payment-cancel-race", source: "provider_event" }), { timeout: 15_000 });

  unlock();
  await holder;
  const [cancelled, paid] = await Promise.all([cancellation, success]);
  assert.equal(cancelled.response.status, 422);
  assert.equal(paid.attemptStatus, "succeeded");
  const order = await db.order.findUniqueOrThrow({ where: { id: created.orderId } });
  assert.equal(order.paymentStatus, "succeeded");
  assert.notEqual(order.fulfilmentStatus, "cancelled");
  assert.ok(await db.reservation.count({ where: { claimId: created.orderId, state: "active" } }));
});

test("owner and tracking projections expose durable customer-safe payment attempts only", async () => {
  const token = await customer();
  const created = await orderAndAttempt(token, "safe-projection");
  await db.paymentAttempt.update({
    where: { id: created.attempt.id },
    data: {
      status: "failed", initiationState: "rejected", settlementState: "exception",
      failureCode: "RAW_PROVIDER_DIAGNOSTIC_42", failureReason: "Payment request was declined.",
      callbackCount: 3, resolvedAt: new Date(), version: { increment: 1 },
    },
  });
  await db.order.update({ where: { id: created.orderId }, data: { paymentStatus: "failed" } });
  await db.paymentReconciliation.create({ data: {
    paymentAttemptId: created.attempt.id, provider: "fake", trigger: "staff", observedState: "failed",
    providerRef: created.attempt.providerRef, observedAmountMinor: created.attempt.amountMinor, observedCurrency: "GHS",
    result: "exception", safeNote: "Internal reconciliation note", requestId: "projection-internal",
  } });

  const owner = await getJson(`/orders/${created.orderId}`, { authorization: `Bearer ${token}` });
  assert.equal(owner.response.status, 200);
  assert.equal(owner.body.data.paymentAttempts.length, 1);
  const payment = owner.body.data.paymentAttempts[0];
  assert.equal(payment.id, created.attempt.id);
  assert.equal(payment.method, "mobile_money");
  assert.equal(payment.status, "failed");
  assert.equal(payment.amountMinor, created.attempt.amountMinor);
  assert.equal(payment.amountLabel, `₵${(created.attempt.amountMinor / 100).toFixed(2)}`);
  assert.equal(payment.callbackCount, 3);
  assert.equal(payment.settlementState, "exception");
  assert.equal(payment.failureReason, "Payment request was declined.");
  assert.ok(payment.createdAt);
  assert.equal(payment.providerRef, undefined);

  const ownerText = JSON.stringify(owner.body.data);
  for (const forbidden of [created.attempt.merchantReference, created.attempt.providerRef!, "RAW_PROVIDER_DIAGNOSTIC_42", "Internal reconciliation note", "projection-internal", "rawBodyHash", "safeMetadata"])
    if (forbidden) assert.equal(ownerText.includes(forbidden), false);

  const tracked = await postJson("/orders/track", { reference: created.order.body.data.reference, code: created.order.body.data.verificationCode });
  assert.equal(tracked.response.status, 200);
  assert.deepEqual(tracked.body.data.paymentAttempts, owner.body.data.paymentAttempts);
});
