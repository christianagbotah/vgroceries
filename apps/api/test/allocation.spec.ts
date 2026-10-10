import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { AllocationService } from "../src/inventory/allocation.service";

let app: INestApplication;
let second: INestApplication;
let db: Database;
let secondDb: Database;
let allocation: AllocationService;
let secondAllocation: AllocationService;

const futureDate = (days: number) => {
  const d = new Date(Date.now() + days * 86400000);
  return new Date(d.toISOString().slice(0, 10));
};

before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))
    throw Error("Tests require the isolated variety_foundation_test database");
  app = await createApplication();
  db = app.get(Database);
  allocation = app.get(AllocationService);
  second = await createApplication();
  secondDb = second.get(Database);
  secondAllocation = second.get(AllocationService);
  await db.$executeRawUnsafe(
    'TRUNCATE "User", "Category", "Location", "StockReceipt", "Idempotency", "AuditEvent", "OutboxEvent", "LoginThrottle" CASCADE',
  );
  await db.location.create({ data: { id: "loc_alloc", name: "Allocation" } });
  await db.category.create({ data: { id: "cat_alloc", slug: "alloc", name: "Allocation" } });
  for (const [id, unit, safetyStock] of [
    ["fefo", "kg", "1"],
    ["good", "piece", "0"],
    ["short", "piece", "0"],
    ["safe", "piece", "2"],
  ] as const) {
    await db.product.create({
      data: {
        id: `prd_${id}`,
        slug: id,
        name: id,
        categoryId: "cat_alloc",
        published: true,
        tags: [],
        variants: {
          create: {
            id: `var_${id}`,
            sku: `sku_${id}`,
            name: id,
            unit,
            priceMinor: 100,
            positions: {
              create: {
                id: `pos_${id}`,
                locationId: "loc_alloc",
                safetyStock,
              },
            },
          },
        },
      },
    });
  }
  await db.stockLot.createMany({
    data: [
      { id: "lot_expired", positionId: "pos_fefo", lotNumber: "expired", quantity: "100", expiryDate: new Date("2020-01-01") },
      { id: "lot_today", positionId: "pos_fefo", lotNumber: "today", quantity: "100", expiryDate: new Date(new Date().toISOString().slice(0, 10)) },
      { id: "lot_quarantine", positionId: "pos_fefo", lotNumber: "quarantine", quantity: "100", quarantined: true },
      { id: "lot_damaged", positionId: "pos_fefo", lotNumber: "damaged", quantity: "100", kind: "damaged" },
      { id: "lot_early", positionId: "pos_fefo", lotNumber: "early", quantity: "2", expiryDate: futureDate(5), createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "lot_late", positionId: "pos_fefo", lotNumber: "late", quantity: "3", expiryDate: futureDate(10), createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "lot_undated", positionId: "pos_fefo", lotNumber: "undated", quantity: "4", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "lot_good", positionId: "pos_good", lotNumber: "good", quantity: "5" },
      { id: "lot_short", positionId: "pos_short", lotNumber: "short", quantity: "1" },
      { id: "lot_safe", positionId: "pos_safe", lotNumber: "safe", quantity: "3" },
    ],
  });
});

beforeEach(async () => {
  await db.reservation.deleteMany();
});

after(async () => {
  await second?.close();
  await app?.close();
});

async function createClaim(claimId: string, lines: { claimLineId: string; variantId: string; quantity: string }[]) {
  return db.$transaction((tx) =>
    allocation.create(tx, {
      claimType: "order",
      claimId,
      locationId: "loc_alloc",
      expiresAt: new Date(Date.now() + 3600000),
      actorId: "actor_test",
      requestId: `req_${claimId}`,
      lines,
    }),
  );
}

