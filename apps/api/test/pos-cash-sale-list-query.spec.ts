import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PosCashSalesService } from "../src/cashier-tills/pos-cash-sales.service";
import type { Database } from "../src/database/database";
import type { ApiConfig } from "../src/config";
import type { StockDepletionService } from "../src/inventory/stock-depletion.service";

/** Isolated query-efficiency tests, no PostgreSQL, sales or stock writes. */
function sale(n: number) {
  return {
    id: randomUUID(), reference: "VG-POS-TEST-" + n,
    holdId: randomUUID(), tillSessionId: randomUUID(),
    locationId: "loc_accra", soldByUserId: "staff-admin",
    stockDepletionId: randomUUID(), customerMode: "walk_in",
    customerUserId: null, customerName: "Walk-in Customer",
    subtotalMinor: 1250, cashReceivedMinor: 1500, changeGivenMinor: 250,
    cashCountConfirmed: true, goodsHandedOver: true,
    handoverNote: "Counted at counter with original receipt.",
    createdAt: new Date("2026-11-20T09:00:00Z"),
    hold: { lines: [{
      id: randomUUID(), variantId: "rice-1kg",
      quantity: { toString: () => "1" },
      unitPriceMinor: 1250, lineTotalMinor: 1250,
    }] },
  };
}

function setup(data: ReturnType<typeof sale>[], enabled = true) {
  let listCalls = 0;
  let detailCalls = 0;
  let receivedOptions: unknown;
  const fakeDb = {
    posCashSale: {
      findMany: async (options: unknown) => {
        listCalls++;
        receivedOptions = options;
        return data;
      },
      findUnique: async () => {
        detailCalls++;
        throw new Error("N+1 detail query must not occur on history list");
      },
    },
  } as unknown as Database;
  const cfg = {
    posCashSalesEnabled: enabled,
    commerce: { locationId: "loc_accra" },
  } as ApiConfig;
  const instance = new PosCashSalesService(
    fakeDb, cfg, {} as StockDepletionService,
  );
  return {
    instance,
    activity: () => ({ listCalls, detailCalls, receivedOptions }),
  };
}

test("cash history loads at most 50 sales with original hold lines, not N+1 detail queries", async () => {
  const data = Array.from({ length: 50 }, (_, i) => sale(i));
  const { instance, activity } = setup(data);
  const result = await instance.list();
  assert.equal(result.enabled, true);
  assert.equal(result.sales.length, 50);
  assert.equal(result.sales[0]?.reference, "VG-POS-TEST-0");
  assert.equal(result.sales[49]?.reference, "VG-POS-TEST-49");
  assert.deepEqual(result.sales[0]?.lines[0], {
    variantId: "rice-1kg", quantity: "1",
    unitPriceMinor: 1250, lineTotalMinor: 1250,
  });
  assert.deepEqual(activity(), {
    listCalls: 1,
    detailCalls: 0,
    receivedOptions: {
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      include: {
        hold: {
          include: {
            lines: { orderBy: [{ variantId: "asc" }, { id: "asc" }] },
          },
        },
      },
    },
  });
});

test("cash history default-off safety prevents any database read", async () => {
  const { instance, activity } = setup([sale(1)], false);
  await assert.rejects(() => instance.list(), /not activated/i);
  assert.equal(activity().listCalls, 0);
  assert.equal(activity().detailCalls, 0);
});

test("cash history rejects corrupt joined financial details", async () => {
  const row = sale(1);
  row.hold.lines[0]!.lineTotalMinor = -100;
  const { instance, activity } = setup([row]);
  await assert.rejects(() => instance.list());
  assert.equal(activity().listCalls, 1);
  assert.equal(activity().detailCalls, 0);
});

test("cash history accepts no sales in one bounded read", async () => {
  const { instance, activity } = setup([]);
  assert.deepEqual(await instance.list(), { enabled: true, sales: [] });
  assert.equal(activity().listCalls, 1);
  assert.equal(activity().detailCalls, 0);
});
