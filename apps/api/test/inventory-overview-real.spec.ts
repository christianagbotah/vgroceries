import { test } from "node:test";
import assert from "node:assert/strict";
import { InventoryService } from "../src/inventory/inventory.service";
import { ApiProblem } from "../src/http/errors";

const number = (text: string) => ({
  toString: () => text,
  gt: (n: number) => Number(text) > n,
});
const actor = { actor: { id: "admin-fixture", role: "admin", locationIds: [] } } as never;
const staff = { actor: { id: "inventory-fixture", role: "inventory_manager", locationIds: ["loc_accra"] } } as never;

test("stock overview reports real pagination, filtered totals and latest movement", async () => {
  const queries: unknown[][] = [];
  const db = {
    location: { findUnique: async () => ({ active: true }) },
    $transaction: async (run: (tx: unknown) => Promise<unknown>, opts: { isolationLevel: string }) => {
      assert.equal(opts.isolationLevel, "RepeatableRead");
      let n = 0;
      const results = [
        [{
          variantId: "v1", productId: "p1", productName: "Rice", variantName: "1kg",
          unit: "kg", image: "/rice.webp",
          sellablePhysical: number("10.000"), reserved: number("2.000"),
          safetyStock: number("1.000"), availableToSell: number("7.000"),
          lotCount: 2n, nextExpiry: new Date("2026-12-01T00:00:00.000Z"),
          lastMovement: "goods_received",
          lastMovementAt: new Date("2026-11-13T11:00:00.000Z"),
        }],
        [{ total: 3n }],
        [{
          sellablePhysical: number("30.000"), reserved: number("4.000"),
          safetyStock: number("2.000"), availableToSell: number("24.000"),
        }],
        [{ quarantined: number("3.000"), damagedExpired: number("1.000") }],
      ];
      return run({ $queryRaw: async (...sql: unknown[]) => {
        queries.push(sql);
        return results[n++];
      } });
    },
  };
  const service = new InventoryService(db as never, { stockLocationId: "loc_accra" } as never);
  const r = await service.overview(staff, {
    q: "rice", filter: "reserved", page: 2, perPage: 1,
  });
  assert.equal(r.locationId, "loc_accra");
  assert.equal(r.page, 2);
  assert.equal(r.perPage, 1);
  assert.equal(r.total, 3);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].availableToSell, "7.000");
  assert.equal(r.rows[0].lotCount, 2);
  assert.equal(r.rows[0].lastMovement, "goods_received");
  assert.equal(r.rows[0].nextExpiry, "2026-12-01T00:00:00.000Z");
  assert.equal(r.summary.sellablePhysical, "30.000");
  assert.equal(r.summary.quarantined, "3.000");
  assert.equal(r.summary.damagedExpired, "1.000");
  assert.equal(queries.length, 4);
  // Prisma's query tag receives the literal template plus bound arguments.
  const values = queries[0].slice(1);
  assert.ok(values.includes("reserved"));
  assert.ok(values.includes("rice"));
  assert.ok(values.includes(1));
});
test("nonadmin cannot cross-branch query inventory overview or lot ledger", async () => {
  let calls = 0;
  const db = {
    location: { findUnique: async () => { calls++; return { active: true }; } },
    stockLot: { findMany: async () => [] },
  };
  const service = new InventoryService(db as never, { stockLocationId: "loc_accra" } as never);
  await assert.rejects(service.overview(staff, {
    q: "", filter: "all", page: 1, perPage: 48, locationId: "other",
  }), (e: unknown) => e instanceof ApiProblem && e.getStatus() === 403);
  await assert.rejects(service.lots(staff, "other"),
    (e: unknown) => e instanceof ApiProblem && e.getStatus() === 403);
  assert.equal(calls, 0);
});
test("lot ledger suppresses empty lots and includes recorded expired balance", async () => {
  let scope = "";
  const today = new Date().toISOString().slice(0, 10);
  const db = {
    location: { findUnique: async () => ({ active: true, name: "Accra Main" }) },
    stockLot: { findMany: async (args: {
      where: { position: { locationId: string; variantId?: string }; quantity: { gt: number } };
    }) => {
      assert.equal(args.where.quantity.gt, 0);
      scope = args.where.position.locationId;
      assert.equal(args.where.position.variantId, "v1");
      return [{
        id: "lot1", lotNumber: "OCT-2026", quantity: number("1.500"),
        kind: "regular", quarantined: false, expiryDate: new Date(today + "T00:00:00Z"),
        position: { variantId: "v1", variant: { name: "1kg", product: { name: "Rice" } } },
      }];
    } },
  };
  const service = new InventoryService(db as never, { stockLocationId: "loc_accra" } as never);
  const lots = await service.lots(actor, "loc_accra", "v1");
  assert.equal(scope, "loc_accra");
  assert.equal(lots.length, 1);
  assert.equal(lots[0].expired, true);
  assert.equal(lots[0].quantity, "1.500");
  assert.equal(lots[0].location, "Accra Main");
});
test("lot ledger refuses silent truncation and does not expose a partial report", async () => {
  const db = {
    location: { findUnique: async () => ({ active: true, name: "Accra" }) },
    stockLot: { findMany: async () => new Array(1001).fill({}) },
  };
  const service = new InventoryService(db as never, { stockLocationId: "loc_accra" } as never);
  await assert.rejects(service.lots(actor),
    (e: unknown) => e instanceof ApiProblem && e.getStatus() === 409);
});
