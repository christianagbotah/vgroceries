import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HttpServiceAdapter } from "../src/services/adapters/http";
import { restEndpoints } from "../src/services/contracts/endpoints";
import { operationMeta } from "../src/services/operation-registry";
import {
  assertRealPosCustomerLookup,
  parsePosCustomerMatches,
} from "../src/features/staff/verified-pos-customer-lookup";

const root = resolve(import.meta.dir, "..");
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("gated cashier customer picker frontend parity", () => {
  test("uses the real authenticated GET only; search data never enters a demo/mock endpoint", async () => {
    const endpoint = restEndpoints["cashier.pos.customers"];
    expect(endpoint).toEqual({ method: "GET", path: "/admin/pos/customers" });
    expect(operationMeta["cashier.pos.customers"]).toEqual({}); // no private account caching

    let requests = 0;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests++;
      expect(String(url)).toBe("https://api.example.test/api/v1/admin/pos/customers?q=Ama");
      expect(init?.method).toBe("GET");
      expect(init?.cache).toBe("no-store");
      expect(init?.credentials).toBe("include");
      expect(init?.body).toBeUndefined();
      return new Response(JSON.stringify({
        ok: true, data: [{ id: "customer-1", name: "Ama Mensah", phoneLast4: "4567" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const api = new HttpServiceAdapter("https://api.example.test/api/v1", {
      kind: "test:real-pos", credentials: "include",
    });
    const result = await api.request({ op: "cashier.pos.customers", query: { q: "Ama" } });
    expect(parsePosCustomerMatches(result)).toEqual([
      { id: "customer-1", name: "Ama Mensah", phoneLast4: "4567" },
    ]);
    expect(requests).toBe(1);
  });

  test("feature flag, session and HTTPS REST origin are fail-closed", () => {
    const good = { enabled: true, demo: false, apiBase: "https://api.example.test/api/v1" };
    expect(() => assertRealPosCustomerLookup(good)).not.toThrow();
    for (const changes of [
      { enabled: false },
      { demo: true },
      { apiBase: undefined },
      { apiBase: "/api/mock/v1" },
      { apiBase: "https://api.example.test/api/mock/v1" },
      { apiBase: "http://api.example.test/api/v1" },
      { apiBase: "https://api.example.test/api/v1?token=exposed" },
      { apiBase: "https://user:password@api.example.test/api/v1" },
      { apiBase: "javascript:alert(1)" },
    ]) {
      expect(() => assertRealPosCustomerLookup({ ...good, ...changes })).toThrow();
    }
    expect(() => assertRealPosCustomerLookup({
      ...good, apiBase: "http://localhost:3027/api/v1",
    })).not.toThrow();
  });

  test("rejects full phone, emails, extra keys and overlimit result, never truncates silently", () => {
    const valid = [{ id: "one", name: "Customer", phoneLast4: "4321" }];
    expect(parsePosCustomerMatches(valid)).toEqual(valid);
    for (const malformed of [
      [{ ...valid[0], phone: "0241234567" }],
      [{ ...valid[0], email: "user@example.test" }],
      [{ ...valid[0], passwordHash: "secret" }],
      [{ ...valid[0], phoneLast4: "+233241234567" }],
      Array.from({ length: 16 }, (_, i) => ({ id: String(i), name: "X", phoneLast4: "1234" })),
      { ok: true, data: valid },
      null,
    ]) {
      expect(() => parsePosCustomerMatches(malformed)).toThrow();
    }
  });

  test("cashier workspace embeds preview only behind build flag, no real sale functionality", () => {
    const workspace = readFileSync(
      resolve(root, "src/app/staff/cashier/workspace/page.tsx"), "utf8",
    );
    const picker = readFileSync(
      resolve(root, "src/features/staff/verified-pos-customer-picker.tsx"), "utf8",
    );
    const apiSource = readFileSync(
      resolve(root, "src/features/staff/verified-pos-customer-lookup.ts"), "utf8",
    );
    expect(workspace).toContain("posCustomerLookupUatEnabled ? <VerifiedPosCustomerPicker");
    expect(workspace).toContain('session.actor.role !== "cashier"');
    expect(picker).toContain('selection.mode === "walk_in"');
    expect(picker).toContain('selection.mode === "named"');
    expect(picker).toContain('selection.mode === "existing"');
    expect(picker).toContain("person.phoneLast4");
    expect(picker).not.toContain("person.phone}");
    expect(picker).not.toContain("person.email");
    expect(picker).not.toContain("posComplete");
    expect(picker).not.toContain("cashReceivedMinor");
    expect(apiSource).toContain("isDemoStaffSessionActive()");
    expect(apiSource).toContain("posCustomerSearchResultSchema.safeParse");
    expect(apiSource).not.toContain("apiOps.customers()");
  });
});
