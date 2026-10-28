import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let orderId = "";
let paymentAttemptId = "";

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

function models() {
  const client = db as Database & {
    refund?: any;
    refundExecution?: any;
    refundReconciliation?: any;
  };
  assert.ok(client.refund, "Refund Prisma model is missing");
  assert.ok(client.refundExecution, "RefundExecution Prisma model is missing");
  assert.ok(client.refundReconciliation, "RefundReconciliation Prisma model is missing");
  return {
    refund: client.refund,
    execution: client.refundExecution,
    reconciliation: client.refundReconciliation,
  };
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Refund schema tests require an isolated *variety_foundation_test database");
  app = await createApplication(config());
  db = app.get(Database);
  await seedCommerceFixtures(db);
  const order = await db.order.create({ data: {
    reference: "VG-REFUND-SCHEMA", customerUserId: "customer-a", customerName: "Ama Customer",
    customerPhone: "+233241111111", fulfilment: "collection", paymentMethod: "electronic",
    paymentStatus: "succeeded", fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned",
    subtotalMinor: 1250, totalMinor: 1250, verificationKeyVersion: 1, verificationCodeHash: "e".repeat(64),
  } });
  orderId = order.id;
  paymentAttemptId = (await db.paymentAttempt.create({ data: {
    orderId, provider: "fake", method: "hosted_checkout", currency: "GHS", amountMinor: 1250,
    merchantReference: "PAY-REFUND-SCHEMA", providerRef: "PROV-REFUND-SCHEMA",
    status: "succeeded", initiationState: "accepted", settlementState: "unsettled", resolvedAt: new Date(),
  } })).id;
});
after(async () => { await app?.close(); });

function refundData(overrides: Record<string, unknown> = {}) {
  return {
    orderId, paymentAttemptId, provider: "fake", method: "hosted_checkout", currency: "GHS",
    amountMinor: 500, sourceType: "customer_cancellation", reason: "Customer cancellation",
    status: "awaiting_approval", requestedBy: "customer-a", ...overrides,
  };
}

test("refund models enforce money, vocabulary and execution uniqueness", async () => {
  const { refund, execution } = models();
  const row = await refund.create({ data: refundData() });
  assert.equal(row.amountMinor, 500);
  assert.equal(row.version, 1);

  for (const data of [
    refundData({ amountMinor: 0 }),
    refundData({ amountMinor: -1 }),
    refundData({ currency: "USD" }),
    refundData({ provider: "BAD ID" }),
    refundData({ method: "cash_counter" }),
    refundData({ sourceType: "invented" }),
    refundData({ status: "invented" }),
    refundData({ version: 0 }),
    refundData({ sourceType: "return", returnId: null }),
    refundData({ sourceType: "customer_cancellation", returnId: "return-1" }),
  ]) await assert.rejects(() => refund.create({ data }));

  const executionData = {
    refundId: row.id, provider: "fake", method: "hosted_checkout", currency: "GHS", amountMinor: 500,
    merchantRefundReference: "VG-REF-SCHEMA-1", originalPaymentMerchantReference: "PAY-REFUND-SCHEMA",
    originalPaymentProviderReference: "PROV-REFUND-SCHEMA", providerRefundReference: "RPROV-1",
    status: "created", reconciliationState: "unreconciled", attemptCount: 0,
  };
  const exec = await execution.create({ data: executionData });
  assert.equal(exec.attemptCount, 0);
  await assert.rejects(() => execution.create({ data: { ...executionData, id: undefined, merchantRefundReference: "VG-REF-SCHEMA-2", providerRefundReference: "RPROV-2" } }));

  const row2 = await refund.create({ data: refundData({ amountMinor: 200, reason: "Second obligation" }) });
  await assert.rejects(() => execution.create({ data: { ...executionData, refundId: row2.id, providerRefundReference: "RPROV-2" } }));
  await assert.rejects(() => execution.create({ data: { ...executionData, refundId: row2.id, merchantRefundReference: "VG-REF-SCHEMA-2" } }));
  for (const bad of [
    { attemptCount: -1 }, { version: 0 }, { amountMinor: 0 }, { currency: "USD" },
    { status: "invented" }, { reconciliationState: "invented" }, { method: "cash_counter" },
  ]) await assert.rejects(() => execution.create({ data: { ...executionData, refundId: row2.id, merchantRefundReference: `VG-BAD-${Object.keys(bad)[0]}`, providerRefundReference: null, ...bad } }));
});

test("refund financial identity and execution identity cannot be rewritten or deleted", async () => {
  const { refund, execution } = models();
  const row = await refund.create({ data: refundData({ amountMinor: 100, reason: "Immutable obligation" }) });
  const exec = await execution.create({ data: {
    refundId: row.id, provider: "fake", method: "hosted_checkout", currency: "GHS", amountMinor: 100,
    merchantRefundReference: "VG-REF-IMMUTABLE", originalPaymentMerchantReference: "PAY-REFUND-SCHEMA",
    originalPaymentProviderReference: "PROV-REFUND-SCHEMA", status: "created", reconciliationState: "unreconciled",
  } });
  for (const data of [
    { amountMinor: 101 }, { paymentAttemptId: "missing" }, { provider: "other" }, { method: "card_hosted" },
    { currency: "USD" }, { sourceType: "overcharge_correction" }, { returnId: "return-2" },
  ]) await assert.rejects(() => refund.update({ where: { id: row.id }, data }));
  await assert.rejects(() => refund.delete({ where: { id: row.id } }));

  for (const data of [
    { refundId: "missing" }, { amountMinor: 101 }, { provider: "other" }, { method: "card_hosted" },
    { currency: "USD" }, { merchantRefundReference: "VG-REF-CHANGED" },
    { originalPaymentMerchantReference: "PAY-CHANGED" }, { originalPaymentProviderReference: "PROV-CHANGED" },
  ]) await assert.rejects(() => execution.update({ where: { id: exec.id }, data }));
});

test("refund reconciliation is append-only and validates normalized evidence", async () => {
  const { refund, execution, reconciliation } = models();
  const row = await refund.create({ data: refundData({ amountMinor: 75, reason: "Reconcile obligation" }) });
  const exec = await execution.create({ data: {
    refundId: row.id, provider: "fake", method: "hosted_checkout", currency: "GHS", amountMinor: 75,
    merchantRefundReference: "VG-REF-RECON", originalPaymentMerchantReference: "PAY-REFUND-SCHEMA",
    status: "pending", reconciliationState: "unreconciled",
  } });
  const rec = await reconciliation.create({ data: {
    refundId: row.id, refundExecutionId: exec.id, provider: "fake", trigger: "manual_reconcile",
    observedState: "pending", observedAmountMinor: 75, observedCurrency: "GHS", result: "pending", requestId: "req-refund-schema",
  } });
  await assert.rejects(() => reconciliation.update({ where: { id: rec.id }, data: { result: "matched" } }));
  await assert.rejects(() => reconciliation.delete({ where: { id: rec.id } }));
  for (const data of [
    { trigger: "invented" }, { observedState: "invented" }, { observedAmountMinor: -1 },
    { observedCurrency: "USD" }, { result: "invented" },
  ]) await assert.rejects(() => reconciliation.create({ data: {
    refundId: row.id, refundExecutionId: exec.id, provider: "fake", trigger: "manual_reconcile",
    observedState: "pending", result: "matched", requestId: `req-${Object.keys(data)[0]}`, ...data,
  } }));
});
