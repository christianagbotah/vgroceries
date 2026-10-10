import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";

let app: INestApplication;
let second: INestApplication;
let base = "";
let db: Database;
let secondDb: Database;
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
    throw Error("Payment reconciliation tests require an isolated *variety_foundation_test database");
  if (second) await second.close();
  if (app) await app.close();
  fake = new FakePaymentProvider();
  app = await createApplication(config(), [fake]);
  second = await createApplication(config(), [new FakePaymentProvider()]);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  secondDb = second.get(Database);
  await seedCommerceFixtures(db);
});
after(async () => { await second?.close(); await app?.close(); });

async function postJson(path: string, body: unknown, headers: Record<string,string> = {}) {
  const response = await fetch(base + "/api/v1" + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const parsed = await response.json();
  return { response, body: parsed };
}
async function getJson(path: string, headers: Record<string,string> = {}) {
  const response = await fetch(base + "/api/v1" + path, { headers });
  const parsed = await response.json();
  return { response, body: parsed };
}
async function native(email: string) {
  const login = await postJson("/auth/sessions", { email, password: commerceTestPassword, client: "native" }, { origin: "http://localhost:3000" });
  assert.equal(login.response.status, 201);
  return login.body.data.accessToken as string;
}
async function admin() { return native("admin-commerce@example.test"); }
async function customer() { return native("customer-a@example.test"); }

async function createOrderAndAttempt(method: "mobile_money"|"card_hosted"|"bank_transfer" = "mobile_money", quantity = "1") {
  const token = await customer();
  const suffix = `${Date.now()}-${Math.random()}`.replace(".", "");
  const order = await postJson("/checkout/complete", {
    lines: [{ variantId: "var-salt", quantity }], customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: method,
  }, { authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `rec-order-${suffix}` });
  assert.equal(order.response.status, 201);
  const orderId = order.body.data.orderId as string;
  const initiated = await postJson(`/orders/${orderId}/payment-attempts`, {}, {
    authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `rec-pay-${suffix}`,
  });
  assert.equal(initiated.response.status, 201);
  const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: initiated.body.data.attemptId } });
  const orderRow = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  return { token, order: orderRow, attempt };
}

async function reconcile(attemptId: string, token: string) {
  return postJson(`/payments/${attemptId}/reconcile`, {}, { authorization: `Bearer ${token}`, origin: "http://localhost:3000" });
}

test("payments ledger and reconciliation are admin-only", async () => {
  const created = await createOrderAndAttempt();
  const customerToken = created.token;
  const customerList = await getJson("/payments", { authorization: `Bearer ${customerToken}` });
  assert.equal(customerList.response.status, 403);
  const customerReconcile = await reconcile(created.attempt.id, customerToken);
  assert.equal(customerReconcile.response.status, 403);

  const adminToken = await admin();
  assert.equal((await getJson("/payments", { authorization: `Bearer ${adminToken}` })).response.status, 200);
  assert.equal((await reconcile(created.attempt.id, adminToken)).response.status, 200);
});

