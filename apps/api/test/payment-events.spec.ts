import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { AllocationService } from "../src/inventory/allocation.service";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";

let app: INestApplication;
let base = "";
let db: Database;
let allocation: AllocationService;
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

async function start() {
  if (app) await app.close();
  fake = new FakePaymentProvider();
  app = await createApplication(config(), [fake]);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  allocation = app.get(AllocationService);
  await seedCommerceFixtures(db);
}

beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Payment event tests require an isolated *variety_foundation_test database");
  await start();
});
after(async () => { await app?.close(); });

async function postJson(path: string, body: unknown, headers: Record<string,string> = {}) {
  const response = await fetch(base + "/api/v1" + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const parsed = await response.json();
  return { response, body: parsed };
}

async function native() {
  const login = await postJson("/auth/sessions", { email: "customer-a@example.test", password: commerceTestPassword, client: "native" }, { origin: "http://localhost:3000" });
  assert.equal(login.response.status, 201);
  return login.body.data.accessToken as string;
}

async function orderAndAttempt(quantity = "1") {
  const token = await native();
  const suffix = `${Date.now()}-${Math.random()}`.replace(".", "");
  const order = await postJson("/checkout/complete", {
    lines: [{ variantId: "var-salt", quantity }], customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: "mobile_money",
  }, { authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `evt-order-${suffix}` });
  assert.equal(order.response.status, 201);
  const orderId = order.body.data.orderId as string;
  const initiated = await postJson(`/orders/${orderId}/payment-attempts`, {}, {
    authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `evt-pay-${suffix}`,
  });
  assert.equal(initiated.response.status, 201);
  const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: initiated.body.data.attemptId } });
  return { orderId, attempt };
}

function signature(raw: string) { return createHash("sha256").update(raw + "::fake-event-secret").digest("hex"); }

function installVerifiedEventAdapter() {
  let seenRaw: Buffer | undefined;
  fake.verifyHandler = async ({ rawBody, headers }) => {
    seenRaw = rawBody;
    const supplied = Array.isArray(headers["x-fake-signature"]) ? headers["x-fake-signature"]![0] : headers["x-fake-signature"];
    if (supplied !== signature(rawBody.toString("utf8"))) return { verification: "invalid" };
    const payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    return {
      verification: "verified",
      providerEventId: String(payload.eventId),
      observation: {
        providerId: "fake",
        merchantReference: String(payload.merchantReference),
        providerReference: payload.providerReference ? String(payload.providerReference) : undefined,
        state: String(payload.state) as "pending"|"succeeded"|"failed"|"expired"|"unknown",
        amountMinor: payload.amountMinor === undefined ? undefined : Number(payload.amountMinor),
        currency: payload.currency === undefined ? undefined : "GHS",
        providerEventId: String(payload.eventId),
        failureCode: payload.failureCode ? String(payload.failureCode) : undefined,
      },
    };
  };
  return () => seenRaw;
}

async function event(attempt: { merchantReference: string; providerRef: string | null; amountMinor: number }, eventId: string, state: string, overrides: Record<string, unknown> = {}, goodSignature = true) {
  const payload = {
    eventId, merchantReference: attempt.merchantReference, providerReference: attempt.providerRef,
    state, amountMinor: attempt.amountMinor, currency: "GHS", ...overrides,
  };
  const raw = ` {\n  "eventId": ${JSON.stringify(payload.eventId)},\n  "merchantReference": ${JSON.stringify(payload.merchantReference)},\n  "providerReference": ${JSON.stringify(payload.providerReference)},\n  "state": ${JSON.stringify(payload.state)},\n  "amountMinor": ${JSON.stringify(payload.amountMinor)},\n  "currency": ${JSON.stringify(payload.currency)}\n } `;
  const response = await fetch(base + "/api/v1/payments/providers/fake/events", {
    method: "POST", headers: { "content-type": "application/json", "x-fake-signature": goodSignature ? signature(raw) : "bad" }, body: raw,
  });
  const body = await response.json();
  return { response, body, raw };
}

test("provider event uses exact raw bytes, rejects bad auth/unknown provider, and applies verified success once", async () => {
  const getSeen = installVerifiedEventAdapter();
  const { orderId, attempt } = await orderAndAttempt("2");
  const bad = await event(attempt, "evt-bad-signature", "succeeded", {}, false);
  assert.ok([401,403].includes(bad.response.status));
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "pending");
  assert.equal(await db.paymentProviderEvent.count(), 0);

  const unknown = await fetch(base + "/api/v1/payments/providers/unknown/events", { method: "POST", headers: { "content-type": "application/json", "x-fake-signature": "x" }, body: "{}" });
  assert.equal(unknown.status, 404);

  const first = await event(attempt, "evt-success-1", "succeeded");
  assert.equal(first.response.status, 200);
  assert.equal(first.body.data.duplicate, false);
  assert.equal(getSeen()!.toString("utf8"), first.raw);
  let stored = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(stored.status, "succeeded");
  assert.equal(stored.callbackCount, 1);
  assert.equal(stored.settlementState, "unsettled");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "succeeded");
  assert.equal(await db.paymentProviderEvent.count({ where: { providerEventId: "evt-success-1" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { type: "payment.succeeded", aggregateId: attempt.id } }), 1);

  const duplicate = await event(attempt, "evt-success-1", "succeeded");
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.data.duplicate, true);
  stored = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(stored.callbackCount, 2);
  assert.equal(await db.paymentProviderEvent.count({ where: { providerEventId: "evt-success-1" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { type: "payment.succeeded", aggregateId: attempt.id } }), 1);
});

