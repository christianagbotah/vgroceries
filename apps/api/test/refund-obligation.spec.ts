import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { PaymentCaptureService } from "../src/payments/payment-capture.service";
import { RefundObligationService } from "../src/refunds/refund-obligation.service";
import { normalizeRefundReason } from "../src/refunds/refund.values";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let second: INestApplication;
let db: Database;
let db2: Database;
let captures: PaymentCaptureService;
let captures2: PaymentCaptureService;
const refunds = new RefundObligationService();
const refunds2 = new RefundObligationService();

const config = () => readConfig({
  DATABASE_URL: process.env.DATABASE_URL!, WEB_ORIGINS: "http://localhost:3000",
  API_STOCK_LOCATION_ID: "loc_accra", API_INSECURE_COOKIES: "true",
  COMMERCE_LOCATION_ID: "loc_accra", CHECKOUT_PAYMENT_HOLD_MINUTES: "15",
  CHECKOUT_OFFLINE_HOLD_MINUTES: "1440", GUEST_CHECKOUT_TTL_MINUTES: "1440",
  ORDER_VERIFICATION_ACTIVE_VERSION: "1", ORDER_VERIFICATION_KEYS: JSON.stringify({ 1: "11".repeat(32) }),
});

before(async () => {
  app = await createApplication(config());
  second = await createApplication(config());
  db = app.get(Database);
  db2 = second.get(Database);
  captures = app.get(PaymentCaptureService);
  captures2 = second.get(PaymentCaptureService);
});
beforeEach(async () => { await seedCommerceFixtures(db); });
after(async () => { await second.close(); await app.close(); });

async function makeOrder(reference: string, totalMinor: number, amounts: number[]) {
  const order = await db.order.create({ data: {
    reference, customerUserId: "customer-a", customerName: "Ama Customer", customerPhone: "+233241111111",
    fulfilment: "collection", paymentMethod: "mobile_money", paymentStatus: "succeeded",
    fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned", subtotalMinor: totalMinor,
    totalMinor, verificationKeyVersion: 1, verificationCodeHash: "c".repeat(64),
  } });
  for (let index = 0; index < amounts.length; index++) {
    await db.paymentAttempt.create({ data: {
      id: `${reference}-pay-${index + 1}`, orderId: order.id, provider: "fake", method: "mobile_money",
      currency: "GHS", amountMinor: amounts[index]!, merchantReference: `${reference}-PAY-${index + 1}`,
      providerRef: `${reference}-PROV-${index + 1}`, status: "succeeded", initiationState: "accepted",
      settlementState: "unsettled", resolvedAt: new Date(Date.now() + index * 1000),
      createdAt: new Date(Date.now() + index * 1000),
    } });
  }
  return order;
}

async function full(
  client: Database,
  captureService: PaymentCaptureService,
  service: RefundObligationService,
  orderId: string,
  sourceType: "customer_cancellation" | "payment_review_cancellation" = "customer_cancellation",
) {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const state = await captureService.lockForOrder(tx, orderId);
    return service.ensureFullCancellation(tx, order, state, sourceType, "  Customer   changed mind  ", {
      actorId: "customer-a", requestId: "req-refund-obligation",
    });
  }, { timeout: 15_000 });
}

test("refund reason normalization is deterministic and bounded", () => {
  assert.equal(normalizeRefundReason("  Customer   changed\n mind  "), "Customer changed mind");
  assert.throws(() => normalizeRefundReason("   "), /reason/i);
  assert.throws(() => normalizeRefundReason("x".repeat(501)), /reason/i);
});

test("full cancellation creates every remaining successful-capture obligation exactly once", async () => {
  const order = await makeOrder("VG-REF-OBL-FULL", 1000, [1000, 1000]);
  const first = await full(db, captures, refunds, order.id);
  assert.deepEqual(first.map((row) => [row.paymentAttemptId, row.amountMinor]), [
    ["VG-REF-OBL-FULL-pay-1", 1000], ["VG-REF-OBL-FULL-pay-2", 1000],
  ]);
  assert.ok(first.every((row) => row.reason === "Customer changed mind" && row.status === "awaiting_approval"));
  assert.equal((await full(db, captures, refunds, order.id)).length, 0);
  assert.equal(await db.refund.count({ where: { orderId: order.id } }), 2);
  assert.equal(await db.auditEvent.count({ where: { action: "refund.requested" } }), 2);
  assert.equal(await db.outboxEvent.count({ where: { type: "refund.requested" } }), 2);
});

