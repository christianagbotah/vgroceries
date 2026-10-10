/// <reference types="bun-types" />
import { beforeEach, describe, expect, test } from "bun:test";
import { getStore, resetStore, type VgStore } from "../src/services/mock/store";
import { completeSale } from "../src/services/mock/engine/pos";
import { createReturn, decideReturn, inspectReturn, receiveReturn } from "../src/services/mock/engine/returns";
import { sellablePhysical } from "../src/services/mock/engine/availability";
import { consumeLots, disposeLot } from "../src/services/mock/engine/inventory";
import { tryReserve } from "../src/services/mock/engine/orders";

beforeEach(() => resetStore());

function twoItemReturn(store: VgStore) {
  const variants = ["var_tof_1", "var_sar_125"];
  const sale = completeSale(store, {
    sessionId: "cash_02", cashierId: "stf_adjoa",
    lines: variants.map((variantId) => ({ variantId, quantity: "1" })),
    method: "cash_counter", cashReceivedMinor: 10000,
    idempotencyKey: "return-stock-regression",
  });
  const before = variants.map((id) => sellablePhysical(store, id));
  const ret = createReturn(store, {
    orderId: sale.order.id, requestedBy: "staff",
    lines: sale.order.lines.map((orderLineId) => ({ orderLineId, quantity: "1", reason: "Both items returned" })),
  });
  decideReturn(store, ret.id, "approve", "stf_ama", "Received both items");
  receiveReturn(store, ret.id, "stf_ama");
  return { variants, before, ret };
}

