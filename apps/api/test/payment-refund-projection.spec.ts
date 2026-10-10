import { test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { RefundSourceType, RefundStatus } from "@variety/contracts";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { PaymentCaptureService } from "../src/payments/payment-capture.service";
import { PaymentRefundProjectionService } from "../src/payments/payment-refund-projection.service";
import { seedCommerceFixtures } from "./commerce-fixtures";


const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

type ProjectionRefund = { amountMinor: number; status: RefundStatus; sourceType: RefundSourceType };

async function project(input: {
  order: { id: string; totalMinor: number; fulfilmentStatus: string; paymentStatus: string };
  captures: { id: string; amountMinor: number }[];
  refunds: ProjectionRefund[];
}) {
  const writes: string[] = [];
  const tx = {
    order: { update: async ({ data }: { data: { paymentStatus: string } }) => { writes.push(data.paymentStatus); return data; } },
  } as unknown as Prisma.TransactionClient;
  const service = new PaymentRefundProjectionService();
  const result = await service.apply(tx, input);
  return { result, writes };
}

test("refund projection preserves capture truth and derives refund-sensitive order status", async () => {
  const base = { id: "order-projection", totalMinor: 10_000, fulfilmentStatus: "awaiting_confirmation", paymentStatus: "succeeded" };
  assert.equal((await project({ order: { ...base, paymentStatus: "failed" }, captures: [], refunds: [] })).result, "failed");

  const captured = [{ id: "pay-1", amountMinor: 10_000 }];
  assert.equal((await project({ order: { ...base, fulfilmentStatus: "cancelled", paymentStatus: "refund_pending" }, captures: captured, refunds: [
    { amountMinor: 10_000, status: "approved", sourceType: "customer_cancellation" },
  ] })).result, "refund_pending");
  assert.equal((await project({ order: base, captures: captured, refunds: [
    { amountMinor: 2_000, status: "requires_review", sourceType: "overcharge_correction" },
  ] })).result, "requires_review");
  assert.equal((await project({ order: { ...base, fulfilmentStatus: "cancelled" }, captures: captured, refunds: [
    { amountMinor: 10_000, status: "succeeded", sourceType: "customer_cancellation" },
  ] })).result, "refunded");

  const duplicateCapture = [{ id: "pay-1", amountMinor: 10_000 }, { id: "pay-2", amountMinor: 10_000 }];
  assert.equal((await project({ order: { ...base, paymentStatus: "requires_review" }, captures: duplicateCapture, refunds: [
    { amountMinor: 10_000, status: "succeeded", sourceType: "overcharge_correction" },
  ] })).result, "succeeded");
  assert.equal((await project({ order: base, captures: captured, refunds: [
    { amountMinor: 2_500, status: "succeeded", sourceType: "return" },
  ] })).result, "partially_refunded");
  assert.equal((await project({ order: { ...base, paymentStatus: "requires_review" }, captures: duplicateCapture, refunds: [] })).result, "requires_review");
});

test("payment capture helper locks in stable order and classifies live and successful attempts without mutation", async () => {
  const app: INestApplication = await createApplication(config());
  const db = app.get(Database);
  const capture = app.get(PaymentCaptureService);
  try {
    await seedCommerceFixtures(db);
    const order = await db.order.create({ data: {
    reference: "VG-CAPTURE-BOUNDARY", customerUserId: "customer-a", customerName: "Ama Customer",
    customerPhone: "+233241111111", fulfilment: "collection", paymentMethod: "mobile_money",
    paymentStatus: "pending", fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned",
    subtotalMinor: 1000, totalMinor: 1000, verificationKeyVersion: 1, verificationCodeHash: "d".repeat(64),
  } });
  await db.paymentAttempt.createMany({ data: [
    { id: "capture-a-success", orderId: order.id, provider: "fake", method: "mobile_money", currency: "GHS", amountMinor: 1000, merchantReference: "CAPTURE-A", status: "succeeded", initiationState: "accepted", settlementState: "unsettled", resolvedAt: new Date() },
    { id: "capture-b-failed", orderId: order.id, provider: "fake", method: "mobile_money", currency: "GHS", amountMinor: 1000, merchantReference: "CAPTURE-B", status: "failed", initiationState: "rejected", settlementState: "unsettled", resolvedAt: new Date() },
    { id: "capture-c-live", orderId: order.id, provider: "fake", method: "mobile_money", currency: "GHS", amountMinor: 1000, merchantReference: "CAPTURE-C", status: "initiated", initiationState: "uncertain", settlementState: "exception" },
  ] });
  const beforeRows = await db.paymentAttempt.findMany({ where: { orderId: order.id }, orderBy: { id: "asc" } });
  const state = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${order.id} FOR UPDATE`;
    return capture.lockForOrder(tx, order.id);
  });
  assert.deepEqual(state.attempts.map((row) => row.id), ["capture-a-success", "capture-b-failed", "capture-c-live"]);
  assert.deepEqual(state.successfulCaptures.map((row) => row.id), ["capture-a-success"]);
  assert.deepEqual(state.liveAttempts.map((row) => row.id), ["capture-c-live"]);
  const afterRows = await db.paymentAttempt.findMany({ where: { orderId: order.id }, orderBy: { id: "asc" } });
  assert.deepEqual(afterRows, beforeRows);

  await db.paymentAttempt.update({ where: { id: "capture-c-live" }, data: { status: "pending", initiationState: "accepted" } });
  const pending = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${order.id} FOR UPDATE`;
    return capture.lockForOrder(tx, order.id);
  });
    assert.deepEqual(pending.liveAttempts.map((row) => row.id), ["capture-c-live"]);
  } finally {
    await app.close();
  }
});
