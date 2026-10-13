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
  quantity?: string;
}) {
  const quantity = input.quantity ?? "2";
  const order = await db.order.create({
    data: {
      id: input.id,
      reference: `VG-PACK-${input.id}`,
      customerUserId: "customer-a",
      customerName: "Ama Customer",
      customerPhone: "+233241111111",
      fulfilment: input.fulfilment ?? "delivery",
      paymentMethod: "mobile_money",
      paymentStatus: "succeeded",
      fulfilmentStatus: "awaiting_confirmation",
      deliveryStatus: "unassigned",
      subtotalMinor: 1000,
      totalMinor: 1000,
      verificationKeyVersion: 1,
      verificationCodeHash: "a".repeat(64),
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
  return { order, reservation };
}

async function reachPicking(id: string, fulfilment: "delivery" | "collection" = "delivery") {
  const fixture = await createOrderFixture({ id, fulfilment });
  await command.confirm(id, ctx(`${id}-confirm`));
  await command.startPicking(id, ctx(`${id}-start`));
  return fixture;
}

async function fullyPick(id: string, reservationId: string, quantity = "2") {
  await command.recordPick(
    id,
    reservationId,
    { pickedQuantity: quantity, note: "verified pick" },
    ctx(`${id}-pick`),
  );
}

function expectRuleViolation(error: unknown) {
  assert.ok(error instanceof ApiProblem);
  assert.equal(error.getStatus(), 422);
  assert.equal((error.getResponse() as { code: string }).code, "RULE_VIOLATION");
  return true;
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Fulfilment packing tests require the isolated variety_foundation_test database");
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

test("delivery pack requires complete exact picks and never consumes physical stock", async () => {
  const fixture = await reachPicking("pack-delivery");
  await fullyPick(fixture.order.id, fixture.reservation.id);
  const lotBefore = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();

  const result = await command.pack(
    fixture.order.id,
    { note: "  sealed crate  " },
    ctx("pack-delivery-key"),
  );

  assert.equal(result.fulfilmentStatus, "packed");
  assert.deepEqual(result.allowedActions, ["handover"]);
  const run = await db.fulfilmentRun.findUniqueOrThrow({ where: { orderId: fixture.order.id } });
  assert.equal(run.packedBy, "admin-commerce");
  assert.ok(run.packedAt);
  assert.equal(run.packNote, "sealed crate");
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).fulfilmentStatus, "packed");
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), lotBefore);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "active");
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: fixture.order.id } }), 0);
  assert.equal(await db.orderEvent.count({ where: { orderId: fixture.order.id, action: "fulfilment.packed" } }), 1);
  assert.equal(await db.auditEvent.count({ where: { entityId: fixture.order.id, action: "fulfilment.packed" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: fixture.order.id, type: "fulfilment.packed" } }), 1);
});

test("collection pack advances to ready_for_collection without consuming stock", async () => {
  const fixture = await reachPicking("pack-collection", "collection");
  await fullyPick(fixture.order.id, fixture.reservation.id);
  const lotBefore = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();

  const result = await command.pack(fixture.order.id, {}, ctx("pack-collection-key"));

  assert.equal(result.fulfilmentStatus, "ready_for_collection");
  assert.deepEqual(result.allowedActions, ["handover"]);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), lotBefore);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "active");
});

test("missing pick blocks pack with no partial status metadata or idempotency state", async () => {
  const fixture = await reachPicking("pack-missing");
  const lotBefore = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();

  await assert.rejects(
    () => command.pack(fixture.order.id, {}, ctx("pack-missing-key")),
    expectRuleViolation,
  );

  const order = await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
  const run = await db.fulfilmentRun.findUniqueOrThrow({ where: { orderId: fixture.order.id } });
  assert.equal(order.fulfilmentStatus, "picking");
  assert.equal(run.packedAt, null);
  assert.equal(run.packedBy, null);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), lotBefore);
  assert.equal(await db.idempotency.count({ where: { actorId: "admin-commerce", operation: "fulfilment.command", key: "pack-missing-key" } }), 0);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: fixture.order.id, type: "fulfilment.packed" } }), 0);
});