test("existing durable obligations consume capture capacity and over-cap state fails closed", async () => {
  const order = await makeOrder("VG-REF-OBL-CAP", 1000, [1000]);
  await db.refund.create({ data: {
    orderId: order.id, paymentAttemptId: "VG-REF-OBL-CAP-pay-1", provider: "fake", method: "mobile_money",
    currency: "GHS", amountMinor: 400, sourceType: "customer_cancellation", reason: "Existing", requestedBy: "customer-a",
  } });
  const created = await full(db, captures, refunds, order.id);
  assert.equal(created.length, 1);
  assert.equal(created[0]!.amountMinor, 600);
  assert.equal((await db.refund.aggregate({ where: { paymentAttemptId: "VG-REF-OBL-CAP-pay-1" }, _sum: { amountMinor: true } }))._sum.amountMinor, 1000);

  await db.refund.create({ data: {
    orderId: order.id, paymentAttemptId: "VG-REF-OBL-CAP-pay-1", provider: "fake", method: "mobile_money",
    currency: "GHS", amountMinor: 1, sourceType: "customer_cancellation", reason: "Corrupt over-cap fixture", requestedBy: "customer-a",
  } });
  await assert.rejects(() => full(db, captures, refunds, order.id), (error: unknown) => {
    assert.ok(error instanceof ApiProblem);
    assert.equal(error.getStatus(), 422);
    return true;
  });
});

test("failed or expired payment attempts never fund refund obligations", async () => {
  const order = await db.order.create({ data: {
    reference: "VG-REF-OBL-NOCAP", customerUserId: "customer-a", customerName: "Ama Customer",
    customerPhone: "+233241111111", fulfilment: "collection", paymentMethod: "mobile_money", paymentStatus: "failed",
    fulfilmentStatus: "awaiting_confirmation", deliveryStatus: "unassigned", subtotalMinor: 1000, totalMinor: 1000,
    verificationKeyVersion: 1, verificationCodeHash: "b".repeat(64),
  } });
  for (const [id, status] of [["failed", "failed"], ["expired", "expired"]] as const) {
    await db.paymentAttempt.create({ data: {
      id: `nocap-${id}`, orderId: order.id, provider: "fake", method: "mobile_money", currency: "GHS",
      amountMinor: 1000, merchantReference: `NOCAP-${id}`, status, initiationState: "rejected", settlementState: "unsettled", resolvedAt: new Date(),
    } });
  }
  assert.equal((await full(db, captures, refunds, order.id)).length, 0);
  assert.equal(await db.refund.count({ where: { orderId: order.id } }), 0);
});

test("excess correction allocates only server-derived over-capture newest successful capture first", async () => {
  const order = await makeOrder("VG-REF-OBL-EXCESS", 1000, [1000, 1000]);
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${order.id} FOR UPDATE`;
    const locked = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    const state = await captures.lockForOrder(tx, order.id);
    return refunds.ensureExcessCorrection(tx, locked, state, "Duplicate capture", { actorId: "admin-commerce", requestId: "req-excess" });
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]!.paymentAttemptId, "VG-REF-OBL-EXCESS-pay-2");
  assert.equal(result[0]!.amountMinor, 1000);
  assert.equal(result[0]!.sourceType, "overcharge_correction");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).fulfilmentStatus, "awaiting_confirmation");
  assert.equal((await db.refund.count({ where: { orderId: order.id } })), 1);
  const replay = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${order.id} FOR UPDATE`;
    const locked = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    const state = await captures.lockForOrder(tx, order.id);
    return refunds.ensureExcessCorrection(tx, locked, state, "Duplicate capture", { actorId: "admin-commerce", requestId: "req-excess-replay" });
  });
  assert.equal(replay.length, 0);
});

test("two instances racing full obligations cannot over-refund a capture", async () => {
  const order = await makeOrder("VG-REF-OBL-RACE", 1000, [1000]);
  const settled = await Promise.allSettled([
    full(db, captures, refunds, order.id),
    full(db2, captures2, refunds2, order.id),
  ]);
  assert.ok(settled.every((result) => result.status === "fulfilled"));
  const rows = await db.refund.findMany({ where: { orderId: order.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.amountMinor, 1000);
});
