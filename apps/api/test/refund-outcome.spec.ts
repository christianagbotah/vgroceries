import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import type { Prisma } from "@prisma/client";
import type { RefundProviderObservation } from "../src/payments/refund-provider";
import { RefundOutcomeService } from "../src/refunds/refund-outcome.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
type OutcomeResult = {
  processingResult: "applied" | "pending" | "failed" | "exception" | "duplicate";
  refundStatus: string;
  executionStatus: string;
  orderPaymentStatus: string;
};
let outcomes: {
  apply(tx: Prisma.TransactionClient, executionId: string, observation: RefundProviderObservation, context: { actorId: string; requestId: string; trigger: "execute" | "retry" | "manual_reconcile" }): Promise<OutcomeResult>;
};

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

before(async () => {
  app = await createApplication(config());
  db = app.get(Database);
  outcomes = app.get(RefundOutcomeService) as typeof outcomes;
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => { await app.close(); });

type CaseOptions = {
  totalMinor?: number;
  captureAmounts?: number[];
  refundCaptureIndex?: number;
  refundAmountMinor?: number;
  sourceType?: "customer_cancellation" | "payment_review_cancellation" | "overcharge_correction";
  fulfilmentStatus?: string;
  paymentStatus?: string;
};

async function makeCase(reference: string, options: CaseOptions = {}) {
  const totalMinor = options.totalMinor ?? 1000;
  const captureAmounts = options.captureAmounts ?? [1000];
  const fulfilmentStatus = options.fulfilmentStatus ?? "cancelled";
  const order = await db.order.create({ data: {
    reference, customerUserId: "customer-a", customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: "mobile_money", paymentStatus: options.paymentStatus ?? "refund_pending",
    fulfilmentStatus, deliveryStatus: "unassigned", subtotalMinor: totalMinor, totalMinor,
    verificationKeyVersion: 1, verificationCodeHash: "d".repeat(64),
    ...(fulfilmentStatus === "cancelled" ? { cancelledAt: new Date(), cancelledReason: "Refund case" } : {}),
  } });
  const captures = [];
  for (let index = 0; index < captureAmounts.length; index++) {
    captures.push(await db.paymentAttempt.create({ data: {
      id: `${reference}-pay-${index + 1}`, orderId: order.id, provider: "fake", method: "mobile_money",
      currency: "GHS", amountMinor: captureAmounts[index]!, merchantReference: `${reference}-PAY-${index + 1}`,
      providerRef: `${reference}-PROV-${index + 1}`, status: "succeeded", initiationState: "accepted",
      settlementState: "unsettled", resolvedAt: new Date(), createdAt: new Date(Date.now() + index * 1000),
    } }));
  }
  const capture = captures[options.refundCaptureIndex ?? 0]!;
  const refund = await db.refund.create({ data: {
    orderId: order.id, paymentAttemptId: capture.id, provider: capture.provider, method: capture.method,
    currency: "GHS", amountMinor: options.refundAmountMinor ?? capture.amountMinor,
    sourceType: options.sourceType ?? "customer_cancellation", reason: "Approved refund", status: "approved",
    requestedBy: "admin-commerce", approvedBy: "admin-commerce", approvedAt: new Date(),
  } });
  const execution = await db.refundExecution.create({ data: {
    refundId: refund.id, provider: "fake", method: "mobile_money", currency: "GHS", amountMinor: refund.amountMinor,
    merchantRefundReference: `${reference}-REFUND`, originalPaymentMerchantReference: capture.merchantReference,
    originalPaymentProviderReference: capture.providerRef, providerRefundReference: `${reference}-RPROV`,
    status: "created", reconciliationState: "unreconciled",
  } });
  return { order, captures, capture, refund, execution };
}

function observation(reference: string, state: RefundProviderObservation["state"], amountMinor = 1000): RefundProviderObservation {
  return {
    providerId: "fake", merchantRefundReference: `${reference}-REFUND`, providerRefundReference: `${reference}-RPROV`,
    state, amountMinor, currency: "GHS",
  };
}

async function apply(executionId: string, value: RefundProviderObservation, trigger: "execute" | "retry" | "manual_reconcile" = "execute") {
  return db.$transaction((tx) => outcomes.apply(tx, executionId, value, {
    actorId: "admin-commerce", requestId: `req-${executionId}-${trigger}`, trigger,
  }), { timeout: 15_000 });
}

test("matching pending then success advances refund authority once without mutating capture truth", async () => {
  const c = await makeCase("VG-REF-OUTCOME-SUCCESS");
  const captureBefore = await db.paymentAttempt.findUniqueOrThrow({ where: { id: c.capture.id } });

  const pending = await apply(c.execution.id, observation("VG-REF-OUTCOME-SUCCESS", "pending"));
  assert.equal(pending.processingResult, "pending");
  assert.equal(pending.refundStatus, "processing");
  assert.equal(pending.executionStatus, "pending");
  assert.equal(pending.orderPaymentStatus, "refund_pending");

  const succeeded = await apply(c.execution.id, observation("VG-REF-OUTCOME-SUCCESS", "succeeded"));
  assert.equal(succeeded.processingResult, "applied");
  assert.equal(succeeded.refundStatus, "succeeded");
  assert.equal(succeeded.executionStatus, "succeeded");
  assert.equal(succeeded.orderPaymentStatus, "refunded");

  const captureAfter = await db.paymentAttempt.findUniqueOrThrow({ where: { id: c.capture.id } });
  assert.equal(captureAfter.status, captureBefore.status);
  assert.equal(captureAfter.version, captureBefore.version);
  assert.equal(captureAfter.settlementState, captureBefore.settlementState);
  assert.equal(await db.auditEvent.count({ where: { entityId: c.refund.id, action: "refund.succeeded" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: c.refund.id, type: "refund.succeeded" } }), 1);

  const duplicate = await apply(c.execution.id, observation("VG-REF-OUTCOME-SUCCESS", "succeeded"));
  assert.equal(duplicate.processingResult, "duplicate");
  assert.equal(await db.auditEvent.count({ where: { entityId: c.refund.id, action: "refund.succeeded" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: c.refund.id, type: "refund.succeeded" } }), 1);
});

test("authoritative refund failure marks money return failed without resurrecting cancelled fulfilment", async () => {
  const c = await makeCase("VG-REF-OUTCOME-FAIL");
  const result = await apply(c.execution.id, {
    ...observation("VG-REF-OUTCOME-FAIL", "failed"),
    failureCode: "DECLINED", customerSafeMessage: "Refund transfer failed.",
  });
  assert.equal(result.processingResult, "failed");
  assert.equal(result.refundStatus, "failed");
  assert.equal(result.executionStatus, "failed");
  assert.equal(result.orderPaymentStatus, "refund_pending");
  const order = await db.order.findUniqueOrThrow({ where: { id: c.order.id } });
  assert.equal(order.fulfilmentStatus, "cancelled");
  const refund = await db.refund.findUniqueOrThrow({ where: { id: c.refund.id } });
  assert.equal(refund.failureReason, "Refund transfer failed.");
  assert.ok(refund.resolvedAt);
  assert.equal(await db.auditEvent.count({ where: { entityId: c.refund.id, action: "refund.failed" } }), 1);
});

test("provider identity and money mismatches route refund execution to review", async () => {
  const scenarios: Array<[string, (base: RefundProviderObservation) => RefundProviderObservation]> = [
    ["provider", (x) => ({ ...x, providerId: "other" })],
    ["merchant", (x) => ({ ...x, merchantRefundReference: "WRONG-REFUND-REFERENCE" })],
    ["provider-ref", (x) => ({ ...x, providerRefundReference: "WRONG-PROVIDER-REF" })],
    ["amount", (x) => ({ ...x, amountMinor: 999 })],
    ["currency", (x) => ({ ...x, currency: "USD" as "GHS" })],
    ["missing-money", (x) => {
      const { amountMinor: _amount, currency: _currency, ...rest } = x;
      return rest;
    }],
  ];

  for (const [name, mutate] of scenarios) {
    const reference = `VG-REF-OUTCOME-MISMATCH-${name.toUpperCase()}`;
    const c = await makeCase(reference);
    const result = await apply(c.execution.id, mutate(observation(reference, "succeeded")));
    assert.equal(result.processingResult, "exception", name);
    assert.equal(result.refundStatus, "requires_review", name);
    assert.equal(result.executionStatus, "created", name);
    assert.equal(result.orderPaymentStatus, "requires_review", name);
    const execution = await db.refundExecution.findUniqueOrThrow({ where: { id: c.execution.id } });
    assert.equal(execution.reconciliationState, "exception", name);
    assert.equal(await db.auditEvent.count({ where: { entityId: c.refund.id, action: "refund.requires_review" } }), 1, name);
  }
});

test("conflicting terminal evidence never reverses verified refund success and records one exception", async () => {
  const c = await makeCase("VG-REF-OUTCOME-CONFLICT");
  assert.equal((await apply(c.execution.id, observation("VG-REF-OUTCOME-CONFLICT", "succeeded"))).processingResult, "applied");

  const conflict = await apply(c.execution.id, {
    ...observation("VG-REF-OUTCOME-CONFLICT", "failed"),
    failureCode: "LATE_FAILURE",
  }, "manual_reconcile");
  assert.equal(conflict.processingResult, "exception");
  const refund = await db.refund.findUniqueOrThrow({ where: { id: c.refund.id } });
  const execution = await db.refundExecution.findUniqueOrThrow({ where: { id: c.execution.id } });
  assert.equal(refund.status, "succeeded");
  assert.equal(execution.status, "succeeded");
  assert.equal(execution.reconciliationState, "exception");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: c.order.id } })).paymentStatus, "refunded");
  assert.equal(await db.auditEvent.count({ where: { entityId: c.refund.id, action: "refund.outcome_conflict" } }), 1);

  const repeated = await apply(c.execution.id, {
    ...observation("VG-REF-OUTCOME-CONFLICT", "failed"), failureCode: "LATE_FAILURE",
  }, "manual_reconcile");
  assert.equal(repeated.processingResult, "exception");
  assert.equal(await db.auditEvent.count({ where: { entityId: c.refund.id, action: "refund.outcome_conflict" } }), 1);
});

test("successful overcharge correction restores fulfilled order payment status to succeeded", async () => {
  const c = await makeCase("VG-REF-OUTCOME-EXCESS", {
    totalMinor: 1000,
    captureAmounts: [1000, 500],
    refundCaptureIndex: 1,
    refundAmountMinor: 500,
    sourceType: "overcharge_correction",
    fulfilmentStatus: "delivered",
    paymentStatus: "requires_review",
  });
  const result = await apply(c.execution.id, observation("VG-REF-OUTCOME-EXCESS", "succeeded", 500));
  assert.equal(result.processingResult, "applied");
  assert.equal(result.refundStatus, "succeeded");
  assert.equal(result.orderPaymentStatus, "succeeded");
  const order = await db.order.findUniqueOrThrow({ where: { id: c.order.id } });
  assert.equal(order.fulfilmentStatus, "delivered");
  assert.equal(order.paymentStatus, "succeeded");
});