test("shortage pick blocks pack until corrected", async () => {
  const fixture = await reachPicking("pack-shortage");
  await command.recordPick(
    fixture.order.id,
    fixture.reservation.id,
    { pickedQuantity: "1.5", note: "short" },
    ctx("pack-shortage-record"),
  );

  await assert.rejects(
    () => command.pack(fixture.order.id, {}, ctx("pack-shortage-key")),
    expectRuleViolation,
  );
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).fulfilmentStatus, "picking");

  await command.recordPick(
    fixture.order.id,
    fixture.reservation.id,
    { pickedQuantity: "2", note: "resolved" },
    ctx("pack-shortage-correct"),
  );
  const result = await command.pack(fixture.order.id, {}, ctx("pack-shortage-retry"));
  assert.equal(result.fulfilmentStatus, "packed");
});

test("lost reservation after picking blocks pack and preserves operational state", async () => {
  const fixture = await reachPicking("pack-lost");
  await fullyPick(fixture.order.id, fixture.reservation.id);
  await db.reservation.update({ where: { id: fixture.reservation.id }, data: { state: "released" } });

  await assert.rejects(
    () => command.pack(fixture.order.id, {}, ctx("pack-lost-key")),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.equal(error.getStatus(), 409);
      assert.equal((error.getResponse() as { code: string }).code, "RESERVATION_LOST");
      return true;
    },
  );
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).fulfilmentStatus, "picking");
  assert.equal((await db.fulfilmentRun.findUniqueOrThrow({ where: { orderId: fixture.order.id } })).packedAt, null);
});

test("pack replays exactly once and same key with changed note conflicts", async () => {
  const fixture = await reachPicking("pack-replay");
  await fullyPick(fixture.order.id, fixture.reservation.id);
  const first = await command.pack(fixture.order.id, { note: "crate A" }, ctx("pack-replay-key"));
  const replay = await command.pack(fixture.order.id, { note: "crate A" }, ctx("pack-replay-key"));
  assert.deepEqual(replay, first);
  assert.equal(await db.orderEvent.count({ where: { orderId: fixture.order.id, action: "fulfilment.packed" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: fixture.order.id, type: "fulfilment.packed" } }), 1);

  await assert.rejects(
    () => command.pack(fixture.order.id, { note: "crate B" }, ctx("pack-replay-key")),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.equal(error.getStatus(), 409);
      assert.equal((error.getResponse() as { code: string }).code, "IDEMPOTENCY_CONFLICT");
      return true;
    },
  );
});

test("packing outbox failure rolls back run order event audit and idempotency together", async () => {
  const fixture = await reachPicking("pack-fault");
  await fullyPick(fixture.order.id, fixture.reservation.id);
  const lotBefore = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION reject_pack_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='fulfilment.packed' THEN RAISE EXCEPTION 'pack outbox fault'; END IF; RETURN NEW; END; $$; CREATE TRIGGER reject_pack_outbox BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION reject_pack_outbox();`);
  try {
    await assert.rejects(() => command.pack(fixture.order.id, { note: "fault" }, ctx("pack-fault-key")));
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS reject_pack_outbox ON "OutboxEvent"; DROP FUNCTION IF EXISTS reject_pack_outbox();`);
  }

  const order = await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
  const run = await db.fulfilmentRun.findUniqueOrThrow({ where: { orderId: fixture.order.id } });
  assert.equal(order.fulfilmentStatus, "picking");
  assert.equal(run.packedAt, null);
  assert.equal(run.packedBy, null);
  assert.equal(run.packNote, null);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), lotBefore);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: fixture.reservation.id } })).state, "active");
  assert.equal(await db.orderEvent.count({ where: { orderId: fixture.order.id, action: "fulfilment.packed" } }), 0);
  assert.equal(await db.auditEvent.count({ where: { entityId: fixture.order.id, action: "fulfilment.packed" } }), 0);
  assert.equal(await db.idempotency.count({ where: { actorId: "admin-commerce", operation: "fulfilment.command", key: "pack-fault-key" } }), 0);
});
