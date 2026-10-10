import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { readConfig } from "../src/config";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";

let app: INestApplication;
let base = "";
let db: Database;
let fake: FakePaymentProvider;

const env = (timeoutMs = 5000) => ({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  PAYMENT_PROVIDER_ID: "fake", PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted,bank_transfer",
  PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: String(timeoutMs),
  PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "pay.example.test",
});

async function restart(timeoutMs = 5000) {
  if (app) await app.close();
  fake = new FakePaymentProvider();
  app = await createApplication(readConfig(env(timeoutMs)), [fake]);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  await seedCommerceFixtures(db);
}

beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Payment initiation tests require an isolated *variety_foundation_test database");
  await restart();
});
after(async () => { await app?.close(); });

async function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(base + "/api/v1" + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const parsed = await response.json();
  return { response, body: parsed };
}

async function native(email = "customer-a@example.test") {
  const x = await request("/auth/sessions", { email, password: commerceTestPassword, client: "native" }, { origin: "http://localhost:3000" });
  assert.equal(x.response.status, 201);
  return x.body.data.accessToken as string;
}

async function createOrder(token: string, key: string, quantity = "2") {
  const x = await request("/checkout/complete", {
    lines: [{ variantId: "var-salt", quantity }],
    customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: "mobile_money",
  }, { authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": key });
  assert.equal(x.response.status, 201);
  return x.body.data.orderId as string;
}

async function initiate(orderId: string, token: string, key: string, body: unknown = {}) {
  return request(`/orders/${orderId}/payment-attempts`, body, {
    authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": key,
  });
}

function cookieParts(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  const parts = values.flatMap((value) => value.split(/,(?=\s*vg_)/)).map((value) => value.split(";")[0].trim()).filter(Boolean);
  return {
    cookie: parts.join("; "),
    csrf: parts.find((part) => part.startsWith("vg_guest_csrf="))?.slice("vg_guest_csrf=".length) ?? "",
  };
}

async function guestOrder() {
  const quote = await request("/checkout/quote", { lines: [{ variantId: "var-salt", quantity: "1" }] });
  assert.equal(quote.response.status, 200);
  const cookies = cookieParts(quote.response);
  assert.ok(cookies.cookie.includes("vg_guest="));
  assert.ok(cookies.csrf);
  const order = await request("/checkout/complete", {
    lines: [{ variantId: "var-salt", quantity: "1" }], customerName: "Guest Ama", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: "mobile_money",
  }, { cookie: cookies.cookie, origin: "http://localhost:3000", "x-csrf-token": cookies.csrf, "idempotency-key": "guest-order-0001" });
  assert.equal(order.response.status, 201);
  return { orderId: order.body.data.orderId as string, ...cookies };
}

test("customer initiation derives money/provider authority server-side and replays one durable attempt", async () => {
  const token = await native();
  const orderId = await createOrder(token, "order-pay-init-0001");
  const invalid = await initiate(orderId, token, "pay-init-invalid-0001", { amountMinor: 1, provider: "fake" });
  assert.equal(invalid.response.status, 400);

  const first = await initiate(orderId, token, "pay-init-00000001", { payerPhone: "+233241111111" });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.data.method, "mobile_money");
  assert.equal(first.body.data.attemptStatus, "pending");
  assert.equal(first.body.data.paymentStatus, "pending");
  assert.equal(first.body.data.action.kind, "prompt");
  const attemptId = first.body.data.attemptId as string;
  const row = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal(row.orderId, orderId);
  assert.equal(row.provider, "fake");
  assert.equal(row.method, order.paymentMethod);
  assert.equal(row.currency, "GHS");
  assert.equal(row.amountMinor, order.totalMinor);
  assert.equal(fake.initiateCalls.length, 1);
  assert.equal(fake.initiateCalls[0].amountMinor, order.totalMinor);
  assert.equal(fake.initiateCalls[0].currency, "GHS");

  const replay = await initiate(orderId, token, "pay-init-00000001", { payerPhone: "+233241111111" });
  assert.equal(replay.response.status, 201);
  assert.equal(replay.body.data.attemptId, attemptId);
  assert.equal(fake.initiateCalls.length, 1);
  const changed = await initiate(orderId, token, "pay-init-00000001", { payerPhone: "+233242222222" });
  assert.equal(changed.response.status, 409);
});

test("ownership and guest CSRF protect payment initiation", async () => {
  const owner = await native();
  const other = await native("customer-b@example.test");
  const orderId = await createOrder(owner, "order-pay-owner-0001", "1");
  const forged = await initiate(orderId, other, "pay-owner-forged-0001");
  assert.equal(forged.response.status, 404);
  assert.equal(await db.paymentAttempt.count({ where: { orderId } }), 0);

  await seedCommerceFixtures(db);
  const guest = await guestOrder();
  const missingCsrf = await request(`/orders/${guest.orderId}/payment-attempts`, {}, {
    cookie: guest.cookie, origin: "http://localhost:3000", "idempotency-key": "guest-pay-0000001",
  });
  assert.equal(missingCsrf.response.status, 403);
  const ok = await request(`/orders/${guest.orderId}/payment-attempts`, {}, {
    cookie: guest.cookie, origin: "http://localhost:3000", "x-csrf-token": guest.csrf, "idempotency-key": "guest-pay-0000001",
  });
  assert.equal(ok.response.status, 201);
  assert.equal(await db.paymentAttempt.count({ where: { orderId: guest.orderId } }), 1);
});

test("different replay keys racing one order still create and call exactly one live attempt", async () => {
  const token = await native();
  const orderId = await createOrder(token, "order-pay-race-0001", "1");
  const results = await Promise.all([
    initiate(orderId, token, "pay-race-key-0001"),
    initiate(orderId, token, "pay-race-key-0002"),
  ]);
  assert.equal(results.filter((x) => x.response.status === 201).length, 1);
  assert.equal(results.filter((x) => x.response.status === 409).length, 1);
  assert.equal(await db.paymentAttempt.count({ where: { orderId, status: { in: ["initiated", "pending"] } } }), 1);
  assert.equal(fake.initiateCalls.length, 1);
});

test("terminal failed attempt permits exactly one new durable retry and only then returns order to pending", async () => {
  const token = await native();
  const orderId = await createOrder(token, "order-pay-retry-0001", "1");
  const first = await initiate(orderId, token, "pay-retry-key-0001");
  assert.equal(first.response.status, 201);
  const firstId = first.body.data.attemptId as string;
  await db.paymentAttempt.update({ where: { id: firstId }, data: { status: "failed", initiationState: "rejected", resolvedAt: new Date(), version: { increment: 1 } } });
  await db.order.update({ where: { id: orderId }, data: { paymentStatus: "failed" } });
  const retry = await initiate(orderId, token, "pay-retry-key-0002");
  assert.equal(retry.response.status, 201);
  assert.notEqual(retry.body.data.attemptId, firstId);
  assert.equal(await db.paymentAttempt.count({ where: { orderId } }), 2);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "pending");
  assert.equal(fake.initiateCalls.length, 2);
});

