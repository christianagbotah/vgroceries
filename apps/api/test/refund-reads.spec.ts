import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { VerificationCodeService } from "../src/orders/verification-code.service";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";
import { FakePaymentProvider } from "./fake-payment-provider";
import { FakeRefundProvider } from "./fake-refund-provider";

let app: INestApplication;
let db: Database;
let verification: VerificationCodeService;
let base = "";
const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true", COMMERCE_LOCATION_ID: "loc_accra",
  CHECKOUT_PAYMENT_HOLD_MINUTES: "15", CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  PAYMENT_PROVIDER_ID: "fake", PAYMENT_ENABLED_METHODS: "mobile_money,card_hosted,bank_transfer",
  PAYMENT_CONFIRMED_HOLD_MINUTES: "1440", PAYMENT_PROVIDER_TIMEOUT_MS: "100",
  PAYMENT_RECONCILE_AFTER_SECONDS: "120", PAYMENT_HOSTED_DOMAINS: "pay.example.test",
});
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated test DB required");
  await app?.close();
  app = await createApplication(config(), [new FakePaymentProvider()], [new FakeRefundProvider()]);
  await app.listen(0, "127.0.0.1"); base = await app.getUrl(); db = app.get(Database); verification = app.get(VerificationCodeService);
  await seedCommerceFixtures(db);
});
after(async () => { await app?.close(); });
async function get(path: string, token?: string) { const response = await fetch(base + "/api/v1" + path, { headers: token ? { authorization: `Bearer ${token}` } : {} }); return { response, body: await response.json() }; }
async function post(path: string, body: unknown, headers: Record<string,string> = {}) { const response = await fetch(base + "/api/v1" + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }); return { response, body: await response.json() }; }
async function login(email: string) { const x = await post("/auth/sessions", { email, password: commerceTestPassword, client: "native" }, { origin: "http://localhost:3000" }); assert.equal(x.response.status, 201); return x.body.data.accessToken as string; }
async function fixture(reference: string, second = false) {
  const id = randomUUID(), code = verification.codeFor(id, 1);
  const order = await db.order.create({ data: { id, reference, customerUserId: "customer-a", customerName: "Ama Customer", customerPhone: "+233241111111", fulfilment: "collection", paymentMethod: "mobile_money", paymentStatus: "refund_pending", fulfilmentStatus: "cancelled", deliveryStatus: "unassigned", subtotalMinor: 1000, totalMinor: 1000, verificationKeyVersion: 1, verificationCodeHash: verification.digestFor(id, code, 1), cancelledAt: new Date(), cancelledReason: "Refund requested" } });
  const capture = await db.paymentAttempt.create({ data: { orderId: id, provider: "fake", method: "mobile_money", currency: "GHS", amountMinor: 1000, merchantReference: `${reference}-PAY-INTERNAL`, providerRef: `${reference}-ORIGINAL-INTERNAL`, status: "succeeded", initiationState: "accepted", settlementState: "unsettled", resolvedAt: new Date() } });
  if (second) { const refund = await db.refund.create({ data: { orderId: id, paymentAttemptId: capture.id, provider: "fake", method: "mobile_money", currency: "GHS", amountMinor: 100, sourceType: "overcharge_correction", reason: "Duplicate capture correction", status: "awaiting_approval", requestedBy: "admin-commerce" } }); return { order, capture, code, refund }; }
  const succeeded = await db.refund.create({ data: { orderId: id, paymentAttemptId: capture.id, provider: "fake", method: "mobile_money", currency: "GHS", amountMinor: 300, sourceType: "customer_cancellation", reason: "Customer cancellation", status: "succeeded", requestedBy: "admin-commerce", approvedBy: "admin-commerce", approvedAt: new Date(), resolvedAt: new Date() } });
  const pending = await db.refund.create({ data: { orderId: id, paymentAttemptId: capture.id, provider: "fake", method: "mobile_money", currency: "GHS", amountMinor: 200, sourceType: "customer_cancellation", reason: "Customer cancellation", status: "approved", requestedBy: "admin-commerce", approvedBy: "admin-commerce", approvedAt: new Date() } });
  const execution = await db.refundExecution.create({ data: { refundId: succeeded.id, provider: "fake", method: "mobile_money", currency: "GHS", amountMinor: 300, merchantRefundReference: `${reference}-REFUND-INTERNAL`, originalPaymentMerchantReference: capture.merchantReference, originalPaymentProviderReference: capture.providerRef, status: "succeeded", reconciliationState: "reconciled", attemptCount: 1, providerRefundReference: `${reference}-SAFE-SUPPORT-REF`, resolvedAt: new Date() } });
  await db.refundReconciliation.create({ data: { refundId: succeeded.id, refundExecutionId: execution.id, provider: "fake", trigger: "manual_reconcile", observedState: "succeeded", providerRefundReference: execution.providerRefundReference, observedAmountMinor: 300, observedCurrency: "GHS", result: "matched", safeNote: "safe staff note", requestId: `${reference}-REQUEST-INTERNAL` } });
  return { order, capture, code, succeeded, pending, execution };
}

