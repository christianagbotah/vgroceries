import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HttpServiceAdapter } from "../src/services/adapters/http";
import { restEndpoints } from "../src/services/contracts/endpoints";
import { operationMeta } from "../src/services/operation-registry";
import {
  parseVerifiedTillChoices,
  parseVerifiedTillReconciliation,
  verifiedTillCashCsvUrl,
} from "../src/features/staff/verified-pos-till-reconciliation-client";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const root = resolve(import.meta.dir, "..");
const id = "00000000-0000-4000-8000-000000000001";
const another = "00000000-0000-4000-8000-000000000002";
const report = {
  tillSessionId: id, locationId: "main", tillCode: "TILL-01",
  status: "open" as const, openedAt: "2026-11-19T08:00:00.000Z",
  closedAt: null, generatedAt: "2026-11-19T11:30:00.000Z",
  openingFloatMinor: 10000, manualCashInMinor: 2000,
  manualCashOutMinor: 500, manualCashDropsMinor: 1000,
  cashSalesMinor: 4500, cashSalesCount: 2,
  expectedDrawerCashMinor: 15000, actualCountedCashMinor: null,
  closingExpectedCashMinor: null, closingDifferenceMinor: null,
  recomputedDifferenceMinor: null, closingMatchesLedger: null,
  activeStockHoldsCount: 1,
  recentCashSales: [
    { id: another, reference: "VG-POS-A", createdAt: "2026-11-19T09:00:00.000Z", amountMinor: 2500 },
    { id: "00000000-0000-4000-8000-000000000003", reference: "VG-POS-B", createdAt: "2026-11-19T10:00:00.000Z", amountMinor: 2000 },
  ],
  recentCashSalesTruncated: false, source: "server_cash_ledger" as const,
  scope: "cash_drawer_only" as const,
  electronicPaymentsReconciled: false as const,
  refundsReconciled: false as const,
  taxOrGeneralLedgerReconciled: false as const,
};
const closed = {
  ...report,
  status: "closed",
  closedAt: "2026-11-19T12:00:00.000Z",
  actualCountedCashMinor: 15100,
  closingExpectedCashMinor: 15000,
  closingDifferenceMinor: 100,
  recomputedDifferenceMinor: 100,
  closingMatchesLedger: true,
};

