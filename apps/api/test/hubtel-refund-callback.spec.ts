import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let base = "";
const secret = "refund_callback_secret_1234567890_abcd";

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
  HUBTEL_REFUND_BASE_URL: "https://refund-api.hubtel.example",
  HUBTEL_REFUND_BASIC_USERNAME: "merchant-api-id", HUBTEL_REFUND_BASIC_PASSWORD: "merchant-api-key",
  HUBTEL_REFUND_COLLECTION_ACCOUNT: "11684", HUBTEL_REFUND_CALLBACK_ORIGIN: "http://localhost:3000",
  HUBTEL_REFUND_CALLBACK_SECRET: secret,
});

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test")) throw Error("isolated test DB required");
  app = await createApplication(config());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  db = app.get(Database);
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => { await app.close(); });

async function makePending(reference: string) {
  const order = await db.order.create({ data: {
    reference, customerUserId: "customer-a", customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: "mobile_money", paymentStatus: "refund_pending", fulfilmentStatus: "cancelled",
    deliveryStatus: "unassigned", subtotalMinor: 2500, totalMinor: 2500, verificationKeyVersion: 1,
    verificationCodeHash: "f".repeat(64), cancelledAt: new Date(), cancelledReason: "Hubtel refund test",
  } });
  const capture = await db.paymentAttempt.create({ data: {
    orderId: order.id, provider: "hubtel", method: "mobile_money", currency: "GHS", amountMinor: 2500,
    merchantReference: `${reference}-PAY`, providerRef: `${reference}-ORDER-ID`, status: "succeeded",
    initiationState: "accepted", settlementState: "unsettled", resolvedAt: new Date(),
  } });
  const refund = await db.refund.create({ data: {
    orderId: order.id, paymentAttemptId: capture.id, provider: "hubtel", method: "mobile_money", currency: "GHS",
    amountMinor: 2500, sourceType: "customer_cancellation", reason: "Refund", status: "processing",
    requestedBy: "admin-commerce", approvedBy: "admin-commerce", approvedAt: new Date(),
  } });
  const execution = await db.refundExecution.create({ data: {
    refundId: refund.id, provider: "hubtel", method: "mobile_money", currency: "GHS", amountMinor: 2500,
    merchantRefundReference: `${reference}-REFUND`, originalPaymentMerchantReference: capture.merchantReference,
    originalPaymentProviderReference: capture.providerRef, status: "pending", reconciliationState: "unreconciled", attemptCount: 1,
  } });
  return { order, capture, refund, execution };
}

async function callback(pathSecret: string, body: unknown) {
  const response = await fetch(`${base}/api/v1/refunds/providers/hubtel/callback/${pathSecret}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test("Hubtel success callback applies the refund exactly once and stores the external refund transaction", async () => {
  const c = await makePending("VG-HUBTEL-CALLBACK-SUCCESS");
  const payload = { ResponseCode: "0000", Message: "Success", Data: { OrderId: c.capture.providerRef, Amount: 25, ExternalTransactionId: "HUBTEL-REFUND-TX-1" } };
  const first = await callback(secret, payload);
  assert.equal(first.response.status, 200);
  assert.equal(first.body.data.processingResult, "applied");
  assert.equal((await db.refund.findUniqueOrThrow({ where: { id: c.refund.id } })).status, "succeeded");
  const execution = await db.refundExecution.findUniqueOrThrow({ where: { id: c.execution.id } });
  assert.equal(execution.status, "succeeded");
  assert.equal(execution.providerRefundReference, "HUBTEL-REFUND-TX-1");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: c.order.id } })).paymentStatus, "refunded");
  const duplicate = await callback(secret, payload);
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.data.processingResult, "duplicate");
  assert.equal(await db.auditEvent.count({ where: { entityId: c.refund.id, action: "refund.succeeded" } }), 1);
});

test("Hubtel callback rejects wrong secret and malformed/mismatched evidence without refund success", async () => {
  const c = await makePending("VG-HUBTEL-CALLBACK-GUARD");
  assert.equal((await callback("wrong_secret_123456789012345678901234", { ResponseCode: "0000", Data: { OrderId: c.capture.providerRef, Amount: 25 } })).response.status, 404);
  assert.equal((await callback(secret, { ResponseCode: "0000", Data: { OrderId: c.capture.providerRef } })).response.status, 400);
  const mismatch = await callback(secret, { ResponseCode: "0000", Data: { OrderId: c.capture.providerRef, Amount: 24, ExternalTransactionId: "HUBTEL-REFUND-TX-BAD" } });
  assert.equal(mismatch.response.status, 200);
  assert.equal(mismatch.body.data.processingResult, "exception");
  assert.equal((await db.refund.findUniqueOrThrow({ where: { id: c.refund.id } })).status, "requires_review");
});


test("OpenAPI documents the Hubtel provider callback without customer authentication or secret disclosure", async () => {
  const document = await (await fetch(base + "/api/v1/openapi.json")).json();
  const operation = document.paths["/api/v1/refunds/providers/hubtel/callback/{secret}"]?.post;
  assert.ok(operation);
  assert.deepEqual(operation.security ?? [], []);
  assert.equal(operation.parameters?.find((parameter: { name?: string }) => parameter.name === "secret")?.in, "path");
  assert.equal(operation.requestBody.content["application/json"].schema.$ref, "#/components/schemas/HubtelRefundCallbackRequest");
  assert.equal(operation.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/HubtelRefundCallbackResponseEnvelope");
  assert.equal(JSON.stringify(document).includes(secret), false);
});
