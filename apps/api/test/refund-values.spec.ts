import { test } from "node:test";
import assert from "node:assert/strict";

const contracts = require("@variety/contracts") as Record<string, any>;

test("refund contracts expose the approved strict production vocabulary", () => {
  for (const name of [
    "refundStatusSchema",
    "refundSourceTypeSchema",
    "refundActionSchema",
    "refundActionRequestSchema",
    "refundListQuerySchema",
    "refundLedgerRowSchema",
    "refundListResponseSchema",
    "customerRefundViewSchema",
    "adminOrderFinancialActionRequestSchema",
  ]) assert.ok(contracts[name], `missing ${name}`);

  assert.deepEqual(contracts.refundStatusSchema.options, [
    "awaiting_approval", "approved", "processing", "succeeded", "failed", "requires_review",
  ]);
  assert.deepEqual(contracts.refundSourceTypeSchema.options, [
    "customer_cancellation", "payment_review_cancellation", "overcharge_correction", "return",
  ]);
  assert.deepEqual(contracts.refundActionSchema.options, ["approve", "execute", "retry", "reconcile"]);

  assert.equal(contracts.refundActionRequestSchema.safeParse({ action: "approve", actorId: "evil" }).success, false);
  assert.equal(contracts.refundActionRequestSchema.safeParse({ action: "execute", amountMinor: 100 }).success, false);
  assert.equal(contracts.refundActionRequestSchema.safeParse({ action: "retry", provider: "fake" }).success, false);
  assert.equal(contracts.refundActionRequestSchema.safeParse({ action: "reconcile", currency: "GHS" }).success, false);
  assert.equal(contracts.adminOrderFinancialActionRequestSchema.safeParse({ action: "cancel_refund", reason: "  duplicate charge  ", amountMinor: 1 }).success, false);
  assert.equal(contracts.adminOrderFinancialActionRequestSchema.safeParse({ action: "refund_excess_capture", reason: "  duplicate charge  " }).success, true);
});

test("customer refund projection rejects provider and internal execution fields", () => {
  const base = {
    id: "refund-1",
    amountMinor: 1200,
    amountLabel: "₵12.00",
    status: "processing",
    sourceLabel: "Cancellation refund",
    createdAt: new Date().toISOString(),
  };
  assert.equal(contracts.customerRefundViewSchema.safeParse(base).success, true);
  for (const [field, value] of [
    ["merchantRefundReference", "VG-REF-X"],
    ["providerRefundReference", "provider-ref"],
    ["requestedBy", "admin"],
    ["attemptCount", 2],
    ["reconciliationState", "exception"],
  ]) {
    assert.equal(contracts.customerRefundViewSchema.safeParse({ ...base, [field]: value }).success, false, String(field));
  }
});