describe("Verified real-API POS till reconciliation, preview only", () => {
  test("only read-only, no-store real API operations are mapped", () => {
    expect(restEndpoints["pos.verified.reconciliation"]).toEqual({
      method: "GET", path: "/admin/pos/tills/{sessionId}/reconciliation",
    });
    expect(operationMeta["pos.verified.reconciliation"]).toEqual({});
    const code = readFileSync(resolve(root, "src/features/staff/verified-pos-till-reconciliation-client.ts"), "utf8");
    expect(code).toContain('const { api } = await import("@/services/client")');
    for (const forbidden of ["localStorage", "sessionStorage", "pos.cash-sales.complete",
      "pos.till.close", "pos.verified.hold", "paymentInitiate"])
      expect(code).not.toContain(forbidden);
  });

  test("strict till list rejects disabled, duplicate, malformed, oversized responses", () => {
    expect(parseVerifiedTillChoices({ enabled: true, includesSales: false, sessions: [] })).toEqual([]);
    const till = {
      id, locationId: "main", tillCode: "TILL-01", openedByUserId: "admin",
      status: "open", openingFloatMinor: 1000, openedAt: "2026-11-19T08:00:00.000Z",
      closedAt: null, closedByUserId: null, closingCountedMinor: null,
      closingExpectedMinor: null, closingDifferenceMinor: null,
      closeNote: null, expectedDrawerOnlyMinor: 1000, includesSales: false,
      movements: [],
    };
    expect(parseVerifiedTillChoices({ enabled: true, includesSales: false, sessions: [till] })).toEqual([till]);
    for (const invalid of [
      { enabled: false, includesSales: false, sessions: [till] },
      { enabled: true, includesSales: false, sessions: [till, till] },
      { enabled: true, includesSales: false, sessions: [{ ...till, id: "bad" }] },
      { enabled: true, includesSales: false, sessions: Array.from({ length: 101 }, (_, i) => ({ ...till, id: "id-" + i })) },
      { ok: true, data: { enabled: true, includesSales: false, sessions: [] } },
      null,
    ]) expect(() => parseVerifiedTillChoices(invalid)).toThrow();
  });

  test("open drawer balance must be consistent, and must not claim cash count", () => {
    expect(parseVerifiedTillReconciliation(report, id)).toEqual(report);
    for (const changed of [
      { expectedDrawerCashMinor: 14999 },
      { manualCashInMinor: 3000 },
      { closedAt: "2026-11-19T12:00:00.000Z" },
      { actualCountedCashMinor: 15000 },
      { closingMatchesLedger: true },
      { cashSalesCount: 3 },
      { recentCashSalesTruncated: true },
      { recentCashSales: [report.recentCashSales[0], report.recentCashSales[0]] },
      { electronicPaymentsReconciled: true },
      { refundsReconciled: true },
      { taxOrGeneralLedgerReconciled: true },
      { scope: "bank_settlement" },
    ]) expect(() => parseVerifiedTillReconciliation({ ...report, ...changed }, id)).toThrow();
    expect(() => parseVerifiedTillReconciliation(report, another)).toThrow();
  });

  test("closed drawer requires an arithmetically consistent counted difference", () => {
    expect(parseVerifiedTillReconciliation(closed, id)).toEqual(closed);
    const unmatched = {
      ...closed,
      closingExpectedCashMinor: 14800, closingDifferenceMinor: 100,
      closingMatchesLedger: false,
    };
    expect(parseVerifiedTillReconciliation(unmatched, id)).toEqual(unmatched);
    for (const changed of [
      { actualCountedCashMinor: null },
      { recomputedDifferenceMinor: 50 },
      { closingMatchesLedger: false },
      { closedAt: null },
      { closingExpectedCashMinor: null },
    ]) expect(() => parseVerifiedTillReconciliation({ ...closed, ...changed }, id)).toThrow();
  });

  test("server CSV link is same trusted API and validated till UUID only", () => {
    expect(verifiedTillCashCsvUrl(id, "https://portal.example.test/api/v1"))
      .toBe("https://portal.example.test/api/v1/admin/pos/tills/" + id + "/reconciliation.csv");
    for (const invalid of ["", "not-a-uuid", "../orders", id + "?x=1"])
      expect(() => verifiedTillCashCsvUrl(invalid, "https://portal.example.test/api/v1")).toThrow();
    for (const invalid of ["http://bad.example.test/api/v1", "https://bad.example.test/api/mock/v1"])
      expect(() => verifiedTillCashCsvUrl(id, invalid)).toThrow();
  });

  test("GET resolution uses path param, credentials and no cache without mutation", async () => {
    let calls = 0;
    globalThis.fetch = (async (url: string | Request | URL, init?: RequestInit) => {
      calls++;
      expect(String(url)).toBe("https://api.example.test/api/v1/admin/pos/tills/" + id + "/reconciliation");
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.credentials).toBe("include");
      expect(init?.cache).toBe("no-store");
      return new Response(JSON.stringify({ ok: true, data: report }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const adapter = new HttpServiceAdapter("https://api.example.test/api/v1", { credentials: "include" });
    expect(parseVerifiedTillReconciliation(await adapter.request({
      op: "pos.verified.reconciliation", query: { sessionId: id },
    }), id)).toEqual(report);
    expect(calls).toBe(1);
  });

  test("admin-only page includes clear reconciliation limits and no till mutations", () => {
    const route = readFileSync(resolve(root,
      "src/app/admin/pos/verified-uat/reconciliation/page.tsx"), "utf8");
    const page = readFileSync(resolve(root,
      "src/features/staff/verified-pos-till-reconciliation-uat.tsx"), "utf8");
    expect(route).toContain("<VerifiedPosTillReconciliationUat");
    expect(page).toContain('identity.actor.role !== "admin"');
    expect(page).toContain("loadVerifiedTillReconciliation");
    expect(page).toContain("refunds");
    expect(page).toContain("closingMatchesLedger");
    expect(page).toContain("Counted cash differs from expected cash. Investigate the drawer variance.");
    expect(page).toContain("Saved closing figures conflict with the server cash ledger.");
    for (const forbidden of ["cashierTillCloseSchema", "apiOps.tillClose",
      "onSubmit=", "posComplete(", "posStockHold(", "posRefund("])
      expect(page).not.toContain(forbidden);
  });
});
