import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";

let app: INestApplication;
let base = "";
let db: Database;
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
    throw Error("Payment event hardening tests require an isolated *variety_foundation_test database");
  if (app) await app.close();
  fake = new FakePaymentProvider();
  app = await createApplication(config(), [fake]);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
  await seedCommerceFixtures(db);
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

async function createOrderAndAttempt(quantity = "1") {
  const token = await native();
  const suffix = `${Date.now()}-${Math.random()}`.replace(".", "");
  const order = await postJson("/checkout/complete", {
    lines: [{ variantId: "var-salt", quantity }], customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: "mobile_money",
  }, { authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `hard-order-${suffix}` });
  assert.equal(order.response.status, 201);
  const orderId = order.body.data.orderId as string;
  const initiated = await postJson(`/orders/${orderId}/payment-attempts`, {}, {
    authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `hard-pay-${suffix}`,
  });
  assert.equal(initiated.response.status, 201);
  const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: initiated.body.data.attemptId } });
  return { token, orderId, attempt };
}

function verifiedAdapter() {
  fake.verifyHandler = async ({ rawBody }) => {
    const payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    return {
      verification: "verified",
      providerEventId: String(payload.eventId),
      observation: {
        providerId: "fake",
        merchantReference: String(payload.merchantReference),
        providerReference: payload.providerReference === null || payload.providerReference === undefined ? undefined : String(payload.providerReference),
        state: String(payload.state) as "pending"|"succeeded"|"failed"|"expired"|"unknown",
        amountMinor: payload.amountMinor === undefined ? undefined : Number(payload.amountMinor),
        currency: payload.currency === undefined ? undefined : String(payload.currency) as any,
        providerEventId: String(payload.eventId),
      },
    };
  };
}

async function send(attempt: { merchantReference: string; providerRef: string | null; amountMinor: number }, eventId: string, state: string, overrides: Record<string,unknown> = {}, headers: Record<string,string> = {}) {
  const payload = {
    eventId, merchantReference: attempt.merchantReference, providerReference: attempt.providerRef,
    state, amountMinor: attempt.amountMinor, currency: "GHS", ...overrides,
  };
  const response = await fetch(base + "/api/v1/payments/providers/fake/events", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { response, body };
}

test("authenticated spoofed money and references never create succeeded payment truth", async () => {
  verifiedAdapter();
  const cases: Array<[string, Record<string,unknown>]> = [
    ["amount", { amountMinor: 1 }],
    ["currency", { currency: "USD" }],
    ["merchant", { merchantReference: "VG-PAY-FORGED" }],
    ["provider-reference", { providerReference: "forged-provider-reference" }],
  ];
  for (const [name, overrides] of cases) {
    await seedCommerceFixtures(db);
    const { orderId, attempt } = await createOrderAndAttempt();
    const result = await send(attempt, `evt-spoof-${name}`, "succeeded", overrides);
    assert.equal(result.response.status, 200);
    const storedAttempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    assert.notEqual(storedAttempt.status, "succeeded");
    assert.equal(storedAttempt.settlementState, "exception");
    assert.equal(order.paymentStatus, "requires_review");
    assert.equal(await db.outboxEvent.count({ where: { type: "payment.succeeded", aggregateId: attempt.id } }), 0);
  }
});

test("different provider event ids reporting the same success apply financial effects once", async () => {
  verifiedAdapter();
  const { orderId, attempt } = await createOrderAndAttempt("2");
  const first = await send(attempt, "evt-success-a", "succeeded");
  const second = await send(attempt, "evt-success-b", "succeeded");
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(await db.paymentProviderEvent.count({ where: { paymentAttemptId: attempt.id } }), 2);
  assert.equal(await db.outboxEvent.count({ where: { type: "payment.succeeded", aggregateId: attempt.id } }), 1);
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).callbackCount, 2);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "succeeded");
});