describe("return stock disposition", () => {
  test("reclassifying a multi-item saleable return removes every prior saleable credit", () => {
    const store = getStore();
    const { variants, before, ret } = twoItemReturn(store);
    inspectReturn(store, ret.id, "restock_saleable", "stf_ama", "Approved restock");
    inspectReturn(store, ret.id, "damaged_unsaleable", "stf_ama", "Both items failed reinspection");
    expect(variants.map((id) => sellablePhysical(store, id))).toEqual(before);
  });

  test("reclassifying a multi-item quarantine return retains zeroed original lots", () => {
    const store = getStore();
    const { ret } = twoItemReturn(store);
    inspectReturn(store, ret.id, "quarantine_pending", "stf_ama", "Inspection pending");
    const quarantinedIds = store.lots.filter((lot) => lot.lotNumber === `L-QUA-${ret.reference}`).map((lot) => lot.id);
    expect(quarantinedIds.length).toBe(2);
    inspectReturn(store, ret.id, "restock_saleable", "stf_ama", "Both items verified");
    expect(quarantinedIds.map((id) => store.lots.find((lot) => lot.id === id)?.quantity)).toEqual(["0", "0"]);
  });

  test("mixed original lots do not extend an expired item's expiry", () => {
    const store = getStore();
    const ret = store.returnRequests.find((entry) => entry.id === "ret_2002")!;
    const returned = store.returnLines.find((line) => line.id === ret.lines[0])!;
    const line = store.orderLines.find((entry) => entry.id === returned.orderLineId)!;
    const original = store.lots.find((lot) => lot.variantId === line.variantId)!;
    const earlier = new Date(Date.now() - 86400000).toISOString();
    const later = new Date(Date.now() + 30 * 86400000).toISOString();
    original.expiryDate = earlier;
    store.lots.push({ ...original, id: "later-original-lot", lotNumber: "LATER", quantity: "0", expiryDate: later });
    line.allocations = [{ lotId: original.id, quantity: "1" }, { lotId: "later-original-lot", quantity: "2" }];
    decideReturn(store, ret.id, "approve", "stf_ama", "Mixed original lots");
    receiveReturn(store, ret.id, "stf_ama");
    const before = sellablePhysical(store, line.variantId);
    inspectReturn(store, ret.id, "restock_saleable", "stf_ama", "Conservative expiry");
    const restocked = store.lots.find((lot) => lot.id === ret.disposition?.lotId)!;
    expect(restocked.expiryDate).toBe(earlier);
    expect(sellablePhysical(store, line.variantId)).toBe(before);
  });

  test("a return with one known original lot preserves its expiry exactly", () => {
    const store = getStore();
    const ret = store.returnRequests.find((entry) => entry.id === "ret_2002")!;
    const returned = store.returnLines.find((line) => line.id === ret.lines[0])!;
    const line = store.orderLines.find((entry) => entry.id === returned.orderLineId)!;
    const original = store.lots.find((lot) => lot.variantId === line.variantId)!;
    const expiry = new Date(Date.now() + 7 * 86400000).toISOString();
    original.expiryDate = expiry;
    line.allocations = [{ lotId: original.id, quantity: returned.quantity }];
    decideReturn(store, ret.id, "approve", "stf_ama", "Known lot");
    receiveReturn(store, ret.id, "stf_ama");
    inspectReturn(store, ret.id, "restock_saleable", "stf_ama", "Verified lot");
    expect(store.lots.find((lot) => lot.id === ret.disposition?.lotId)?.expiryDate).toBe(expiry);
  });

  test("reclassification rejects moved stock before mutating any returned lot", () => {
    const store = getStore();
    const { ret } = twoItemReturn(store);
    inspectReturn(store, ret.id, "restock_saleable", "stf_ama", "Approved restock");
    const restocked = store.lots.find((lot) => lot.lotNumber === `L-RET-${ret.reference}`)!;
    for (const lot of store.lots) {
      if (lot.variantId === restocked.variantId && lot.id !== restocked.id) lot.quantity = "0";
    }
    consumeLots(store, restocked.variantId, "1", "later-sale", "stf_adjoa", "sale");
    const before = JSON.stringify({ lots: store.lots, movements: store.movements, ret, audit: store.audit });
    expect(() => inspectReturn(store, ret.id, "damaged_unsaleable", "stf_ama", "Stock already moved")).toThrow(/moved|changed|reconcil/i);
    expect(JSON.stringify({ lots: store.lots, movements: store.movements, ret, audit: store.audit })).toBe(before);
  });

  test("reclassification protects active reservations without partial reversal", () => {
    const store = getStore();
    const { ret } = twoItemReturn(store);
    inspectReturn(store, ret.id, "restock_saleable", "stf_ama", "Approved restock");
    tryReserve(store, [{ variantId: "var_sar_125", quantity: "1" }], "later-order", "online", 30);
    const before = JSON.stringify({ lots: store.lots, movements: store.movements, ret, audit: store.audit });
    expect(() => inspectReturn(store, ret.id, "damaged_unsaleable", "stf_ama", "Reservation still active")).toThrow(/reserv|reconcil/i);
    expect(JSON.stringify({ lots: store.lots, movements: store.movements, ret, audit: store.audit })).toBe(before);
  });

  test("legacy multi-item returns require complete stock history before reclassification", () => {
    const store = getStore();
    const { ret } = twoItemReturn(store);
    inspectReturn(store, ret.id, "restock_saleable", "stf_ama", "Approved restock");
    // Older versions retained only the last credited lot, even for multiple items.
    const effects = ret.disposition!.stockLots!;
    ret.disposition!.lotId = effects[effects.length - 1].lotId;
    delete ret.disposition!.stockLots;
    const before = JSON.stringify({ lots: store.lots, movements: store.movements, ret, audit: store.audit });
    expect(() => inspectReturn(store, ret.id, "damaged_unsaleable", "stf_ama", "Legacy inspection")).toThrow(/incomplete stock history/i);
    expect(JSON.stringify({ lots: store.lots, movements: store.movements, ret, audit: store.audit })).toBe(before);
  });

  test("legacy disposed quarantine stock cannot be recreated using its remaining quantity", () => {
    const store = getStore();
    const ret = store.returnRequests.find((entry) => entry.id === "ret_2002")!;
    decideReturn(store, ret.id, "approve", "stf_ama", "Received goods");
    receiveReturn(store, ret.id, "stf_ama");
    inspectReturn(store, ret.id, "quarantine_pending", "stf_ama", "Inspection pending");
    const lotId = ret.disposition!.lotId!;
    delete ret.disposition!.stockLots;
    // Older quarantine records lacked a movement recording the original credit.
    store.movements = store.movements.filter((movement) => movement.reference !== ret.id || movement.lotId !== lotId);
    disposeLot(store, lotId, "stf_ama", "Goods disposed after quarantine");
    const before = JSON.stringify({ lots: store.lots, movements: store.movements, ret, audit: store.audit });
    expect(() => inspectReturn(store, ret.id, "restock_saleable", "stf_ama", "Legacy inspection")).toThrow(/incomplete stock history/i);
    expect(JSON.stringify({ lots: store.lots, movements: store.movements, ret, audit: store.audit })).toBe(before);
  });
});