test("refund ledger is admin-only, bounded, filterable and distinguishes succeeded from committed money", async () => {
  const first = await fixture("VG-REF-READ-001"); await fixture("VG-REF-READ-002", true);
  const admin = await login("admin-commerce@example.test"), customer = await login("customer-a@example.test");
  assert.equal((await get("/refunds", customer)).response.status, 403);
  const page = await get("/refunds?page=1&perPage=1", admin); assert.equal(page.response.status, 200); assert.equal(page.body.data.total, 3); assert.equal(page.body.data.items.length, 1);
  const filtered = await get(`/refunds?status=succeeded&orderReference=${first.order.reference}`, admin); assert.equal(filtered.response.status, 200); assert.equal(filtered.body.data.total, 1);
  const row = filtered.body.data.items[0]; assert.equal(row.refundId, first.succeeded.id); assert.equal(row.captureAmountMinor, 1000); assert.equal(row.refundAmountMinor, 300); assert.equal(row.alreadyRefundedMinor, 300); assert.equal(row.remainingRefundableMinor, 500); assert.equal(row.executionStatus, "succeeded"); assert.equal(row.reconciliationState, "reconciled"); assert.equal(row.attemptCount, 1); assert.equal(row.providerRefundReference, first.execution.providerRefundReference);
});

test("refund staff ledger excludes internal merchant, original capture and reconciliation identifiers", async () => {
  const first = await fixture("VG-REF-READ-SAFE"); const admin = await login("admin-commerce@example.test");
  const result = await get(`/refunds?orderReference=${first.order.reference}`, admin); assert.equal(result.response.status, 200); const text = JSON.stringify(result.body.data);
  for (const forbidden of [first.capture.merchantReference, first.capture.providerRef!, first.execution.merchantRefundReference, "VG-REF-READ-SAFE-REQUEST-INTERNAL", "rawBodyHash", "safeMetadata"]) assert.equal(text.includes(forbidden), false, forbidden);
});

test("owner status and public tracking expose identical customer-safe refund summaries only", async () => {
  const first = await fixture("VG-REF-READ-CUSTOMER"); const customer = await login("customer-a@example.test");
  const owner = await get(`/orders/${first.order.id}`, customer); assert.equal(owner.response.status, 200);
  const tracked = await post("/orders/track", { reference: first.order.reference, code: first.code }); assert.equal(tracked.response.status, 200);
  assert.deepEqual(owner.body.data.refunds, tracked.body.data.refunds); assert.equal(owner.body.data.refunds.length, 2);
  const safe = owner.body.data.refunds.find((row: { id: string }) => row.id === first.succeeded.id); assert.equal(safe.amountMinor, 300); assert.equal(safe.amountLabel, "₵3.00"); assert.equal(safe.status, "succeeded"); assert.equal(safe.sourceLabel, "Customer cancellation"); assert.ok(safe.createdAt);
  const text = JSON.stringify(owner.body.data.refunds); for (const forbidden of [first.capture.id, first.capture.merchantReference, first.capture.providerRef!, first.execution.id, first.execution.merchantRefundReference, first.execution.providerRefundReference!, "safe staff note"]) assert.equal(text.includes(forbidden), false, forbidden);
});
