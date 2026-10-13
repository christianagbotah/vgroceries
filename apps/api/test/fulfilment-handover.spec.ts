import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { ClaimCoverageService } from "../src/inventory/claim-coverage.service";
import { StockDepletionService } from "../src/inventory/stock-depletion.service";
import { PaymentCaptureService } from "../src/payments/payment-capture.service";
import { FulfilmentCommandService } from "../src/fulfilment/fulfilment-command.service";
import { FulfilmentPolicyService } from "../src/fulfilment/fulfilment-policy.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let command: FulfilmentCommandService;

const future = () => new Date(Date.now() + 60 * 60 * 1000);
const ctx = (key: string) => ({
  actorId: "admin-commerce",
  requestId: `req-${key}`,
  idempotencyKey: key,
});

async function createOrderFixture(input: {
  id: string;
  fulfilment?: "delivery" | "collection";
  paymentMethod?: "mobile_money" | "cash_on_delivery" | "cash_counter";
  paymentStatus?: string;
  zoneId?: string;
  quantity?: string;
  totalMinor?: number;
}) {
  const quantity = input.quantity ?? "2";
  const totalMinor = input.totalMinor ?? 1000;
  const order = await db.order.create({
    data: {
      id: input.id,
      reference: `VG-HAND-${input.id}`,
      customerUserId: "customer-a",
      customerName: "Ama Customer",
      customerPhone: "+233241111111",
      fulfilment: input.fulfilment ?? "delivery",
      zoneId: input.zoneId,
      paymentMethod: input.paymentMethod ?? "mobile_money",
      paymentStatus: input.paymentStatus ?? "succeeded",
      fulfilmentStatus: "awaiting_confirmation",
      deliveryStatus: "unassigned",
      subtotalMinor: totalMinor,
      totalMinor,
      verificationKeyVersion: 1,
      verificationCodeHash: "b".repeat(64),
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
          lineTotalMinor: totalMinor,
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
  return { order, reservation };
}

async function addSuccessfulCapture(orderId: string, amountMinor = 1000, suffix = "a") {
  return db.paymentAttempt.create({ data: {
    id: `${orderId}-capture-${suffix}`,
    orderId,
    provider: "fake",
    method: "mobile_money",
    currency: "GHS",
    amountMinor,
    merchantReference: `HANDOVER-${orderId}-${suffix}`,
    providerRef: `HANDOVER-PROV-${orderId}-${suffix}`,
    status: "succeeded",
    initiationState: "accepted",
    settlementState: "settled",
    resolvedAt: new Date(),
  } });
}

async function reachPacked(input: Parameters<typeof createOrderFixture>[0], capture = true) {
  const fixture = await createOrderFixture(input);
  if (capture && fixture.order.paymentMethod !== "cash_on_delivery")
    await addSuccessfulCapture(fixture.order.id, fixture.order.totalMinor);
  await command.confirm(fixture.order.id, ctx(`${fixture.order.id}-confirm`));
  await command.startPicking(fixture.order.id, ctx(`${fixture.order.id}-start`));
  await command.recordPick(
    fixture.order.id,
    fixture.reservation.id,
    { pickedQuantity: fixture.reservation.quantity.toString(), note: "verified" },
    ctx(`${fixture.order.id}-pick`),
  );
  await command.pack(fixture.order.id, { note: "sealed" }, ctx(`${fixture.order.id}-pack`));
  return fixture;
}

function expectPaymentBlocked(error: unknown) {
  assert.ok(error instanceof ApiProblem);
  assert.equal(error.getStatus(), 422);
  const code = (error.getResponse() as { code: string }).code;
  assert.ok(["PAYMENT_PENDING", "PAYMENT_REQUIRES_REVIEW", "PAYMENT_INSUFFICIENT", "COLLECTION_CASH_UNVERIFIED"].includes(code));
  return true;
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Fulfilment handover tests require the isolated variety_foundation_test database");
  app = await createApplication();
  db = app.get(Database);
  command = new FulfilmentCommandService(
    db,
    app.get(ClaimCoverageService),
    new FulfilmentPolicyService(),
    app.get(PaymentCaptureService),
    app.get(StockDepletionService),
  );
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
});

after(async () => { await app?.close(); });

test("verified paid delivery handover is the one physical stock depletion boundary", async () => {
  const fixture = await reachPacked({ id: "hand-paid-delivery" });
  const before = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity;

  const result = await command.handover(fixture.order.id, { note: "driver received" }, ctx("hand-paid-delivery-key"));

  assert.equal(result.fulfilmentStatus, "dispatched");
  assert.deepEqual(result.allowedActions, []);
  assert.ok(result.stockConsumedAt);
  assert.ok(result.depletionId);
  const order = await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
  const run = await db.fulfilmentRun.findUniqueOrThrow({ where: { orderId: fixture.order.id } });
  assert.equal(order.fulfilmentStatus, "dispatched");
  assert.ok(order.stockConsumedAt);
  assert.equal(run.handoverKind, "dispatch");
  assert.equal(run.handedOverBy, "admin-commerce");
  assert.ok(run.handedOverAt);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), before.minus(2).toString());
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "consumed");
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: fixture.order.id } }), 1);
  assert.equal(await db.orderEvent.count({ where: { orderId: fixture.order.id, action: "fulfilment.handed_over" } }), 1);
  assert.equal(await db.auditEvent.count({ where: { entityId: fixture.order.id, action: "fulfilment.handed_over" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: fixture.order.id, type: "fulfilment.handed_over" } }), 1);
});

