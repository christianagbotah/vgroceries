import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { ClaimCoverageService } from "../src/inventory/claim-coverage.service";
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
  status?: string;
  quantity?: string;
}) {
  const quantity = input.quantity ?? "2";
  const order = await db.order.create({
    data: {
      id: input.id,
      reference: `VG-FUL-${input.id}`,
      customerUserId: "customer-a",
      customerName: "Ama Customer",
      customerPhone: "+233241111111",
      fulfilment: input.fulfilment ?? "delivery",
      paymentMethod: "mobile_money",
      paymentStatus: "succeeded",
      fulfilmentStatus: input.status ?? "awaiting_confirmation",
      deliveryStatus: "unassigned",
      subtotalMinor: 1000,
      totalMinor: 1000,
      verificationKeyVersion: 1,
      verificationCodeHash: "f".repeat(64),
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
  return { order, reservation, orderLineId: `${input.id}-line-rice` };
}

function expectConflict(error: unknown) {
  assert.ok(error instanceof ApiProblem);
  assert.equal(error.getStatus(), 409);
  return true;
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Fulfilment command tests require the isolated variety_foundation_test database");
  app = await createApplication();
  db = app.get(Database);
  command = new FulfilmentCommandService(
    db,
    app.get(ClaimCoverageService),
    new FulfilmentPolicyService(),
  );
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
});

after(async () => { await app?.close(); });

test("confirm lazily creates one run, advances order and leaves physical/reserved stock untouched", async () => {
  const fixture = await createOrderFixture({ id: "ful-confirm" });
  const lotBefore = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();

  const result = await command.confirm(fixture.order.id, ctx("ful-confirm-key"));

  assert.equal(result.fulfilmentStatus, "confirmed");
  assert.deepEqual(result.allowedActions, ["start_picking"]);
  const run = await db.fulfilmentRun.findUniqueOrThrow({ where: { orderId: fixture.order.id } });
  assert.equal(run.locationId, "loc_accra");
  assert.equal(run.confirmedBy, "admin-commerce");
  assert.ok(run.confirmedAt);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).fulfilmentStatus, "confirmed");
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), lotBefore);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "active");
  assert.equal(await db.orderEvent.count({ where: { orderId: fixture.order.id, action: "fulfilment.confirmed" } }), 1);
  assert.equal(await db.auditEvent.count({ where: { entityId: fixture.order.id, action: "fulfilment.confirmed" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: fixture.order.id, type: "fulfilment.confirmed" } }), 1);
});

test("same actor/key replays exactly once while changed action under that key conflicts", async () => {
  const fixture = await createOrderFixture({ id: "ful-replay" });
  const first = await command.confirm(fixture.order.id, ctx("ful-replay-key"));
  const replay = await command.confirm(fixture.order.id, ctx("ful-replay-key"));
  assert.deepEqual(replay, first);
  assert.equal(await db.fulfilmentRun.count({ where: { orderId: fixture.order.id } }), 1);
  assert.equal(await db.orderEvent.count({ where: { orderId: fixture.order.id, action: "fulfilment.confirmed" } }), 1);

  await assert.rejects(
    () => command.startPicking(fixture.order.id, ctx("ful-replay-key")),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.equal(error.getStatus(), 409);
      assert.equal((error.getResponse() as { code: string }).code, "IDEMPOTENCY_CONFLICT");
      return true;
    },
  );
});

test("invalid skipped transition creates no fulfilment run or side effects", async () => {
  const fixture = await createOrderFixture({ id: "ful-skip" });
  await assert.rejects(
    () => command.startPicking(fixture.order.id, ctx("ful-skip-key")),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.ok([409, 422].includes(error.getStatus()));
      return true;
    },
  );
  assert.equal(await db.fulfilmentRun.count({ where: { orderId: fixture.order.id } }), 0);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).fulfilmentStatus, "awaiting_confirmation");
  assert.equal(await db.idempotency.count({ where: { actorId: "admin-commerce", operation: "fulfilment.command", key: "ful-skip-key" } }), 0);
});

