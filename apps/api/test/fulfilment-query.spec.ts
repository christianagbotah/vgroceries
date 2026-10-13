import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { PaymentCaptureService } from "../src/payments/payment-capture.service";
import { FulfilmentPolicyService } from "../src/fulfilment/fulfilment-policy.service";
import { FulfilmentQueryService } from "../src/fulfilment/fulfilment-query.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let query: FulfilmentQueryService;

const future = () => new Date(Date.now() + 60 * 60 * 1000);

async function createOperationalOrder(input: {
  id: string;
  status: string;
  fulfilment?: "delivery" | "collection";
  paymentMethod?: string;
  paymentStatus?: string;
  createdAt?: Date;
  quantity?: string;
}) {
  const quantity = input.quantity ?? "2";
  const order = await db.order.create({
    data: {
      id: input.id,
      reference: `VG-QUERY-${input.id}`,
      customerUserId: "customer-a",
      customerName: `Customer ${input.id}`,
      customerPhone: "+233241111111",
      fulfilment: input.fulfilment ?? "delivery",
      paymentMethod: input.paymentMethod ?? "mobile_money",
      paymentStatus: input.paymentStatus ?? "succeeded",
      fulfilmentStatus: input.status,
      deliveryStatus: "unassigned",
      subtotalMinor: 1000,
      totalMinor: 1000,
      verificationKeyVersion: 1,
      verificationCodeHash: "c".repeat(64),
      createdAt: input.createdAt,
      lines: {
        create: {
          id: `${input.id}-line-rice`,
          variantId: "var-rice",
          productId: "product-rice",
          productName: "Fixture Rice",
          variantName: "Weighted rice",
          unit: "kg",
          quantity,
          unitPriceMinor: 500,
          lineTotalMinor: 1000,
        },
      },
    },
  });
  const reservation = await db.reservation.create({
    data: {
      id: `${input.id}-reservation-rice`,
      positionId: "pos-rice",
      lotId: "lot-rice",
      claimType: "order",
      claimId: order.id,
      claimLineId: `${input.id}-line-rice`,
      generation: 1,
      quantity,
      state: "active",
      expiresAt: future(),
    },
  });
  return { order, reservation, lineId: `${input.id}-line-rice` };
}

async function createRun(input: {
  orderId: string;
  confirmed?: boolean;
  picking?: boolean;
  packed?: boolean;
  handedOver?: boolean;
  handoverKind?: "dispatch" | "collection";
}) {
  const now = new Date();
  return db.fulfilmentRun.create({ data: {
    orderId: input.orderId,
    locationId: "loc_accra",
    confirmedBy: input.confirmed === false ? undefined : "admin-commerce",
    confirmedAt: input.confirmed === false ? undefined : now,
    pickingStartedBy: input.picking ? "admin-commerce" : undefined,
    pickingStartedAt: input.picking ? now : undefined,
    packedBy: input.packed ? "admin-commerce" : undefined,
    packedAt: input.packed ? now : undefined,
    packNote: input.packed ? "sealed" : undefined,
    handedOverBy: input.handedOver ? "admin-commerce" : undefined,
    handedOverAt: input.handedOver ? now : undefined,
    handoverKind: input.handedOver ? input.handoverKind : undefined,
  } });
}

async function createPick(input: {
  orderId: string;
  runId: string;
  reservationId: string;
  lineId: string;
  expected?: string;
  picked: string;
  state: "picked" | "shortage";
  note?: string;
}) {
  return db.fulfilmentPick.create({ data: {
    fulfilmentRunId: input.runId,
    orderId: input.orderId,
    orderLineId: input.lineId,
    reservationId: input.reservationId,
    lotId: "lot-rice",
    variantId: "var-rice",
    quantity: input.expected ?? "2",
    pickedQuantity: input.picked,
    state: input.state,
    note: input.note,
    recordedBy: "admin-commerce",
    recordedAt: new Date(),
  } });
}

