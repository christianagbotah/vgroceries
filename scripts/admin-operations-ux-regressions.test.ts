/// <reference types="bun-types" />
import { beforeEach, describe, expect, test } from "bun:test";
import { resetStore } from "../src/services/mock/store";
import { handleApi } from "../src/services/mock/router";
import { filterPurchases, filterSuppliers } from "../src/features/staff/admin-operations-ux";

beforeEach(() => resetStore());

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function req<T>(path: string, options: { body?: Record<string, unknown>; query?: Record<string, string> } = {}) {
  const response = await handleApi({
    path,
    method: options.body ? "POST" : "GET",
    query: new URLSearchParams(options.query ?? {}),
    body: options.body ?? {},
  });
  return response.json as ApiEnvelope<T>;
}

function okData<T>(response: ApiEnvelope<T>): T {
  expect(response.ok).toBe(true);
  return (response as { ok: true; data: T }).data;
}

describe("admin operations filters", () => {
  test("supplier filters combine search and active state", () => {
    const rows = [
      { id: "1", name: "Accra Agro", phone: "+23320", email: "sales@agro.test", notes: "fresh produce", isActive: true, poCount: 2, openPoCount: 1 },
      { id: "2", name: "Tema Cold Chain", phone: "+23330", email: "cold@tema.test", notes: "frozen", isActive: false, poCount: 1, openPoCount: 0 },
    ];
    expect(filterSuppliers(rows, "tema", "inactive").map((row) => row.id)).toEqual(["2"]);
    expect(filterSuppliers(rows, "fresh", "active").map((row) => row.id)).toEqual(["1"]);
    expect(filterSuppliers(rows, "cold", "active")).toEqual([]);
  });

  test("purchase filters combine search status and supplier", () => {
    const rows = [
      { id: "a", reference: "PO-0010", supplierId: "sup_01", supplierName: "Makola", status: "draft", createdAtLabel: "now", lines: [] },
      { id: "b", reference: "PO-0011", supplierId: "sup_03", supplierName: "Tema Cold", status: "sent", createdAtLabel: "now", lines: [] },
    ];
    expect(filterPurchases(rows, { query: "tema", status: "sent", supplierId: "sup_03" }).map((row) => row.id)).toEqual(["b"]);
    expect(filterPurchases(rows, { query: "0010", status: "draft", supplierId: "all" }).map((row) => row.id)).toEqual(["a"]);
    expect(filterPurchases(rows, { query: "makola", status: "sent", supplierId: "all" })).toEqual([]);
  });
});

describe("supplier and purchase-order mutations", () => {
  test("supplier update changes contact fields and active state", async () => {
    const updated = await req<{ done: true }>("admin.suppliers.update", {
      body: {
        supplierId: "sup_02",
        name: "Accra Agro Foods - East",
        phone: "+233201111111",
        email: "east@example.test",
        notes: "Morning deliveries only",
        isActive: false,
        actor: "stf_ama",
      },
    });
    okData(updated);

    const suppliers = okData(await req<Array<{ id: string; name: string; phone: string; email?: string; notes: string; isActive: boolean }>>("admin.suppliers"));
    const supplier = suppliers.find((row) => row.id === "sup_02");
    expect(supplier).toMatchObject({
      name: "Accra Agro Foods - East",
      phone: "+233201111111",
      email: "east@example.test",
      notes: "Morning deliveries only",
      isActive: false,
    });
  });

  test("draft purchase order can be edited and returns raw editable identifiers", async () => {
    const created = okData(await req<{ poId: string }>("admin.purchases.create", {
      body: {
        supplierId: "sup_01",
        expectedAt: "2026-11-05T00:00:00.000Z",
        note: "Initial draft",
        lines: [{ variantId: "var_ric1_5", quantity: "2", unitCostMinor: 10100 }],
        actor: "stf_ama",
      },
    }));

    okData(await req<{ done: true }>("admin.purchases.update", {
      body: {
        poId: created.poId,
        supplierId: "sup_03",
        expectedAt: "2026-11-07T00:00:00.000Z",
        note: "Revised draft",
        lines: [{ variantId: "var_fml_1l", quantity: "4", unitCostMinor: 1400 }],
        actor: "stf_ama",
      },
    }));

    const purchases = okData(await req<Array<{
      id: string; supplierId: string; expectedAt?: string; note?: string;
      lines: Array<{ variantId: string; quantity: string; unitCostMinor: number }>;
    }>>("admin.purchases"));
    const purchase = purchases.find((row) => row.id === created.poId);
    expect(purchase).toMatchObject({ supplierId: "sup_03", expectedAt: "2026-11-07T00:00:00.000Z", note: "Revised draft" });
    expect(purchase?.lines).toEqual([{ variantId: "var_fml_1l", productName: "Fresh Pasteurised Milk", variantName: "1 litre", quantity: "4", unitCostMinor: 1400, unitCostLabel: "₵14.00" }]);
  });

  test("non-draft purchase order rejects edits", async () => {
    const response = await req("admin.purchases.update", {
      body: { poId: "po_rice", note: "should not change", actor: "stf_ama" },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.message).toContain("Only draft purchase orders can be edited");
  });
});

describe("report date filtering", () => {
  test("default reports preserve all-time operational aggregates for dashboard callers", async () => {
    const { getStore } = await import("../src/services/mock/store");
    const store = getStore();
    const oldOrder = store.orders[0];
    oldOrder.createdAt = "2020-01-01T12:00:00.000Z";
    const expectedStatusCount = store.orders.filter((order) => order.fulfilmentStatus === oldOrder.fulfilmentStatus).length;

    const report = okData(await req<{ fulfilmentCounts: Record<string, number> }>("admin.reports"));
    expect(report.fulfilmentCounts[oldOrder.fulfilmentStatus]).toBe(expectedStatusCount);
  });

  test("date range is inclusive and controls the returned sales-day window", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const report = okData(await req<{ salesByDay: Array<{ date: string }> }>("admin.reports", { query: { from: today, to: today } }));
    expect(report.salesByDay.map((row) => row.date)).toEqual([today]);
  });

  test("future range removes activity aggregates while preserving current stock snapshot", async () => {
    const report = okData(await req<{
      salesByDay: Array<{ date: string; orders: number }>;
      topProducts: unknown[];
      fulfilmentCounts: Record<string, number>;
      deliveryCounts: Record<string, number>;
      returnsSummary: { total: number; refundedMinor: number };
      paymentsReconciliation: { settled: number; unsettled: number; exceptions: number };
      stockValue: { sellableUnits: number };
    }>("admin.reports", { query: { from: "2099-01-01", to: "2099-01-02" } }));

    expect(report.salesByDay).toEqual([
      { date: "2099-01-01", onlineMinor: 0, posMinor: 0, orders: 0 },
      { date: "2099-01-02", onlineMinor: 0, posMinor: 0, orders: 0 },
    ]);
    expect(report.topProducts).toEqual([]);
    expect(report.fulfilmentCounts).toEqual({});
    expect(report.deliveryCounts).toEqual({});
    expect(report.returnsSummary).toMatchObject({ total: 0, refundedMinor: 0 });
    expect(report.paymentsReconciliation).toEqual({ settled: 0, unsettled: 0, exceptions: 0 });
    expect(report.stockValue.sellableUnits).toBeGreaterThan(0);
  });
});