test("timeout after provider acceptance becomes uncertain and same-key replay recovers by lookup without a second charge", async () => {
  await restart(100);
  const token = await native();
  const orderId = await createOrder(token, "order-pay-timeout-0001", "1");
  let acceptedMerchantReference = "";
  fake.initiateHandler = async (input) => {
    acceptedMerchantReference = input.merchantReference;
    fake.lookupResult = {
      providerId: "fake", merchantReference: input.merchantReference, providerReference: "accepted-lost-response",
      state: "pending", amountMinor: input.amountMinor, currency: "GHS",
    };
    await new Promise<never>((_resolve, reject) => {
      const rejectAbort = () => reject(input.signal.reason ?? new Error("aborted"));
      if (input.signal.aborted) return rejectAbort();
      input.signal.addEventListener("abort", rejectAbort, { once: true });
    });
  };

  const first = await initiate(orderId, token, "pay-timeout-key-0001");
  assert.equal(first.response.status, 201);
  const attemptId = first.body.data.attemptId as string;
  assert.equal(first.body.data.attemptStatus, "initiated");
  assert.equal(first.body.data.action.kind, "none");
  let row = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  assert.equal(row.initiationState, "uncertain");
  assert.equal(row.settlementState, "exception");
  assert.equal(fake.initiateCalls.length, 1);
  assert.ok(acceptedMerchantReference);

  fake.initiateHandler = undefined;
  const replay = await initiate(orderId, token, "pay-timeout-key-0001");
  assert.equal(replay.response.status, 201);
  assert.equal(replay.body.data.attemptId, attemptId);
  assert.equal(fake.initiateCalls.length, 1);
  assert.equal(fake.lookupCalls.length, 1);
  row = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  assert.equal(row.status, "pending");
  assert.equal(row.providerRef, "accepted-lost-response");
});
