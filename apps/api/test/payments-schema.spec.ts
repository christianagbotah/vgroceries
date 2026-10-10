import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { readConfig } from "../src/config";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let orderId: string;

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!,
  WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra",
  API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra",
  CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440",
  GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1",
  ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Payment schema tests require an isolated *variety_foundation_test database");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  const order = await db.order.create({ data: {
    reference: "VG-PAY-SCHEMA",
    customerUserId: "customer-a",
    customerName: "Ama Customer",
    customerPhone: "+233241111111",
    fulfilment: "collection",
    paymentMethod: "mobile_money",
    paymentStatus: "pending",
    fulfilmentStatus: "awaiting_confirmation",
    deliveryStatus: "unassigned",
    subtotalMinor: 1250,
    totalMinor: 1250,
    verificationKeyVersion: 1,
    verificationCodeHash: "a".repeat(64),
  } });
  orderId = order.id;
});

after(async () => { await app?.close(); });

const attemptData = (merchantReference: string) => ({
  orderId,
  provider: "fake",
  method: "mobile_money",
  currency: "GHS",
  amountMinor: 1250,
  merchantReference,
  status: "initiated",
  initiationState: "created",
  settlementState: "unsettled",
});

test("payment attempts enforce financial and state invariants", async () => {
  const valid = await db.paymentAttempt.create({ data: attemptData("PAY-MERCHANT-1") });
  assert.equal(valid.callbackCount, 0);
  assert.equal(valid.version, 1);
  await assert.rejects(() => db.paymentAttempt.create({ data: { ...attemptData("PAY-BAD-AMOUNT"), amountMinor: 0 } }));
  await assert.rejects(() => db.paymentAttempt.create({ data: { ...attemptData("PAY-BAD-CURRENCY"), currency: "USD" } }));
  await assert.rejects(() => db.paymentAttempt.create({ data: { ...attemptData("PAY-BAD-METHOD"), method: "cash_counter" } }));
  await assert.rejects(() => db.paymentAttempt.create({ data: { ...attemptData("PAY-BAD-STATUS"), status: "invented" } }));
  await assert.rejects(() => db.paymentAttempt.create({ data: { ...attemptData("PAY-BAD-INIT"), initiationState: "invented" } }));
  await assert.rejects(() => db.paymentAttempt.create({ data: { ...attemptData("PAY-BAD-SETTLE"), settlementState: "invented" } }));
  await assert.rejects(() => db.paymentAttempt.update({ where: { id: valid.id }, data: { callbackCount: -1 } }));
});

test("merchant/provider references and one-live-attempt authority are unique", async () => {
  const failed = await db.paymentAttempt.create({ data: { ...attemptData("PAY-MERCHANT-OLD"), status: "failed", initiationState: "rejected", providerRef: "PROVIDER-OLD" } });
  assert.ok(failed.id);
  await assert.rejects(() => db.paymentAttempt.create({ data: { ...attemptData("PAY-MERCHANT-OLD"), status: "failed", initiationState: "rejected" } }));
  await assert.rejects(() => db.paymentAttempt.create({ data: { ...attemptData("PAY-PROVIDER-DUPE"), status: "failed", initiationState: "rejected", providerRef: "PROVIDER-OLD" } }));
  await assert.rejects(() => db.paymentAttempt.create({ data: attemptData("PAY-LIVE-SECOND") }));
});

test("attempt financial identity is immutable while status projection may advance", async () => {
  const row = await db.paymentAttempt.findFirstOrThrow({ where: { merchantReference: "PAY-MERCHANT-1" } });
  await assert.rejects(() => db.paymentAttempt.update({ where: { id: row.id }, data: { amountMinor: 1300 } }));
  await assert.rejects(() => db.paymentAttempt.update({ where: { id: row.id }, data: { method: "card_hosted" } }));
  await assert.rejects(() => db.paymentAttempt.update({ where: { id: row.id }, data: { provider: "other" } }));
  const advanced = await db.paymentAttempt.update({ where: { id: row.id }, data: { status: "pending", initiationState: "accepted", version: { increment: 1 } } });
  assert.equal(advanced.status, "pending");
  assert.equal(advanced.version, 2);
});

test("provider events and reconciliation history are append-only and deduplicated", async () => {
  const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { merchantReference: "PAY-MERCHANT-1" } });
  const event = await db.paymentProviderEvent.create({ data: {
    provider: "fake",
    providerEventId: "evt-1",
    dedupeKey: "dedupe-1",
    paymentAttemptId: attempt.id,
    providerRef: "PROVIDER-1",
    rawBodyHash: "b".repeat(64),
    verificationResult: "verified",
    observedState: "pending",
    observedAmountMinor: 1250,
    observedCurrency: "GHS",
    processingResult: "pending",
    safeMetadata: { source: "test" },
  } });
  await assert.rejects(() => db.paymentProviderEvent.create({ data: {
    provider: "fake", providerEventId: "evt-1", dedupeKey: "dedupe-2", rawBodyHash: "c".repeat(64), verificationResult: "verified", safeMetadata: {},
  } }));
  await assert.rejects(() => db.paymentProviderEvent.update({ where: { id: event.id }, data: { processingResult: "applied" } }));
  await assert.rejects(() => db.paymentProviderEvent.delete({ where: { id: event.id } }));

  const reconciliation = await db.paymentReconciliation.create({ data: {
    paymentAttemptId: attempt.id,
    provider: "fake",
    trigger: "staff",
    observedState: "pending",
    observedAmountMinor: 1250,
    observedCurrency: "GHS",
    result: "matched",
    requestId: "req-pay-schema",
  } });
  await assert.rejects(() => db.paymentReconciliation.update({ where: { id: reconciliation.id }, data: { result: "exception" } }));
  await assert.rejects(() => db.paymentReconciliation.delete({ where: { id: reconciliation.id } }));
});

test("reservation history permits the same lot again only in a later positive generation", async () => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60_000);
  await db.reservation.create({ data: {
    id: "pay-gen-1", positionId: "pos-salt", lotId: "lot-salt", claimType: "order", claimId: "pay-claim", claimLineId: "pay-line", quantity: "1", state: "released", expiresAt, generation: 1,
  } });
  await assert.rejects(() => db.reservation.create({ data: {
    id: "pay-gen-1-dupe", positionId: "pos-salt", lotId: "lot-salt", claimType: "order", claimId: "pay-claim", claimLineId: "pay-line", quantity: "1", state: "active", expiresAt, generation: 1,
  } }));
  const second = await db.reservation.create({ data: {
    id: "pay-gen-2", positionId: "pos-salt", lotId: "lot-salt", claimType: "order", claimId: "pay-claim", claimLineId: "pay-line", quantity: "1", state: "active", expiresAt, generation: 2,
  } });
  assert.equal(second.generation, 2);
  await assert.rejects(() => db.reservation.create({ data: {
    id: "pay-gen-zero", positionId: "pos-salt", lotId: "lot-salt", claimType: "order", claimId: "other", claimLineId: "other", quantity: "1", state: "active", expiresAt, generation: 0,
  } }));
});
