import { describe, expect, test, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HttpServiceAdapter } from "../src/services/adapters/http";
import { restEndpoints } from "../src/services/contracts/endpoints";
import { validateRequest } from "../src/services/contracts/validation";
import {
  assertVerifiedPosQuoteUat,
  validatePosQuoteLines,
} from "../src/features/staff/verified-pos-quote-client";
import { operationMeta } from "../src/services/operation-registry";

const root = resolve(import.meta.dir, "..");
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const body = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  lines: [
    { variantId: "rice-1kg", quantity: "2" },
    { variantId: "salt-100g", quantity: "1.5" },
  ],
};

describe("POS quote-only canonical admin frontend", () => {
  test("maps only approved till GET and read-only quote POST to production", () => {
    expect(restEndpoints["pos.verified.tills"]).toEqual({
      method: "GET", path: "/admin/pos/tills",
    });
    expect(restEndpoints["pos.verified.quote"]).toEqual({
      method: "POST", path: "/admin/pos/quote",
    });
    expect(operationMeta["pos.verified.tills"]).toEqual({});
    expect(operationMeta["pos.verified.quote"]).toEqual({});
    const code = readFileSync(resolve(root, "src/features/staff/verified-pos-quote-client.ts"), "utf8");
    for (const forbidden of ["pos.verified.hold", "pos.verified.sale", "payments.initiate", "cash-sales", "stock-depletion"])
      expect(code).not.toContain(forbidden);
  });

  test("accepts trusted HTTPS and localhost only, with explicit flag and real account", () => {
    const good = { enabled: true, demo: false, apiBase: "https://portal.example.test/api/v1" };
    expect(() => assertVerifiedPosQuoteUat(good)).not.toThrow();
    for (const change of [
      { enabled: false },
      { demo: true },
      { apiBase: undefined },
      { apiBase: "/api/mock/v1" },
      { apiBase: "https://portal.example.test/api/mock/v1" },
      { apiBase: "http://portal.example.test/api/v1" },
      { apiBase: "https://user:pass@portal.example.test/api/v1" },
      { apiBase: "https://portal.example.test/api/v1?token=abc" },
      { apiBase: "file:///api/v1" },
    ]) expect(() => assertVerifiedPosQuoteUat({ ...good, ...change })).toThrow();
    expect(() => assertVerifiedPosQuoteUat({ ...good, apiBase: "http://127.0.0.1:3027/api/v1" })).not.toThrow();
  });

  test("rejects duplicates, missing till, nonpositive quantity and invalid precision", () => {
    expect(validatePosQuoteLines(body)).toEqual(body);
    expect(validateRequest("pos.verified.quote", body).ok).toBe(true);
    for (const input of [
      { ...body, sessionId: "not-a-uuid" },
      { ...body, lines: [] },
      { ...body, lines: [{ variantId: "rice-1kg", quantity: "0" }] },
      { ...body, lines: [{ variantId: "rice-1kg", quantity: "-1" }] },
      { ...body, lines: [{ variantId: "rice-1kg", quantity: "1.1234" }] },
      { ...body, lines: [{ variantId: "rice-1kg", quantity: "1" }, { variantId: "rice-1kg", quantity: "2" }] },
      { ...body, lines: Array.from({ length: 101 }, (_, i) => ({
        variantId: "variant-" + i, quantity: "1",
      })) },
      { ...body, extraField: "unexpected" },
    ]) {
      expect(() => validatePosQuoteLines(input)).toThrow();
      expect(validateRequest("pos.verified.quote", input).ok).toBe(false);
    }
  });

  test("transport invokes authoritative pricing operation without idempotency or reservation", async () => {
    let count = 0;
    globalThis.fetch = (async (url: string | Request | URL, init?: RequestInit) => {
      count++;
      expect(String(url)).toBe("https://portal.example.test/api/v1/admin/pos/quote");
      expect(init?.method).toBe("POST");
      expect(init?.cache).toBe("no-store");
      expect(init?.credentials).toBe("include");
      expect(init?.headers).not.toHaveProperty("Idempotency-Key");
      expect(JSON.parse(String(init?.body))).toEqual(body);
      return new Response(JSON.stringify({ ok: true, data: { quoteOnly: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const adapter = new HttpServiceAdapter("https://portal.example.test/api/v1", {
      credentials: "include",
    });
    expect(await adapter.request({ op: "pos.verified.quote", body })).toEqual({ quoteOnly: true });
    expect(count).toBe(1);
  });

  test("quote page has no sale, reservation, payment or drawer mutation controls", () => {
    const route = readFileSync(resolve(root, "src/app/admin/pos/verified-uat/page.tsx"), "utf8");
    const page = readFileSync(resolve(root, "src/features/staff/verified-pos-quote-uat.tsx"), "utf8");
    expect(route).toContain("<VerifiedPosQuoteUat");
    expect(page).toContain('session.actor.role !== "admin"');
    expect(page).toContain("verifiedPosQuoteUatEnabled");
    expect(page).toContain("previewVerifiedPosQuote");
    expect(page).toContain("VerifiedPosCustomerPicker");
    expect(page).toContain("Estimated change:");
    for(const forbidden of [
      "apiOps.posComplete", "verifiedPosUat.sale", "verifiedPosUat.hold",
      "posCashSaleCompleteSchema", "paymentInitiate", "stockConsume",
      "cashReceivedMinor:", "window.confirm(",
    ]) expect(page).not.toContain(forbidden);
  });
});
