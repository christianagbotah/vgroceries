import { test } from "node:test";
import assert from "node:assert/strict";
import { InventoryService } from "../src/inventory/inventory.service";
import { ApiProblem } from "../src/http/errors";

const admin = { actor: { id: "admin", role: "admin", locationIds: [] } } as never;
const staff = { actor: { id: "inventory", role: "inventory_manager", locationIds: ["loc_accra"] } } as never;

test("receipt history is limited to authorized branch and displays immutable original quantity", async () => {
  let branch = "";
  const db = {
    location: { findUnique: async () => ({ active: true }) },
    stockReceipt: { findMany: async (args: {
      where: { lots: { some: { position: { locationId: string } } } };
      include: { lots: { where: { position: { locationId: string } } } };
    }) => {
      branch = args.where.lots.some.position.locationId;
      assert.equal(args.include.lots.where.position.locationId, "loc_accra");
      return [{
        id: "receipt1", receivedBy: "user1", note: "Direct delivery",
        poRef: "INV-111", createdAt: new Date("2026-11-13T15:25:00.000Z"),
        lots: [{
          lotNumber: "LOT-01", quantity: { toString: () => "2.000" },
          expiryDate: new Date("2027-02-01T00:00:00.000Z"),
          movements: [{ delta: { toString: () => "10.000" } }],
          position: { variant: { name: "1kg", product: { name: "Rice" } } },
        }],
      }];
    } },
    user: { findMany: async () => [{ id: "user1", name: "Warehouse Staff" }] },
  };
  const service = new InventoryService(db as never, { stockLocationId: "loc_accra" } as never);
  const rows = await service.receipts(staff);
  assert.equal(branch, "loc_accra");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].receivedAtLabel, "13-11-2026 15:25");
  assert.equal(rows[0].receivedBy, "Warehouse Staff");
  assert.equal(rows[0].lines[0].quantity, "10.000");
  assert.equal(rows[0].lines[0].expiryDate, "2027-02-01");
  assert.equal(rows[0].poRef, "INV-111");
});
test("receipt history never queries unauthorized stock branches", async () => {
  let queried = false;
  const db = {
    location: { findUnique: async () => { queried = true; return { active: true }; } },
  };
  const service = new InventoryService(db as never, { stockLocationId: "loc_accra" } as never);
  await assert.rejects(service.receipts(staff, "another"),
    (e: unknown) => e instanceof ApiProblem && e.getStatus() === 403);
  assert.equal(queried, false);
});
test("receipt history refuses silent truncation of audit records", async () => {
  const db = {
    location: { findUnique: async () => ({ active: true }) },
    stockReceipt: { findMany: async () => new Array(501).fill({}) },
  };
  const service = new InventoryService(db as never, { stockLocationId: "loc_accra" } as never);
  await assert.rejects(service.receipts(admin),
    (e: unknown) => e instanceof ApiProblem && e.getStatus() === 409);
});