async function createSuccessfulCapture(orderId: string, amountMinor = 1000) {
  return db.paymentAttempt.create({ data: {
    id: `${orderId}-capture`,
    orderId,
    provider: "fake",
    method: "mobile_money",
    currency: "GHS",
    amountMinor,
    merchantReference: `QUERY-${orderId}`,
    providerRef: `QUERY-PROV-${orderId}`,
    status: "succeeded",
    initiationState: "accepted",
    settlementState: "settled",
    resolvedAt: new Date(),
  } });
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Fulfilment query tests require the isolated variety_foundation_test database");
  app = await createApplication();
  db = app.get(Database);
  query = new FulfilmentQueryService(
    db,
    new FulfilmentPolicyService(),
    app.get(PaymentCaptureService),
  );
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
});

after(async () => { await app?.close(); });

test("queue is bounded newest-first and exact status filtering is server-side", async () => {
  await createOperationalOrder({ id: "query-old", status: "awaiting_confirmation", createdAt: new Date("2026-10-01T10:00:00Z") });
  await createOperationalOrder({ id: "query-new", status: "confirmed", createdAt: new Date("2026-10-02T10:00:00Z") });
  await createRun({ orderId: "query-new" });

  const firstPage = await query.list({ page: 1, perPage: 1 });
  assert.equal(firstPage.page, 1);
  assert.equal(firstPage.perPage, 1);
  assert.equal(firstPage.total, 2);
  assert.deepEqual(firstPage.items.map((row) => row.orderId), ["query-new"]);

  const filtered = await query.list({ page: 1, perPage: 25, status: "awaiting_confirmation" });
  assert.equal(filtered.total, 1);
  assert.deepEqual(filtered.items.map((row) => row.orderId), ["query-old"]);
  assert.deepEqual(filtered.items[0]!.allowedActions, ["confirm"]);
  assert.equal(filtered.items[0]!.locationId, "loc_accra");
});

test("queue derives pick progress shortage blockers and removes unsafe pack action", async () => {
  const fixture = await createOperationalOrder({ id: "query-shortage", status: "picking" });
  const run = await createRun({ orderId: fixture.order.id, picking: true });
  await createPick({
    orderId: fixture.order.id,
    runId: run.id,
    reservationId: fixture.reservation.id,
    lineId: fixture.lineId,
    picked: "1.5",
    state: "shortage",
    note: "one bag short",
  });

  const result = await query.list({ page: 1, perPage: 25, status: "picking" });
  assert.equal(result.total, 1);
  const row = result.items[0]!;
  assert.equal(row.reservationCount, 1);
  assert.equal(row.pickedReservationCount, 0);
  assert.equal(row.shortageCount, 1);
  assert.equal(row.handoverAllowed, false);
  assert.ok(row.blockingReasons.includes("shortage"));
  assert.ok(row.blockingReasons.includes("picks_incomplete"));
  assert.deepEqual(row.allowedActions, ["record_pick"]);
});

test("packed electronic order without verified retained capture exposes payment blocker and no handover action", async () => {
  const fixture = await createOperationalOrder({ id: "query-unpaid-packed", status: "packed", paymentStatus: "succeeded" });
  const run = await createRun({ orderId: fixture.order.id, picking: true, packed: true });
  await createPick({
    orderId: fixture.order.id,
    runId: run.id,
    reservationId: fixture.reservation.id,
    lineId: fixture.lineId,
    picked: "2",
    state: "picked",
  });

  const result = await query.list({ page: 1, perPage: 25, status: "packed" });
  const row = result.items[0]!;
  assert.equal(row.handoverAllowed, false);
  assert.ok(row.blockingReasons.includes("payment_insufficient"));
  assert.deepEqual(row.allowedActions, []);
});

