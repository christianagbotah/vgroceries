import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HttpServiceAdapter } from "../src/services/adapters/http";
import { restEndpoints } from "../src/services/contracts/endpoints";
import { operationMeta } from "../src/services/operation-registry";
import {
  assertVerifiedPosCashHistoryUat,
  parseVerifiedPosCashHistory,
  parseVerifiedPosCashHistoryPage,
  verifiedPosReceiptPrintUrl,
} from "../src/features/staff/verified-pos-cash-history-client";

const root = resolve(import.meta.dir, "..");
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const uuid = (last: string) => "00000000-0000-4000-8000-0000000000" + last;
const sample = {
  id: uuid("01"), reference: "VG-POS-TEST1",
  holdId: uuid("02"), tillSessionId: uuid("03"), locationId: "main",
  soldByUserId: "administrator", stockDepletionId: uuid("04"),
  customerMode: "walk_in" as const, customerUserId: null, customerName: "Walk-in Customer",
  subtotalMinor: 1250, cashReceivedMinor: 1500, changeGivenMinor: 250,
  paymentMethod: "cash" as const, cashCountConfirmed: true as const,
  goodsHandedOver: true as const, handoverNote: "Counted cash and handed items over at the shop.",
  createdAt: "2026-11-19T12:00:00.000Z",
  taxInvoiceIssued: false as const, electronicPaymentVerified: false as const,
  lines: [{ variantId: "milk-1l", quantity: "1", unitPriceMinor: 1250, lineTotalMinor: 1250 }],
};

