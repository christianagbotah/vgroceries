import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { PaymentCaptureService } from "../src/payments/payment-capture.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let capture: PaymentCaptureService;

async function createOrder(id: string) {
  return db.order.create({ data: {
    id,
    reference: `VG-HANDOVER-${id}`,
    customerUserId: "customer-a",
    customerName: "Ama Customer",
    customerPhone: "+233241111111",
    fulfilment: "delivery",
    paymentMethod: "mobile_money",
    paymentStatus: "pending",
    fulfilmentStatus: "packed",
    deliveryStatus: "unassigned",
    subtotalMinor: 1000,
    totalMinor: 1000,
    verificationKeyVersion: 1,
    verificationCodeHash: "e".repeat(64),
  } });
}

async function createAttempt(input: {
  id: string;
  orderId: string;
  amountMinor?: number;
  status: "initiated" | "pending" | "succeeded" | "failed" | "expired";
  initiationState?: "created" | "accepted" | "uncertain" | "rejected";
  settlementState?: "unsettled" | "settled" | "reconciled" | "exception";
}) {
  return db.paymentAttempt.create({ data: {
    id: input.id,
    orderId: input.orderId,
    provider: "fake",
    method: "mobile_money",
    currency: "GHS",
    amountMinor: input.amountMinor ?? 1000,
    merchantReference: `HANDOVER-${input.id}`,
    status: input.status,
    initiationState: input.initiationState ?? (input.status === "succeeded" ? "accepted" : "created"),
    settlementState: input.settlementState ?? "unsettled",
    resolvedAt: ["succeeded", "failed", "expired"].includes(input.status) ? new Date() : undefined,
  } });
}

async function createRefund(input: {
  id: string;
  orderId: string;
  paymentAttemptId: string;
  amountMinor: number;
  status: "awaiting_approval" | "approved" | "processing" | "succeeded" | "failed" | "requires_review";
}) {
  return db.refund.create({ data: {
    id: input.id,
    orderId: input.orderId,
    paymentAttemptId: input.paymentAttemptId,
    provider: "fake",
    method: "mobile_money",
    currency: "GHS",
    amountMinor: input.amountMinor,
    sourceType: "overcharge_correction",
    reason: "Handover coverage fixture",
    status: input.status,
    requestedBy: "admin-commerce",
    approvedBy: input.status === "awaiting_approval" ? undefined : "admin-commerce",
    approvedAt: input.status === "awaiting_approval" ? undefined : new Date(),
    resolvedAt: ["succeeded", "failed"].includes(input.status) ? new Date() : undefined,
  } });
}

async function coverage(orderId: string) {
  return db.$transaction((tx) => capture.getHandoverCoverage(tx, orderId));
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Payment handover coverage tests require the isolated variety_foundation_test database");
  app = await createApplication();
  db = app.get(Database);
  capture = app.get(PaymentCaptureService);
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
});

after(async () => { await app?.close(); });

test("handover coverage is empty and safe when no payment evidence exists", async () => {
  const order = await createOrder("handover-none");
  assert.deepEqual(await coverage(order.id), {
    successfulCapturedMinor: 0,
    successfulRefundedMinor: 0,
    retainedMinor: 0,
    liveOrUncertain: false,
  });
});

test("successful captures are summed as verified retained payment", async () => {
  const order = await createOrder("handover-captured");
  await createAttempt({ id: "handover-capture-a", orderId: order.id, status: "succeeded", amountMinor: 1000 });
  assert.deepEqual(await coverage(order.id), {
    successfulCapturedMinor: 1000,
    successfulRefundedMinor: 0,
    retainedMinor: 1000,
    liveOrUncertain: false,
  });
});

test("live or uncertain payment evidence blocks the financial handover boundary", async () => {
  const order = await createOrder("handover-live");
  await createAttempt({
    id: "handover-live-attempt",
    orderId: order.id,
    status: "pending",
    initiationState: "accepted",
  });
  assert.equal((await coverage(order.id)).liveOrUncertain, true);

  await seedCommerceFixtures(db);
  const uncertainOrder = await createOrder("handover-uncertain");
  await createAttempt({
    id: "handover-uncertain-attempt",
    orderId: uncertainOrder.id,
    status: "failed",
    initiationState: "uncertain",
    settlementState: "exception",
  });
  assert.equal((await coverage(uncertainOrder.id)).liveOrUncertain, true);
});

test("only succeeded refunds reduce retained verified capture", async () => {
  const order = await createOrder("handover-refunded");
  const attempt = await createAttempt({ id: "handover-refund-capture", orderId: order.id, status: "succeeded", amountMinor: 1000 });
  await createRefund({ id: "handover-refund-success", orderId: order.id, paymentAttemptId: attempt.id, amountMinor: 250, status: "succeeded" });
  assert.deepEqual(await coverage(order.id), {
    successfulCapturedMinor: 1000,
    successfulRefundedMinor: 250,
    retainedMinor: 750,
    liveOrUncertain: false,
  });
});

test("pending and failed refund obligations remain unsafe without pretending money was returned", async () => {
  const order = await createOrder("handover-refund-open");
  const attempt = await createAttempt({ id: "handover-refund-open-capture", orderId: order.id, status: "succeeded", amountMinor: 1000 });
  await createRefund({ id: "handover-refund-processing", orderId: order.id, paymentAttemptId: attempt.id, amountMinor: 100, status: "processing" });
  await createRefund({ id: "handover-refund-failed", orderId: order.id, paymentAttemptId: attempt.id, amountMinor: 100, status: "failed" });
  assert.deepEqual(await coverage(order.id), {
    successfulCapturedMinor: 1000,
    successfulRefundedMinor: 0,
    retainedMinor: 1000,
    liveOrUncertain: true,
  });
});

test("legitimate partial refund can retain full order coverage after duplicate successful captures", async () => {
  const order = await createOrder("handover-partial-covered");
  const first = await createAttempt({ id: "handover-partial-capture-a", orderId: order.id, status: "succeeded", amountMinor: 1000 });
  await createAttempt({ id: "handover-partial-capture-b", orderId: order.id, status: "succeeded", amountMinor: 1000 });
  await createRefund({ id: "handover-partial-refund", orderId: order.id, paymentAttemptId: first.id, amountMinor: 1000, status: "succeeded" });
  assert.deepEqual(await coverage(order.id), {
    successfulCapturedMinor: 2000,
    successfulRefundedMinor: 1000,
    retainedMinor: 1000,
    liveOrUncertain: false,
  });
});
