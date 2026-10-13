import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { StockDepletionService } from "../src/inventory/stock-depletion.service";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication;
let db: Database;
let depletion: StockDepletionService;

const future = () => new Date(Date.now() + 60 * 60 * 1000);

async function reserve(input: {
  id: string;
  claimId: string;
  claimLineId: string;
  quantity: string;
  lotId?: string;
  positionId?: string;
}) {
  return db.reservation.create({ data: {
    id: input.id,
    positionId: input.positionId ?? "pos-rice",
    lotId: input.lotId ?? "lot-rice",
    claimType: "order",
    claimId: input.claimId,
    claimLineId: input.claimLineId,
    generation: 1,
    quantity: input.quantity,
    state: "active",
    expiresAt: future(),
  } });
}

const input = (claimId: string, quantity = "2") => ({
  claimType: "order",
  claimId,
  locationId: "loc_accra",
  lines: [{ claimLineId: "line-rice", variantId: "var-rice", quantity }],
  kind: "dispatch_handover" as const,
  actorId: "admin-commerce",
  requestId: `req-${claimId}`,
});

function expectReservationLost(error: unknown) {
  assert.ok(error instanceof ApiProblem);
  assert.equal(error.getStatus(), 409);
  assert.equal((error.getResponse() as { code: string }).code, "RESERVATION_LOST");
  return true;
}

function expectOutOfStock(error: unknown) {
  assert.ok(error instanceof ApiProblem);
  assert.equal(error.getStatus(), 409);
  assert.equal((error.getResponse() as { code: string }).code, "OUT_OF_STOCK");
  return true;
}

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Stock depletion tests require the isolated variety_foundation_test database");
  app = await createApplication();
  db = app.get(Database);
  depletion = app.get(StockDepletionService);
});

beforeEach(async () => {
  await seedCommerceFixtures(db);
});

after(async () => { await app?.close(); });

test("consumeClaim decrements reserved physical stock once and persists exact lot provenance", async () => {
  await reserve({ id: "dep-res-1", claimId: "dep-claim-1", claimLineId: "line-rice", quantity: "2" });
  const before = await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } });

  const result = await db.$transaction((tx) => depletion.consumeClaim(tx, input("dep-claim-1")));

  assert.equal(result.replayed, false);
  assert.equal(result.lines.length, 1);
  assert.deepEqual(result.lines[0], {
    reservationId: "dep-res-1",
    claimLineId: "line-rice",
    variantId: "var-rice",
    lotId: "lot-rice",
    quantity: "2",
    lotQuantityBefore: before.quantity.toString(),
    lotQuantityAfter: before.quantity.minus(2).toString(),
  });
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), before.quantity.minus(2).toString());
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: "dep-res-1" } })).state, "consumed");
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: "dep-claim-1" } }), 1);
  assert.equal(await db.stockDepletionLine.count({ where: { depletionId: result.depletionId } }), 1);
  assert.equal(await db.auditEvent.count({ where: { entityId: "dep-claim-1", action: "inventory.depleted" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: "dep-claim-1", type: "inventory.depleted" } }), 1);
});

test("same claim replays the immutable depletion without a second stock mutation or duplicate events", async () => {
  await reserve({ id: "dep-res-replay", claimId: "dep-claim-replay", claimLineId: "line-rice", quantity: "2" });
  const first = await db.$transaction((tx) => depletion.consumeClaim(tx, input("dep-claim-replay")));
  const afterFirst = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();

  const replay = await db.$transaction((tx) => depletion.consumeClaim(tx, {
    ...input("dep-claim-replay"),
    requestId: "req-replay-second",
  }));

  assert.equal(replay.replayed, true);
  assert.equal(replay.depletionId, first.depletionId);
  assert.deepEqual(replay.lines, first.lines);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), afterFirst);
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: "dep-claim-replay" } }), 1);
  assert.equal(await db.auditEvent.count({ where: { entityId: "dep-claim-replay", action: "inventory.depleted" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: "dep-claim-replay", type: "inventory.depleted" } }), 1);

  await assert.rejects(
    () => db.$transaction((tx) => depletion.consumeClaim(tx, {
      ...input("dep-claim-replay"),
      kind: "collection_handover",
    })),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.equal(error.getStatus(), 409);
      assert.equal((error.getResponse() as { code: string }).code, "CONFLICT");
      return true;
    },
  );
});

