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
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

before(async () => {
  app = await createApplication(config()); db = app.get(Database); await seedCommerceFixtures(db);
  orderId = (await db.order.create({ data: {
    reference: "VG-PAY-SCHEMA", customerUserId: "customer-a", customerName: "Ama Customer",
    customerPhone: "+233241111111", fulfilment: "collection", paymentMethod: "mobile_money",
    paymentStatus: "pending", fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned",
    subtotalMinor: 1250, totalMinor: 1250, verificationKeyVersion: 1, verificationCodeHash: "a".repeat(64),
  } })).id;
});
after(async () => { await app?.close(); });

const attempt = (merchantReference: string) => ({
  orderId, provider: "fake", method: "mobile_money", currency: "GHS", amountMinor: 1250,
  merchantReference, status: "initiated", initiationState: "created", settlementState: "unsettled",
});

test("payment attempts enforce money, state, uniqueness and immutable financial identity", async () => {
  const live = await db.paymentAttempt.create({ data: attempt("PAY-1") });
  assert.equal(live.callbackCount, 0); assert.equal(live.version, 1);
  for (const data of [
    { ...attempt("BAD-A"), amountMinor: 0 }, { ...attempt("BAD-C"), currency: "USD" },
    { ...attempt("BAD-M"), method: "cash_counter" }, { ...attempt("BAD-S"), status: "invented" },
    { ...attempt("BAD-I"), initiationState: "invented" }, { ...attempt("BAD-T"), settlementState: "invented" },
  ]) await assert.rejects(() => db.paymentAttempt.create({ data }));
  await assert.rejects(() => db.paymentAttempt.create({ data: attempt("PAY-LIVE-2") }));
  await assert.rejects(() => db.paymentAttempt.update({ where: { id: live.id }, data: { amountMinor: 1300 } }));
  await assert.rejects(() => db.paymentAttempt.update({ where: { id: live.id }, data: { method: "card_hosted" } }));
  await assert.rejects(() => db.paymentAttempt.update({ where: { id: live.id }, data: { callbackCount: -1 } }));
  const pending = await db.paymentAttempt.update({ where: { id: live.id }, data: { status: "pending", initiationState: "accepted", version: { increment: 1 } } });
  assert.equal(pending.status, "pending"); assert.equal(pending.version, 2);
  await db.paymentAttempt.create({ data: { ...attempt("OLD"), status: "failed", initiationState: "rejected", providerRef: "PROV-OLD" } });
  await assert.rejects(() => db.paymentAttempt.create({ data: { ...attempt("OLD"), status: "failed", initiationState: "rejected" } }));
  await assert.rejects(() => db.paymentAttempt.create({ data: { ...attempt("OTHER"), status: "failed", initiationState: "rejected", providerRef: "PROV-OLD" } }));
});

test("provider evidence is immutable while processing may advance; reconciliation is append-only", async () => {
  const payment = await db.paymentAttempt.findFirstOrThrow({ where: { merchantReference: "PAY-1" } });
  const event = await db.paymentProviderEvent.create({ data: {
    provider: "fake", providerEventId: "evt-1", dedupeKey: "dedupe-1", paymentAttemptId: payment.id,
    providerRef: "PROV-1", rawBodyHash: "b".repeat(64), verificationResult: "verified",
    observedState: "pending", observedAmountMinor: 1250, observedCurrency: "GHS",
    processingResult: "pending", safeMetadata: { source: "test" },
  } });
  await assert.rejects(() => db.paymentProviderEvent.create({ data: {
    provider: "fake", providerEventId: "evt-1", dedupeKey: "dedupe-other",
    rawBodyHash: "c".repeat(64), verificationResult: "verified", safeMetadata: {},
  } }));
  assert.equal((await db.paymentProviderEvent.update({ where: { id: event.id }, data: { processingResult: "applied", processedAt: new Date() } })).processingResult, "applied");
  await assert.rejects(() => db.paymentProviderEvent.update({ where: { id: event.id }, data: { rawBodyHash: "d".repeat(64) } }));
  await assert.rejects(() => db.paymentProviderEvent.delete({ where: { id: event.id } }));
  const rec = await db.paymentReconciliation.create({ data: {
    paymentAttemptId: payment.id, provider: "fake", trigger: "staff", observedState: "pending",
    observedAmountMinor: 1250, observedCurrency: "GHS", result: "matched", requestId: "req-schema",
  } });
  await assert.rejects(() => db.paymentReconciliation.update({ where: { id: rec.id }, data: { result: "exception" } }));
  await assert.rejects(() => db.paymentReconciliation.delete({ where: { id: rec.id } }));
});

test("reservation history reuses a lot only in a later positive generation", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  const base = { positionId: "pos-salt", lotId: "lot-salt", claimType: "order", claimId: "claim", claimLineId: "line", quantity: "1", expiresAt };
  await db.reservation.create({ data: { id: "gen-1", ...base, state: "released", generation: 1 } });
  await assert.rejects(() => db.reservation.create({ data: { id: "gen-1-dupe", ...base, state: "active", generation: 1 } }));
  assert.equal((await db.reservation.create({ data: { id: "gen-2", ...base, state: "active", generation: 2 } })).generation, 2);
  await assert.rejects(() => db.reservation.create({ data: { id: "gen-zero", ...base, claimId: "other", claimLineId: "other", state: "active", generation: 0 } }));
});