describe("Real-API POS cash-sale history, administrator-only and read-only", () => {
  test("maps only authenticated GET; no shared or cross-account caching", () => {
    expect(restEndpoints["pos.verified.cash-sales"]).toEqual({
      method: "GET", path: "/admin/pos/cash-sales",
    });
    expect(operationMeta["pos.verified.cash-sales"]).toEqual({});
    const client = readFileSync(resolve(root, "src/features/staff/verified-pos-cash-history-client.ts"), "utf8");
    expect(client).toContain('const { api } = await import("@/services/client")');
    for (const denied of [
      "posCashSaleCompleteSchema", "apiOps.posComplete", "localStorage", "sessionStorage",
      "stock.consume", "pos.verified.hold", "payments.initiate",
    ]) expect(client).not.toContain(denied);
  });

  test("feature, real staff account, and trusted HTTPS API are required", () => {
    const good = { enabled: true, demo: false, apiBase: "https://portal.example.test/api/v1" };
    expect(() => assertVerifiedPosCashHistoryUat(good)).not.toThrow();
    for (const changed of [
      { enabled: false }, { demo: true }, { apiBase: undefined },
      { apiBase: "/api/mock/v1" }, { apiBase: "http://portal.example.test/api/v1" },
      { apiBase: "https://portal.example.test/api/mock/v1" },
      { apiBase: "https://user:pass@portal.example.test/api/v1" },
      { apiBase: "javascript:alert(1)" },
    ]) expect(() => assertVerifiedPosCashHistoryUat({ ...good, ...changed })).toThrow();
    expect(() => assertVerifiedPosCashHistoryUat({
      ...good, apiBase: "http://127.0.0.1:3049/api/v1",
    })).not.toThrow();
  });

  test("rejects invented payment claims, incomplete or inconsistent sale data", () => {
    expect(parseVerifiedPosCashHistory({ enabled: true, sales: [sample] })).toEqual([sample]);
    for (const altered of [
      { subtotalMinor: 1200 }, { cashReceivedMinor: 1400 },
      { changeGivenMinor: 0 }, { electronicPaymentVerified: true },
      { taxInvoiceIssued: true }, { paymentMethod: "mobile_money" },
      { lines: [] }, { lines: [{ ...sample.lines[0], lineTotalMinor: 1249 }] },
      { extra: "untrusted" },
    ]) expect(() => parseVerifiedPosCashHistory({
      enabled: true, sales: [{ ...sample, ...altered }],
    })).toThrow();
    for (const envelope of [
      { enabled: false, sales: [sample] },
      { ok: true, data: { enabled: true, sales: [sample] } },
      { enabled: true, sales: [sample, sample] },
      { enabled: true, sales: Array.from({ length: 51 }, () => sample) },
      null,
    ]) expect(() => parseVerifiedPosCashHistory(envelope)).toThrow();
  });

  test("rejects spoofed, unsorted, duplicate or non-advancing keyset pages", () => {
    const newer = { ...sample, id: uuid("05"), reference: "VG-POS-NEW" };
    const page = {
      enabled: true as const, sales: [newer, sample],
      hasMore: true, nextCursor: "eyJwIjoiMTIzIn0",
    };
    expect(parseVerifiedPosCashHistoryPage(page)).toEqual(page);
    for (const bad of [
      { hasMore: true, nextCursor: null },
      { hasMore: false, nextCursor: "abc" },
      { nextCursor: "" },
      { nextCursor: "../" },
      { sales: [sample, newer] },
      { sales: [sample, sample] },
      { sales: [{ ...sample, electronicPaymentVerified: true }] },
      { sales: Array.from({ length: 51 }, () => sample) },
      { extra: "untrusted" },
    ]) expect(() => parseVerifiedPosCashHistoryPage({ ...page, ...bad })).toThrow();
    expect(() => parseVerifiedPosCashHistoryPage(page, page.nextCursor)).toThrow();
    expect(parseVerifiedPosCashHistoryPage({
      enabled: true, sales: [], hasMore: false, nextCursor: null,
    }).sales).toEqual([]);
  });

  test("new page API resolves to authenticated GET with fixed page limit and no cache", async () => {
    expect(restEndpoints["pos.verified.cash-sales-page"]).toEqual({
      method: "GET", path: "/admin/pos/cash-sales/history",
    });
    expect(operationMeta["pos.verified.cash-sales-page"]).toEqual({});
    let calls = 0;
    globalThis.fetch = (async (url: string | Request | URL, init?: RequestInit) => {
      calls++;
      expect(String(url)).toBe(
        "https://portal.example.test/api/v1/admin/pos/cash-sales/history?limit=25&cursor=abc123",
      );
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.credentials).toBe("include");
      expect(init?.cache).toBe("no-store");
      return new Response(JSON.stringify({
        ok: true, data: {
          enabled: true, sales: [sample], hasMore: false, nextCursor: null,
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const adapter = new HttpServiceAdapter(
      "https://portal.example.test/api/v1", { credentials: "include" },
    );
    const response = await adapter.request({
      op: "pos.verified.cash-sales-page",
      query: { limit: 25, cursor: "abc123" },
    });
    expect(parseVerifiedPosCashHistoryPage(response, "abc123").sales).toEqual([sample]);
    expect(calls).toBe(1);
  });

  test("prints only known UUID on validated real API, no customer data in URL", () => {
    const url = verifiedPosReceiptPrintUrl(sample.id, "https://portal.example.test/api/v1");
    expect(url).toBe("https://portal.example.test/api/v1/admin/pos/cash-sales/" + sample.id + "/print");
    for (const id of ["", "not-uuid", "../payments/refund", sample.id + "?foo=bar"])
      expect(() => verifiedPosReceiptPrintUrl(id, "https://portal.example.test/api/v1")).toThrow();
    expect(() => verifiedPosReceiptPrintUrl(sample.id, "https://bad.example.test/api/mock/v1")).toThrow();
    expect(() => verifiedPosReceiptPrintUrl(sample.id, "http://bad.example.test/api/v1")).toThrow();
  });

  test("HTTP fetch of cash history is no-store, credentialed and read-only", async () => {
    let requests = 0;
    globalThis.fetch = (async (url: string | Request | URL, init?: RequestInit) => {
      requests++;
      expect(String(url)).toBe("https://portal.example.test/api/v1/admin/pos/cash-sales");
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.credentials).toBe("include");
      expect(init?.cache).toBe("no-store");
      expect(init?.headers).not.toHaveProperty("Idempotency-Key");
      return new Response(JSON.stringify({ ok: true, data: { enabled: true, sales: [sample] } }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const adapter = new HttpServiceAdapter("https://portal.example.test/api/v1", { credentials: "include" });
    expect(parseVerifiedPosCashHistory(await adapter.request({ op: "pos.verified.cash-sales" }))).toEqual([sample]);
    expect(requests).toBe(1);
  });

  test("page contains role proof, no mutation controls and privacy-aware receipt view", () => {
    const route = readFileSync(resolve(root, "src/app/admin/pos/verified-uat/history/page.tsx"), "utf8");
    const page = readFileSync(resolve(root, "src/features/staff/verified-pos-cash-history-uat.tsx"), "utf8");
    expect(route).toContain("<VerifiedPosCashHistoryUat");
    expect(page).toContain('identity.actor.role !== "admin"');
    expect(page).toContain("verifiedPosCashHistoryUatEnabled");
    expect(page).toContain("loadVerifiedPosCashHistory");
    expect(page).toContain("Not a tax invoice");
    expect(page).toContain('target="_blank" rel="noopener noreferrer"');
    for (const denied of [
      "posComplete", "posHold", "posCashSaleComplete", "paymentInitiate",
      "cashReceivedMinor:", "onSubmit=", "stockConsume", "setLocalStorage",
    ]) expect(page).not.toContain(denied);
  });
});