test("allocation uses FEFO eligible lots and persists exact lot claims", async () => {
  const rows = await createClaim("ord_fefo", [
    { claimLineId: "line_fefo", variantId: "var_fefo", quantity: "5" },
  ]);
  assert.deepEqual(rows.map((r) => r.lotId), ["lot_early", "lot_late"]);
  assert.deepEqual(rows.map((r) => r.quantity), ["2", "3"]);
  const persisted = await db.reservation.findMany({
    where: { claimId: "ord_fefo" },
    orderBy: { lotId: "asc" },
  });
  assert.equal(persisted.length, 2);
  assert.equal(persisted.reduce((n, r) => n + Number(r.quantity), 0), 5);
  assert.deepEqual(new Set(persisted.map((r) => r.lotId)), new Set(["lot_early", "lot_late"]));
});

test("allocation rolls back every line when a later variant is short", async () => {
  await assert.rejects(
    () => createClaim("ord_rollback", [
      { claimLineId: "line_good", variantId: "var_good", quantity: "2" },
      { claimLineId: "line_short", variantId: "var_short", quantity: "2" },
    ]),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.equal(error.getStatus(), 409);
      assert.equal((error.getResponse() as { code: string }).code, "OUT_OF_STOCK");
      return true;
    },
  );
  assert.equal(await db.reservation.count({ where: { claimId: "ord_rollback" } }), 0);
});

test("allocation never crosses configured safety stock", async () => {
  await assert.rejects(
    () => createClaim("ord_safe", [
      { claimLineId: "line_safe", variantId: "var_safe", quantity: "2" },
    ]),
    (error: unknown) => {
      assert.ok(error instanceof ApiProblem);
      assert.equal((error.getResponse() as { code: string }).code, "OUT_OF_STOCK");
      return true;
    },
  );
  assert.equal(await db.reservation.count({ where: { claimId: "ord_safe" } }), 0);
});

test("release and expiry change active claims once without touching terminal rows", async () => {
  await createClaim("ord_release", [
    { claimLineId: "line_release", variantId: "var_good", quantity: "1" },
  ]);
  const released = await db.$transaction((tx) =>
    allocation.release(tx, "order", "ord_release", { actorId: "actor_release", requestId: "req_release" }),
  );
  assert.equal(released, 1);
  assert.equal(await db.$transaction((tx) => allocation.release(tx, "order", "ord_release")), 0);
  assert.equal(await db.auditEvent.count({ where: { action: "inventory.released", entityId: "ord_release" } }), 1);
  assert.equal(await db.outboxEvent.count({ where: { type: "inventory.released", aggregateId: "ord_release" } }), 1);
  assert.equal((await db.reservation.findFirstOrThrow({ where: { claimId: "ord_release" } })).state, "released");

  await createClaim("ord_expire", [
    { claimLineId: "line_expire", variantId: "var_good", quantity: "1" },
  ]);
  await db.reservation.updateMany({ where: { claimId: "ord_expire" }, data: { expiresAt: new Date(0) } });
  const expired = await db.$transaction((tx) =>
    allocation.expire(tx, new Date(), { actorId: "actor_expire", requestId: "req_expire" }),
  );
  assert.equal(expired, 1);
  assert.equal((await db.reservation.findFirstOrThrow({ where: { claimId: "ord_expire" } })).state, "expired");
  assert.equal((await db.reservation.findFirstOrThrow({ where: { claimId: "ord_release" } })).state, "released");
});


test("expiry audit and outbox identify each affected claim", async () => {
  await createClaim("ord_expire_audit_a", [
    { claimLineId: "line_expire_audit_a", variantId: "var_good", quantity: "1" },
  ]);
  await createClaim("ord_expire_audit_b", [
    { claimLineId: "line_expire_audit_b", variantId: "var_good", quantity: "1" },
  ]);
  await db.reservation.updateMany({
    where: { claimId: { in: ["ord_expire_audit_a", "ord_expire_audit_b"] } },
    data: { expiresAt: new Date(0) },
  });
  const expired = await db.$transaction((tx) =>
    allocation.expire(tx, new Date(), { actorId: "actor_expire_batch", requestId: "req_expire_batch" }),
  );
  assert.equal(expired, 2);
  const audit = await db.auditEvent.findMany({
    where: { action: "inventory.expired", requestId: "req_expire_batch" },
    orderBy: { entityId: "asc" },
  });
  const outbox = await db.outboxEvent.findMany({
    where: { type: "inventory.expired", payload: { path: ["requestId"], equals: "req_expire_batch" } },
    orderBy: { aggregateId: "asc" },
  });
  assert.deepEqual(audit.map((row) => row.entityId), ["ord_expire_audit_a", "ord_expire_audit_b"]);
  assert.deepEqual(outbox.map((row) => row.aggregateId), ["ord_expire_audit_a", "ord_expire_audit_b"]);
});