test("packed paid order exposes authoritative handover action", async () => {
  const fixture = await createOperationalOrder({ id: "query-paid-packed", status: "packed" });
  const run = await createRun({ orderId: fixture.order.id, picking: true, packed: true });
  await createPick({
    orderId: fixture.order.id,
    runId: run.id,
    reservationId: fixture.reservation.id,
    lineId: fixture.lineId,
    picked: "2",
    state: "picked",
  });
  await createSuccessfulCapture(fixture.order.id);

  const result = await query.list({ page: 1, perPage: 25, status: "packed" });
  const row = result.items[0]!;
  assert.equal(row.handoverAllowed, true);
  assert.deepEqual(row.blockingReasons, []);
  assert.deepEqual(row.allowedActions, ["handover"]);
});

test("detail exposes exact reservation lot pick and fulfilment timeline without secret payment or verification fields", async () => {
  const fixture = await createOperationalOrder({ id: "query-detail", status: "picking" });
  const run = await createRun({ orderId: fixture.order.id, picking: true });
  await createPick({
    orderId: fixture.order.id,
    runId: run.id,
    reservationId: fixture.reservation.id,
    lineId: fixture.lineId,
    picked: "1.5",
    state: "shortage",
    note: "short shelf",
  });
  await db.orderEvent.create({ data: {
    orderId: fixture.order.id,
    actorKind: "staff",
    actorId: "admin-commerce",
    action: "fulfilment.pick_recorded",
    fromStatus: "picking",
    toStatus: "picking",
    note: "short shelf",
    customerSafe: false,
  } });
  await createSuccessfulCapture(fixture.order.id);

  const detail = await query.detail(fixture.order.id);
  assert.equal(detail.locationId, "loc_accra");
  assert.equal(detail.lines.length, 1);
  assert.equal(detail.lines[0]!.orderLineId, fixture.lineId);
  assert.equal(detail.lines[0]!.reservations.length, 1);
  assert.deepEqual(detail.lines[0]!.reservations[0], {
    reservationId: fixture.reservation.id,
    orderLineId: fixture.lineId,
    variantId: "var-rice",
    lotId: "lot-rice",
    lotNumber: "RICE",
    expectedQuantity: "2",
    pickedQuantity: "1.5",
    pickState: "shortage",
    shortageNote: "short shelf",
  });
  assert.equal(detail.timeline.length, 1);
  assert.equal(detail.timeline[0]!.action, "fulfilment.pick_recorded");
  assert.ok(detail.blockingReasons.includes("shortage"));
  assert.deepEqual(detail.allowedActions, ["record_pick"]);

  const json = JSON.stringify(detail);
  for (const forbidden of ["verificationCodeHash", "providerRef", "merchantReference", "rawBodyHash", "tokenHash", "csrfHash"])
    assert.equal(json.includes(forbidden), false, `detail leaked ${forbidden}`);
});

test("terminal handed-over projection has no actions and reports already_handed_over", async () => {
  const fixture = await createOperationalOrder({ id: "query-handed", status: "dispatched" });
  const run = await createRun({ orderId: fixture.order.id, picking: true, packed: true, handedOver: true, handoverKind: "dispatch" });
  await createPick({
    orderId: fixture.order.id,
    runId: run.id,
    reservationId: fixture.reservation.id,
    lineId: fixture.lineId,
    picked: "2",
    state: "picked",
  });
  await db.order.update({ where: { id: fixture.order.id }, data: { stockConsumedAt: new Date() } });
  await db.reservation.update({ where: { id: fixture.reservation.id }, data: { state: "consumed" } });

  const detail = await query.detail(fixture.order.id);
  assert.ok(detail.stockConsumedAt);
  assert.ok(detail.handedOverAt);
  assert.equal(detail.handoverKind, "dispatch");
  assert.ok(detail.blockingReasons.includes("already_handed_over"));
  assert.deepEqual(detail.allowedActions, []);
});

test("detail rejects unknown orders without leaking whether related records exist", async () => {
  await assert.rejects(
    () => query.detail("missing-fulfilment-order"),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.equal(error.getStatus(), 404);
      assert.equal((error.getResponse() as { code: string }).code, "NOT_FOUND");
      return true;
    },
  );
});