test("persisted event resumes safely after an injected outcome outbox failure without leaking raw provider secrets", async () => {
  verifiedAdapter();
  const { token, orderId, attempt } = await createOrderAndAttempt();
  const rawSecret = "RAW_CALLBACK_SECRET_DO_NOT_STORE_7341";
  const signatureSecret = "SIGNATURE_SECRET_DO_NOT_STORE_9275";
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION reject_payment_success_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='payment.succeeded' THEN RAISE EXCEPTION 'payment success outbox fault'; END IF; RETURN NEW; END; $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_payment_success_outbox BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION reject_payment_success_outbox()`);
  const logged:string[]=[];
  const originalError=console.error;
  console.error=(...args:unknown[])=>{ logged.push(args.map(String).join(" ")); };
  let first;
  try {
    first = await send(attempt, "evt-redelivery", "succeeded", { secretNoise: rawSecret }, { "x-provider-signature": signatureSecret });
  } finally {
    console.error=originalError;
  }
  assert.equal(first.response.status, 500);
  assert.equal(await db.paymentProviderEvent.count({ where: { providerEventId: "evt-redelivery" } }), 1);
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status, "pending");
  assert.notEqual((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "succeeded");
  const owner = await fetch(base + `/api/v1/orders/${orderId}`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(owner.status, 200);
  const persisted = JSON.stringify({
    providerEvents: await db.paymentProviderEvent.findMany({ where: { paymentAttemptId: attempt.id } }),
    audits: await db.auditEvent.findMany({ where: { OR: [{ entityId: attempt.id }, { entityId: orderId }] } }),
    outbox: await db.outboxEvent.findMany({ where: { OR: [{ aggregateId: attempt.id }, { aggregateId: orderId }] } }),
    orderEvents: await db.orderEvent.findMany({ where: { orderId } }),
    publicOrder: await owner.json(),
  });
  for(const secret of [rawSecret,signatureSecret]){
    assert.equal(persisted.includes(secret),false);
    assert.equal(logged.join("\n").includes(secret),false);
  }
  await db.$executeRawUnsafe(`DROP TRIGGER reject_payment_success_outbox ON "OutboxEvent"`);
  await db.$executeRawUnsafe(`DROP FUNCTION reject_payment_success_outbox()`);

  const retry = await send(attempt, "evt-redelivery", "succeeded", { secretNoise: rawSecret }, { "x-provider-signature": signatureSecret });
  assert.equal(retry.response.status, 200);
  assert.equal(retry.body.data.duplicate, true);
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status, "succeeded");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "succeeded");
  assert.equal(await db.outboxEvent.count({ where: { type: "payment.succeeded", aggregateId: attempt.id } }), 1);
  assert.equal((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).callbackCount, 2);
});

test("stale failure callbacks cannot downgrade a newer retry", async () => {
  verifiedAdapter();
  const { token, orderId, attempt: first } = await createOrderAndAttempt();
  await send(first, "evt-first-failed", "failed");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "failed");

  const secondInit = await postJson(`/orders/${orderId}/payment-attempts`, {}, {
    authorization: `Bearer ${token}`, origin: "http://localhost:3000", "idempotency-key": `hard-retry-${Date.now()}`,
  });
  assert.equal(secondInit.response.status, 201);
  const second = await db.paymentAttempt.findUniqueOrThrow({ where: { id: secondInit.body.data.attemptId } });
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "pending");

  await send(first, "evt-first-failed-again", "failed");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "pending");
  await send(second, "evt-second-success", "succeeded");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "succeeded");
  await send(first, "evt-first-failed-late", "failed");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "succeeded");
});

test("lookup-required provider call sees committed evidence before external lookup", async () => {
  const { orderId, attempt } = await createOrderAndAttempt();
  let evidenceVisibleDuringLookup = false;
  fake.verifyHandler = async ({ rawBody }) => {
    const payload = JSON.parse(rawBody.toString("utf8")) as { eventId: string };
    return { verification: "lookup_required", providerEventId: payload.eventId, merchantReference: attempt.merchantReference, providerReference: attempt.providerRef ?? undefined };
  };
  fake.lookupHandler = async (input) => {
    evidenceVisibleDuringLookup = (await db.paymentProviderEvent.count({ where: { providerEventId: "evt-lookup-committed" } })) === 1;
    return { providerId: "fake", merchantReference: input.merchantReference, providerReference: input.providerReference, state: "succeeded", amountMinor: attempt.amountMinor, currency: "GHS" };
  };
  const response = await fetch(base + "/api/v1/payments/providers/fake/events", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId: "evt-lookup-committed" }),
  });
  assert.equal(response.status, 200);
  assert.equal(evidenceVisibleDuringLookup, true);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus, "succeeded");
});