test("start picking advances only from confirmed and still does not consume stock", async () => {
  const fixture = await createOrderFixture({ id: "ful-start" });
  await command.confirm(fixture.order.id, ctx("ful-start-confirm"));
  const lotBefore = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();

  const result = await command.startPicking(fixture.order.id, ctx("ful-start-picking"));

  assert.equal(result.fulfilmentStatus, "picking");
  assert.deepEqual(result.allowedActions, ["record_pick", "pack"]);
  const run = await db.fulfilmentRun.findUniqueOrThrow({ where: { orderId: fixture.order.id } });
  assert.equal(run.pickingStartedBy, "admin-commerce");
  assert.ok(run.pickingStartedAt);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), lotBefore);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "active");
});

test("record pick derives immutable order/variant/lot provenance from the reservation", async () => {
  const fixture = await createOrderFixture({ id: "ful-pick" });
  await command.confirm(fixture.order.id, ctx("ful-pick-confirm"));
  await command.startPicking(fixture.order.id, ctx("ful-pick-start"));
  const lotBefore = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();

  const result = await command.recordPick(
    fixture.order.id,
    fixture.reservation.id,
    { pickedQuantity: "2", note: "  shelf verified  " },
    ctx("ful-pick-record"),
  );

  assert.equal(result.fulfilmentStatus, "picking");
  const pick = await db.fulfilmentPick.findUniqueOrThrow({ where: { reservationId: fixture.reservation.id } });
  assert.equal(pick.orderId, fixture.order.id);
  assert.equal(pick.orderLineId, fixture.orderLineId);
  assert.equal(pick.variantId, "var-rice");
  assert.equal(pick.lotId, "lot-rice");
  assert.equal(pick.quantity.toString(), "2");
  assert.equal(pick.pickedQuantity.toString(), "2");
  assert.equal(pick.state, "picked");
  assert.equal(pick.note, "shelf verified");
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), lotBefore);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "active");
});

test("shortage is durable and correctable before packing without stock mutation", async () => {
  const fixture = await createOrderFixture({ id: "ful-shortage" });
  await command.confirm(fixture.order.id, ctx("ful-short-confirm"));
  await command.startPicking(fixture.order.id, ctx("ful-short-start"));
  const lotBefore = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();

  await command.recordPick(
    fixture.order.id,
    fixture.reservation.id,
    { pickedQuantity: "1.5", note: "one bag short" },
    ctx("ful-short-record"),
  );
  const shortage = await db.fulfilmentPick.findUniqueOrThrow({ where: { reservationId: fixture.reservation.id } });
  assert.equal(shortage.state, "shortage");
  assert.equal(shortage.pickedQuantity.toString(), "1.5");

  await command.recordPick(
    fixture.order.id,
    fixture.reservation.id,
    { pickedQuantity: "2", note: "resolved from same reserved lot" },
    ctx("ful-short-correct"),
  );
  const corrected = await db.fulfilmentPick.findUniqueOrThrow({ where: { reservationId: fixture.reservation.id } });
  assert.equal(corrected.state, "picked");
  assert.equal(corrected.pickedQuantity.toString(), "2");
  assert.equal(corrected.version, 2);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), lotBefore);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "active");
  assert.equal(await db.auditEvent.count({ where: { entityId: fixture.order.id, action: "fulfilment.pick_recorded" } }), 2);
});

test("over-pick and a reservation belonging to another order are rejected before a pick write", async () => {
  const fixture = await createOrderFixture({ id: "ful-pick-guard" });
  const other = await createOrderFixture({ id: "ful-pick-other" });
  await command.confirm(fixture.order.id, ctx("ful-pick-guard-confirm"));
  await command.startPicking(fixture.order.id, ctx("ful-pick-guard-start"));

  await assert.rejects(
    () => command.recordPick(
      fixture.order.id,
      fixture.reservation.id,
      { pickedQuantity: "2.001" },
      ctx("ful-pick-over"),
    ),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.ok([400, 422].includes(error.getStatus()));
      return true;
    },
  );
  await assert.rejects(
    () => command.recordPick(
      fixture.order.id,
      other.reservation.id,
      { pickedQuantity: "1" },
      ctx("ful-pick-foreign"),
    ),
    expectConflict,
  );
  assert.equal(await db.fulfilmentPick.count({ where: { orderId: fixture.order.id } }), 0);
});