test("pending, failure and expiry observations use the central payment state machine", async () => {
  installVerifiedEventAdapter();
  const pendingCase = await orderAndAttempt();
  await event(pendingCase.attempt, "evt-pending", "pending");
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({ where: { id: pendingCase.attempt.id } })).status, "pending");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: pendingCase.orderId } })).paymentStatus, "pending");

  await seedCommerceFixtures(db);
  const failedCase = await orderAndAttempt();
  await event(failedCase.attempt, "evt-failed", "failed");
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({ where: { id: failedCase.attempt.id } })).status, "failed");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: failedCase.orderId } })).paymentStatus, "failed");

  await seedCommerceFixtures(db);
  const expiredCase = await orderAndAttempt();
  await event(expiredCase.attempt, "evt-expired", "expired");
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({ where: { id: expiredCase.attempt.id } })).status, "expired");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: expiredCase.orderId } })).paymentStatus, "expired");
});

test("late verified success reacquires released stock in a new reservation generation", async () => {
  installVerifiedEventAdapter();
  const { orderId, attempt } = await orderAndAttempt("2");
  await db.$transaction((tx) => allocation.release(tx, "order", orderId, { actorId: "test", requestId: "release-before-success" }));
  assert.equal(await db.reservation.count({ where: { claimId: orderId, state: "active" } }), 0);
  const result = await event(attempt, "evt-late-success", "succeeded");
  assert.equal(result.response.status, 200);
  const generations = await db.reservation.findMany({ where: { claimId: orderId }, orderBy: { generation: "asc" } });
  assert.ok(generations.some((row) => row.generation === 2 && row.state === "active"));
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "succeeded");
});

test("late success with no stock records real money and routes fulfilment to requires_review without fabricated holds", async () => {
  installVerifiedEventAdapter();
  const { orderId, attempt } = await orderAndAttempt("2");
  await db.$transaction((tx) => allocation.release(tx, "order", orderId, { actorId: "test", requestId: "release-no-stock" }));
  await db.stockLot.update({ where: { id: "lot-salt" }, data: { quantity: "0" } });
  const result = await event(attempt, "evt-paid-no-stock", "succeeded");
  assert.equal(result.response.status, 200);
  const stored = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(stored.status, "succeeded");
  assert.equal(stored.settlementState, "exception");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "requires_review");
  assert.equal(await db.reservation.count({ where: { claimId: orderId, generation: 2 } }), 0);
});

test("verified success after cancellation is never discarded and requires review", async () => {
  installVerifiedEventAdapter();
  const { orderId, attempt } = await orderAndAttempt();
  await db.$transaction(async (tx) => {
    await allocation.release(tx, "order", orderId, { actorId: "test", requestId: "cancel-before-success" });
    await tx.order.update({ where: { id: orderId }, data: { fulfilmentStatus: "cancelled", cancelledAt: new Date(), cancelledReason: "test" } });
  });
  const result = await event(attempt, "evt-after-cancel", "succeeded");
  assert.equal(result.response.status, 200);
  const stored = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  assert.equal(stored.status, "succeeded");
  assert.equal(stored.settlementState, "exception");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "requires_review");
});

test("lookup_required persists evidence first and settles only from authoritative lookup", async () => {
  const { orderId, attempt } = await orderAndAttempt();
  fake.capabilitiesValue = { ...fake.capabilitiesValue, trustMode: "lookup_required" };
  fake.verifyHandler = async ({ rawBody }) => {
    const payload = JSON.parse(rawBody.toString("utf8")) as { eventId: string };
    return { verification: "lookup_required", providerEventId: payload.eventId, merchantReference: attempt.merchantReference, providerReference: attempt.providerRef ?? undefined };
  };
  fake.lookupResult = { providerId: "fake", merchantReference: attempt.merchantReference, providerReference: attempt.providerRef ?? undefined, state: "succeeded", amountMinor: attempt.amountMinor, currency: "GHS" };
  const raw = JSON.stringify({ eventId: "evt-lookup", claimedStatus: "failed" });
  const response = await fetch(base + "/api/v1/payments/providers/fake/events", { method: "POST", headers: { "content-type": "application/json" }, body: raw });
  assert.equal(response.status, 200);
  assert.equal(fake.lookupCalls.length, 1);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "succeeded");
  const storedEvent = await db.paymentProviderEvent.findFirstOrThrow({ where: { providerEventId: "evt-lookup" } });
  assert.equal(storedEvent.verificationResult, "lookup_required");
  assert.equal(storedEvent.processingResult, "applied");
});

test("conflicting terminal observations preserve the first financial effect and surface reconciliation exception", async () => {
  installVerifiedEventAdapter();
  const failureFirst = await orderAndAttempt();
  await event(failureFirst.attempt, "evt-first-fail", "failed");
  await event(failureFirst.attempt, "evt-late-success-conflict", "succeeded");
  let attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: failureFirst.attempt.id } });
  assert.equal(attempt.status, "failed");
  assert.equal(attempt.settlementState, "exception");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: failureFirst.orderId } })).paymentStatus, "requires_review");

  await seedCommerceFixtures(db);
  const successFirst = await orderAndAttempt();
  await event(successFirst.attempt, "evt-first-success", "succeeded");
  await event(successFirst.attempt, "evt-late-fail-conflict", "failed");
  attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: successFirst.attempt.id } });
  assert.equal(attempt.status, "succeeded");
  assert.equal(attempt.settlementState, "exception");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: successFirst.orderId } })).paymentStatus, "requires_review");
});