test("staff ledger is bounded, filterable and exposes no payment internals or event metadata", async () => {
  const first = await createOrderAndAttempt("mobile_money");
  await db.paymentAttempt.update({ where: { id: first.attempt.id }, data: { status: "failed", initiationState: "rejected", settlementState: "exception", failureReason: "Customer-safe decline", resolvedAt: new Date(), version: { increment: 1 } } });
  await db.order.update({ where: { id: first.order.id }, data: { paymentStatus: "failed" } });
  const secondAttempt = await createOrderAndAttempt("bank_transfer");
  const adminToken = await admin();

  const page = await getJson("/payments?page=1&perPage=1", { authorization: `Bearer ${adminToken}` });
  assert.equal(page.response.status, 200);
  assert.equal(page.body.data.page, 1);
  assert.equal(page.body.data.perPage, 1);
  assert.equal(page.body.data.items.length, 1);
  assert.ok(page.body.data.total >= 2);
  const serialized = JSON.stringify(page.body.data.items[0]);
  for (const secretField of ["merchantReference","rawBodyHash","safeMetadata","dedupeKey","requestHash","idempotencyKey","signature"]) assert.equal(serialized.includes(secretField), false);

  const byStatus = await getJson("/payments?status=failed&settlementState=exception&provider=fake&method=mobile_money", { authorization: `Bearer ${adminToken}` });
  assert.equal(byStatus.response.status, 200);
  assert.equal(byStatus.body.data.items.length, 1);
  assert.equal(byStatus.body.data.items[0].attemptId, first.attempt.id);
  assert.equal(byStatus.body.data.items[0].failureReason, "Customer-safe decline");

  const byOrder = await getJson(`/payments?orderReference=${encodeURIComponent(secondAttempt.order.reference)}`, { authorization: `Bearer ${adminToken}` });
  assert.equal(byOrder.response.status, 200);
  assert.equal(byOrder.body.data.items.length, 1);
  assert.equal(byOrder.body.data.items[0].attemptId, secondAttempt.attempt.id);
  const now = new Date();
  const from = new Date(now.getTime() - 3600000).toISOString();
  const to = new Date(now.getTime() + 3600000).toISOString();
  const dated = await getJson(`/payments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { authorization: `Bearer ${adminToken}` });
  assert.equal(dated.response.status, 200);
  assert.ok(dated.body.data.items.length >= 2);
  assert.equal((await getJson("/payments?perPage=101", { authorization: `Bearer ${adminToken}` })).response.status, 400);
});

test("authoritative matching lookup reconciles once and repeat reconciliation does not duplicate financial effects", async () => {
  const { order, attempt } = await createOrderAndAttempt();
  fake.lookupResult = { providerId: "fake", merchantReference: attempt.merchantReference, providerReference: attempt.providerRef ?? undefined, state: "succeeded", amountMinor: attempt.amountMinor, currency: "GHS" };
  const adminToken = await admin();
  const first = await reconcile(attempt.id, adminToken);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.data.result, "matched");
  let stored = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(stored.status, "succeeded");
  assert.equal(stored.settlementState, "reconciled");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, "succeeded");
  assert.equal(await db.outboxEvent.count({ where: { type: "payment.succeeded", aggregateId: attempt.id } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { type: "payment.reconciled", aggregateId: attempt.id } }), 1);

  const repeat = await reconcile(attempt.id, adminToken);
  assert.equal(repeat.response.status, 200);
  assert.equal(repeat.body.data.result, "matched");
  stored = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(stored.settlementState, "reconciled");
  assert.equal(await db.outboxEvent.count({ where: { type: "payment.succeeded", aggregateId: attempt.id } }), 1);
  assert.ok(await db.paymentReconciliation.count({ where: { paymentAttemptId: attempt.id } }) >= 2);
});

test("lookup occurs before reconciliation locks and stale snapshot is rejected after a second instance changes the attempt", async () => {
  const { order, attempt } = await createOrderAndAttempt();
  let lookupRan = false;
  fake.lookupHandler = async (input) => {
    lookupRan = true;
    await secondDb.paymentAttempt.update({ where: { id: attempt.id }, data: { failureReason: "concurrent observation", version: { increment: 1 } } });
    return { providerId: "fake", merchantReference: input.merchantReference, providerReference: input.providerReference, state: "succeeded", amountMinor: attempt.amountMinor, currency: "GHS" };
  };
  const adminToken = await admin();
  const result = await reconcile(attempt.id, adminToken);
  assert.equal(result.response.status, 200);
  assert.equal(lookupRan, true);
  assert.equal(result.body.data.result, "exception");
  const stored = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.notEqual(stored.status, "succeeded");
  assert.equal(stored.settlementState, "exception");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, "requires_review");
  assert.equal((await db.paymentReconciliation.findFirstOrThrow({ where: { paymentAttemptId: attempt.id }, orderBy: { createdAt: "desc" } })).result, "exception");
});

test("authoritative amount mismatch becomes reconciliation exception without success", async () => {
  const { order, attempt } = await createOrderAndAttempt();
  fake.lookupResult = { providerId: "fake", merchantReference: attempt.merchantReference, providerReference: attempt.providerRef ?? undefined, state: "succeeded", amountMinor: attempt.amountMinor + 1, currency: "GHS" };
  const result = await reconcile(attempt.id, await admin());
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.result, "exception");
  const stored = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.notEqual(stored.status, "succeeded");
  assert.equal(stored.settlementState, "exception");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, "requires_review");
  assert.equal(await db.outboxEvent.count({ where: { type: "payment.succeeded", aggregateId: attempt.id } }), 0);
});

test("no-record lookup for uncertain initiation remains an explicit exception and never guesses payment failure/success", async () => {
  const { order, attempt } = await createOrderAndAttempt();
  await db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "initiated", initiationState: "uncertain", settlementState: "exception", version: { increment: 1 } } });
  fake.lookupResult = { providerId: "fake", merchantReference: attempt.merchantReference, providerReference: attempt.providerRef ?? undefined, state: "unknown" };
  const result = await reconcile(attempt.id, await admin());
  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.result, "exception");
  const stored = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(stored.status, "initiated");
  assert.equal(stored.initiationState, "uncertain");
  assert.equal(stored.settlementState, "exception");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, "requires_review");
  assert.equal(await db.outboxEvent.count({ where: { type: "payment.succeeded", aggregateId: attempt.id } }), 0);
});