test("multiple reservations sharing one lot are aggregated before one safe lot decrement", async () => {
  await reserve({ id: "dep-shared-a", claimId: "dep-shared", claimLineId: "line-rice-a", quantity: "1.25" });
  await reserve({ id: "dep-shared-b", claimId: "dep-shared", claimLineId: "line-rice-b", quantity: "0.75" });
  const before = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity;

  const result = await db.$transaction((tx) => depletion.consumeClaim(tx, {
    ...input("dep-shared"),
    lines: [
      { claimLineId: "line-rice-a", variantId: "var-rice", quantity: "1.25" },
      { claimLineId: "line-rice-b", variantId: "var-rice", quantity: "0.75" },
    ],
  }));

  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.lines.map((line) => line.reservationId), ["dep-shared-a", "dep-shared-b"]);
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), before.minus(2).toString());
  const lineRows = await db.stockDepletionLine.findMany({ where: { depletionId: result.depletionId }, orderBy: { reservationId: "asc" } });
  assert.equal(lineRows[0]!.lotQuantityBefore.toString(), before.toString());
  assert.equal(lineRows[0]!.lotQuantityAfter.toString(), before.minus("1.25").toString());
  assert.equal(lineRows[1]!.lotQuantityBefore.toString(), before.minus("1.25").toString());
  assert.equal(lineRows[1]!.lotQuantityAfter.toString(), before.minus(2).toString());
});

test("quarantined, unsaleable and expired reserved lots fail before physical mutation", async () => {
  const cases = [
    { id: "dep-quarantine", data: { quarantined: true } },
    { id: "dep-damaged", data: { kind: "damaged" } },
    { id: "dep-expired-lot", data: { expiryDate: new Date("2020-01-01") } },
  ];
  for (const [index, entry] of cases.entries()) {
    await seedCommerceFixtures(db);
    await reserve({ id: `dep-invalid-${index}`, claimId: entry.id, claimLineId: "line-rice", quantity: "1" });
    await db.stockLot.update({ where: { id: "lot-rice" }, data: entry.data });
    const before = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();
    await assert.rejects(
      () => db.$transaction((tx) => depletion.consumeClaim(tx, input(entry.id, "1"))),
      expectReservationLost,
    );
    assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), before);
    assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: `dep-invalid-${index}` } })).state, "active");
    assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: entry.id } }), 0);
  }
});

test("physical quantity shortage fails atomically even when reservation coverage itself is exact", async () => {
  await reserve({ id: "dep-short-res", claimId: "dep-short", claimLineId: "line-rice", quantity: "5" });
  await db.stockLot.update({ where: { id: "lot-rice" }, data: { quantity: "4" } });

  await assert.rejects(
    () => db.$transaction((tx) => depletion.consumeClaim(tx, input("dep-short", "5"))),
    expectOutOfStock,
  );

  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), "4");
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: "dep-short-res" } })).state, "active");
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: "dep-short" } }), 0);
  assert.equal(await db.auditEvent.count({ where: { entityId: "dep-short", action: "inventory.depleted" } }), 0);
  assert.equal(await db.outboxEvent.count({ where: { aggregateId: "dep-short", type: "inventory.depleted" } }), 0);
});

test("missing or partial exact reservation coverage reaches no depletion writes", async () => {
  await reserve({ id: "dep-partial-res", claimId: "dep-partial", claimLineId: "line-rice", quantity: "1" });
  const before = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();
  await assert.rejects(
    () => db.$transaction((tx) => depletion.consumeClaim(tx, input("dep-partial", "2"))),
    expectReservationLost,
  );
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), before);
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: "dep-partial" } }), 0);
});

test("outbox failure rolls back lot decrement reservation consumption provenance and audit together", async () => {
  await reserve({ id: "dep-fault-res", claimId: "dep-fault", claimLineId: "line-rice", quantity: "2" });
  const before = (await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString();
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION reject_depletion_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='inventory.depleted' THEN RAISE EXCEPTION 'depletion outbox fault'; END IF; RETURN NEW; END; $$; CREATE TRIGGER reject_depletion_outbox BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION reject_depletion_outbox();`);
  try {
    await assert.rejects(() => db.$transaction((tx) => depletion.consumeClaim(tx, input("dep-fault"))));
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS reject_depletion_outbox ON "OutboxEvent"; DROP FUNCTION IF EXISTS reject_depletion_outbox();`);
  }
  assert.equal((await db.stockLot.findUniqueOrThrow({ where: { id: "lot-rice" } })).quantity.toString(), before);
  assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: "dep-fault-res" } })).state, "active");
  assert.equal(await db.stockDepletion.count({ where: { claimType: "order", claimId: "dep-fault" } }), 0);
  assert.equal(await db.stockDepletionLine.count(), 0);
  assert.equal(await db.auditEvent.count({ where: { entityId: "dep-fault", action: "inventory.depleted" } }), 0);
});
