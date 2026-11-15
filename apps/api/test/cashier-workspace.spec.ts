import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApiConfig } from "../src/config";
import type { Database } from "../src/database/database";
import type { AuthRequest } from "../src/identity/identity.service";
import { ApiProblem } from "../src/http/errors";
import { CashierWorkspaceService } from "../src/cashier-tills/cashier-workspace.service";
import { cashierWorkspaceSchema } from "@variety/contracts";

const cashier = (role = "cashier"): AuthRequest => ({
  actor: { id: "cashier-a", name: "Staff A", role, locationIds: ["old-branch"] },
}) as unknown as AuthRequest;

type Query = Record<string, unknown>;
function fakeDb(grants: Array<{locationId:string;location:{id:string;name:string}}>) {
  const queried: Record<string, Query[]> = { grants: [], tills: [], sales: [] };
  const db = {
    userLocation: {
      findMany: async (query: Query) => {
        queried.grants.push(query);
        return grants;
      },
    },
    cashierTillSession: {
      findMany: async (query: Query) => {
        queried.tills.push(query);
        return [{
          id: "till-a", locationId: "branch-1", tillCode: "COUNTER1",
          openedAt: new Date("2026-11-15T08:00:00.000Z"),
        }];
      },
    },
    posCashSale: {
      findMany: async (query: Query) => {
        queried.sales.push(query);
        return [{
          id: "sale-a", reference: "VG-CASH-001",
          locationId: "branch-1", tillSessionId: "till-a",
          subtotalMinor: 2500,
          createdAt: new Date("2026-11-15T09:00:00.000Z"),
        }];
      },
    },
  } as unknown as Database;
  return { db, queried };
}
const grant = [{ locationId: "branch-1", location: { id: "branch-1", name: "Accra" } }];
const configuration = (enabled = true, sales = true) => ({
  posTillFoundationEnabled: enabled,
  posCashSalesEnabled: sales,
}) as ApiConfig;

test("cashier workspace denies admin, inventory, customer and rider roles", async () => {
  const { db, queried } = fakeDb(grant);
  const workspace = new CashierWorkspaceService(db, configuration());
  for (const role of ["admin", "inventory_manager", "customer", "rider"]) {
    await assert.rejects(() => workspace.read(cashier(role)), (error: unknown) =>
      error instanceof ApiProblem && error.getStatus() === 403);
  }
  assert.equal(queried.grants.length, 0);
  assert.equal(queried.tills.length, 0);
  assert.equal(queried.sales.length, 0);
});

test("cashier without active branch assignment gets 403, not global POS data", async () => {
  const { db, queried } = fakeDb([]);
  const workspace = new CashierWorkspaceService(db, configuration());
  await assert.rejects(() => workspace.read(cashier()), (error: unknown) =>
    error instanceof ApiProblem && error.getStatus() === 403);
  assert.equal(queried.tills.length, 0);
  assert.equal(queried.sales.length, 0);
});

test("cashier sees only active assigned branches, open tills and own sales", async () => {
  const { db, queried } = fakeDb(grant);
  const result = await new CashierWorkspaceService(db, configuration()).read(cashier());
  assert.deepEqual(cashierWorkspaceSchema.parse(result), result);
  assert.deepEqual(result.locations, [{ id: "branch-1", name: "Accra" }]);
  assert.equal(result.openTills.length, 1);
  assert.equal(result.ownRecentCashSales.length, 1);
  assert.equal(result.ownRecentCashSales[0].subtotalMinor, 2500);
  assert.ok(!("cashReceivedMinor" in result.ownRecentCashSales[0]));
  assert.ok(!("customerPhone" in result.ownRecentCashSales[0]));
  assert.ok(!("openingFloatMinor" in result.openTills[0]));
  assert.deepEqual(queried.grants[0].where, {
    userId: "cashier-a",
    user: { is: { role: "cashier", active: true } },
    location: { is: { active: true } },
  });
  assert.deepEqual(queried.tills[0].where, {
    locationId: { in: ["branch-1"] },
    status: "open",
  });
  assert.deepEqual(queried.sales[0].where, {
    locationId: { in: ["branch-1"] },
    soldByUserId: "cashier-a",
  });
  assert.equal(queried.tills[0].take, 30);
  assert.equal(queried.sales[0].take, 25);
});

test("disabled till or sales flags block operational reads", async () => {
  const off = fakeDb(grant);
  const resultOff = await new CashierWorkspaceService(
    off.db, configuration(false, true),
  ).read(cashier());
  assert.deepEqual(resultOff.openTills, []);
  assert.deepEqual(resultOff.ownRecentCashSales, []);
  assert.equal(resultOff.enabled, false);
  assert.equal(resultOff.cashSalesEnabled, false);
  assert.equal(off.queried.tills.length, 0);
  assert.equal(off.queried.sales.length, 0);

  const salesOff = fakeDb(grant);
  const resultSalesOff = await new CashierWorkspaceService(
    salesOff.db, configuration(true, false),
  ).read(cashier());
  assert.equal(resultSalesOff.enabled, true);
  assert.equal(resultSalesOff.cashSalesEnabled, false);
  assert.equal(resultSalesOff.openTills.length, 1);
  assert.deepEqual(resultSalesOff.ownRecentCashSales, []);
  assert.equal(salesOff.queried.sales.length, 0);
});

test("contract refuses customer identity, POS authority and drawer money fields", () => {
  const empty = {
    enabled: false, cashSalesEnabled: false,
    locations: [], openTills: [], ownRecentCashSales: [],
  };
  assert.ok(cashierWorkspaceSchema.safeParse(empty).success);
  assert.equal(cashierWorkspaceSchema.safeParse({
    ...empty, permissionToChargeCustomer: true,
  }).success, false);
  assert.equal(cashierWorkspaceSchema.safeParse({
    ...empty,
    ownRecentCashSales: [{
      id: "sale", reference: "1", locationId: "branch",
      tillSessionId: "till", subtotalMinor: 1000,
      createdAt: "2026-11-15T09:00:00.000Z",
      customerPhone: "0241111111",
    }],
  }).success, false);
});
