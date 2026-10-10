import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { ApiProblem } from "../src/http/errors";
import { AllocationService } from "../src/inventory/allocation.service";

let app: INestApplication;
let db: Database;
let allocation: AllocationService;

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
  await app?.close();
});

async function createClaim(claimId: string, lines: { claimLineId: string; variantId: string; quantity: string }[]) {
  return db.$transaction((tx) =>
    allocation.create(tx, {
      claimType: "order",
      claimId,
      locationId: "loc_alloc",
      expiresAt: new Date(Date.now() + 3600000),
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
  const released = await db.$transaction((tx) => allocation.release(tx, "order", "ord_release"));
  assert.equal(released, 1);
  assert.equal(await db.$transaction((tx) => allocation.release(tx, "order", "ord_release")), 0);
  assert.equal((await db.reservation.findFirstOrThrow({ where: { claimId: "ord_release" } })).state, "released");

  await createClaim("ord_expire", [
    { claimLineId: "line_expire", variantId: "var_good", quantity: "1" },
  ]);
  await db.reservation.updateMany({ where: { claimId: "ord_expire" }, data: { expiresAt: new Date(0) } });
  const expired = await db.$transaction((tx) => allocation.expire(tx, new Date()));
  assert.equal(expired, 1);
  assert.equal((await db.reservation.findFirstOrThrow({ where: { claimId: "ord_expire" } })).state, "expired");
  assert.equal((await db.reservation.findFirstOrThrow({ where: { claimId: "ord_release" } })).state, "released");
});