test("two independent allocators cannot both reserve the final unit", async () => {
  for (let round = 0; round < 10; round++) {
    await db.reservation.deleteMany();
    const expiresAt = new Date(Date.now() + 3600000);
    const attempt = (
      service: AllocationService,
      database: Database,
      claimId: string,
    ) =>
      database.$transaction((tx) =>
        service.create(tx, {
          claimType: "order",
          claimId,
          locationId: "loc_alloc",
          expiresAt,
          actorId: `actor_${claimId}`,
          requestId: `req_${claimId}`,
          lines: [
            { claimLineId: `line_${claimId}`, variantId: "var_short", quantity: "1" },
          ],
        }),
      );
    const results = await Promise.allSettled([
      attempt(allocation, db, `race_a_${round}`),
      attempt(secondAllocation, secondDb, `race_b_${round}`),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    const loser = results.find((r) => r.status === "rejected");
    assert.ok(loser && loser.status === "rejected");
    assert.ok(loser.reason instanceof ApiProblem);
    assert.equal((loser.reason.getResponse() as { code: string }).code, "OUT_OF_STOCK");
    const active = await db.reservation.findMany({
      where: { positionId: "pos_short", state: "active" },
    });
    assert.equal(active.reduce((sum, row) => sum + Number(row.quantity), 0), 1);
    const [availability] = await db.$queryRaw<{ availableToSell: { toString(): string } }[]>`
      SELECT "availableToSell" FROM variant_availability
      WHERE "variantId"='var_short' AND "locationId"='loc_alloc'`;
    assert.equal(availability.availableToSell.toString(), "0");
  }
});


test("successful allocation writes audit and outbox records in the same transaction", async () => {
  const rows = await createClaim("ord_events", [
    { claimLineId: "line_events", variantId: "var_good", quantity: "1" },
  ]);
  const audit = await db.auditEvent.findMany({ where: { entityId: "ord_events" } });
  const outbox = await db.outboxEvent.findMany({ where: { aggregateId: "ord_events" } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actorId, "actor_test");
  assert.equal(audit[0].requestId, "req_ord_events");
  assert.equal(audit[0].action, "inventory.allocated");
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].type, "inventory.allocated");
  const payload = outbox[0].payload as { reservationIds: string[]; variantIds: string[] };
  assert.deepEqual(payload.reservationIds, rows.map((row) => row.reservationId));
  assert.deepEqual(payload.variantIds, ["var_good"]);
});

test("outbox failure rolls back allocation, audit and event effects", async () => {
  await db.$executeRawUnsafe(
    "CREATE FUNCTION test_reject_allocation_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'inventory.allocated' THEN RAISE EXCEPTION 'allocation outbox fault'; END IF; RETURN NEW; END; $$",
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER test_allocation_outbox_failure BEFORE INSERT ON "OutboxEvent" FOR EACH ROW EXECUTE FUNCTION test_reject_allocation_outbox()',
  );
  try {
    await assert.rejects(() =>
      createClaim("ord_event_fail", [
        { claimLineId: "line_event_fail", variantId: "var_good", quantity: "1" },
      ]),
    );
    assert.equal(await db.reservation.count({ where: { claimId: "ord_event_fail" } }), 0);
    assert.equal(await db.auditEvent.count({ where: { entityId: "ord_event_fail" } }), 0);
    assert.equal(await db.outboxEvent.count({ where: { aggregateId: "ord_event_fail" } }), 0);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER test_allocation_outbox_failure ON "OutboxEvent"');
    await db.$executeRawUnsafe("DROP FUNCTION test_reject_allocation_outbox()");
  }
});