test("same handover key replays one immutable depletion without a second decrement", async () => {
  const fixture = await reachPacked({ id: "hand-replay" });
  const first = await command.handover(fixture.order.id, { note: "driver" }, ctx("hand-replay-key"));
  const afterFirst = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();
  const replay = await command.handover(fixture.order.id, { note: "driver" }, ctx("hand-replay-key"));
  assert.deepEqual(replay, first);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), afterFirst);
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: fixture.order.id } }), 1);
  assert.equal(await db.orderEvent.count({ where: { orderId: fixture.order.id, action: "fulfilment.handed_over" } }), 1);
});

test("verified paid collection handover consumes stock and completes collection", async () => {
  const fixture = await reachPacked({ id: "hand-collection", fulfilment: "collection" });
  const result = await command.handover(fixture.order.id, {}, ctx("hand-collection-key"));
  assert.equal(result.fulfilmentStatus, "collected");
  const run = await db.fulfilmentRun.findUniqueOrThrow({ where: { orderId: fixture.order.id } });
  assert.equal(run.handoverKind, "collection");
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "consumed");
});

test("non-COD order status alone cannot authorize handover without retained verified capture", async () => {
  const fixture = await reachPacked({ id: "hand-no-capture", paymentStatus: "succeeded" }, false);
  const before = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();
  await assert.rejects(
    () => command.handover(fixture.order.id, {}, ctx("hand-no-capture-key")),
    expectPaymentBlocked,
  );
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), before);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "active");
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: fixture.order.id } }), 0);
});

test("live or uncertain payment evidence blocks handover before stock depletion", async () => {
  const fixture = await reachPacked({ id: "hand-live-payment" }, false);
  await db.paymentAttempt.create({ data: {
    id: "hand-live-payment-attempt",
    orderId: fixture.order.id,
    provider: "fake",
    method: "mobile_money",
    currency: "GHS",
    amountMinor: 1000,
    merchantReference: "HAND-LIVE",
    status: "pending",
    initiationState: "accepted",
    settlementState: "unsettled",
  } });
  await assert.rejects(
    () => command.handover(fixture.order.id, {}, ctx("hand-live-payment-key")),
    expectPaymentBlocked,
  );
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: fixture.order.id } }), 0);
});

test("delivery COD is allowed only for the order's active COD-enabled zone", async () => {
  const allowed = await reachPacked({
    id: "hand-cod-allowed",
    paymentMethod: "cash_on_delivery",
    paymentStatus: "unpaid",
    zoneId: "zone-required",
  }, false);
  const result = await command.handover(allowed.order.id, {}, ctx("hand-cod-allowed-key"));
  assert.equal(result.fulfilmentStatus, "dispatched");

  await seedCommerceFixtures(db);
  const blocked = await reachPacked({
    id: "hand-cod-blocked",
    paymentMethod: "cash_on_delivery",
    paymentStatus: "unpaid",
    zoneId: "zone-optional",
  }, false);
  await assert.rejects(
    () => command.handover(blocked.order.id, {}, ctx("hand-cod-blocked-key")),
    expectPaymentBlocked,
  );
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: blocked.order.id } }), 0);
});

test("collection cash remains unsupported without verified electronic payment", async () => {
  const fixture = await reachPacked({
    id: "hand-collection-cash",
    fulfilment: "collection",
    paymentMethod: "cash_counter",
    paymentStatus: "unpaid",
  }, false);
  await assert.rejects(
    () => command.handover(fixture.order.id, {}, ctx("hand-collection-cash-key")),
    expectPaymentBlocked,
  );
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: fixture.order.id } }), 0);
});

test("handover outbox failure rolls back physical stock reservation depletion and operational status together", async () => {
  const fixture = await reachPacked({ id: "hand-fault" });
  const before = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION reject_handover_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='fulfilment.handed_over' THEN RAISE EXCEPTION 'handover outbox fault'; END IF; RETURN NEW; END; $$; CREATE TRIGGER reject_handover_outbox BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION reject_handover_outbox();`);
  try {
    await assert.rejects(() => command.handover(fixture.order.id, { note: "fault" }, ctx("hand-fault-key")));
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS reject_handover_outbox ON "OutboxEvent"; DROP FUNCTION IF EXISTS reject_handover_outbox();`);
  }

  const order = await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
  const run = await db.fulfilmentRun.findUniqueOrThrow({ where: { orderId: fixture.order.id } });
  assert.equal(order.fulfilmentStatus, "packed");
  assert.equal(order.stockConsumedAt, null);
  assert.equal(run.handedOverAt, null);
  assert.equal(run.handedOverBy, null);
  assert.equal(run.handoverKind, null);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), before);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "active");
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: fixture.order.id } }), 0);
  assert.equal(await db.stockDepletionLine.count(), 0);
  assert.equal(await db.idempotency.count({ where: { actorId: "admin-commerce", operation: "fulfilment.command", key: "hand-fault-key" } }), 0);
});
