/// <reference types="bun-types" />
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { NextRequest } from "next/server";
import { proxy, config } from "../src/proxy";
import { stagingRequiredRole, stagingSessionHasRole } from "../src/lib/staging-page-access";

const originalFetch = globalThis.fetch;
const initialGate = process.env.UAT_PORTAL_LOGIN_REQUIRED;
const initialBase = process.env.API_BASE_URL;
const token = "a".repeat(64);

beforeEach(() => {
  process.env.UAT_PORTAL_LOGIN_REQUIRED = "1";
  process.env.API_BASE_URL = "http://127.0.0.1:3027/api/v1";
  globalThis.fetch = originalFetch;
});
afterEach(() => {
  if (initialGate === undefined) delete process.env.UAT_PORTAL_LOGIN_REQUIRED;
  else process.env.UAT_PORTAL_LOGIN_REQUIRED = initialGate;
  if (initialBase === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = initialBase;
  globalThis.fetch = originalFetch;
});

function request(path: string, cookie?: string, method = "GET") {
  return new NextRequest("https://portal.varietygroceries.com" + path, {
    method,
    ...(cookie ? { headers: { cookie: "vg_session=" + cookie } } : {}),
  });
}
function authenticated(role: string, id = "user-1") {
  globalThis.fetch = (async () => Response.json({
    ok: true, data: { actor: { role, id, name: "Test Staff", locationIds: ["loc_accra"] } },
  })) as unknown as typeof fetch;
}

describe("staging operational HTML routing", () => {
  test("cashier and verified administration pages have exact scoped role protection", () => {
    expect(stagingRequiredRole("/staff/cashier")).toBe("cashier");
    expect(stagingRequiredRole("/staff/cashier/workspace")).toBe("cashier");
    expect(stagingRequiredRole("/staff/cashier/other")).toBe("cashier");
    expect(stagingRequiredRole("/staff/pos")).toBe("cashier");
    expect(stagingRequiredRole("/admin/team/verified")).toBe("admin");
    expect(stagingRequiredRole("/admin/team/verified/new")).toBe("admin");
    for (const publicPath of [
      "/", "/shop", "/cart", "/checkout", "/account", "/admin/team",
      "/staff/login", "/staff/activate", "/staff/cashier-impostor",
      "/staff/position", "/api/v1/cashier/pos/workspace", "/_next/static/a.js",
    ]) expect(stagingRequiredRole(publicPath)).toBeNull();
    expect(config.matcher).toContain("/staff/cashier/:path*");
    expect(config.matcher).toContain("/admin/team/verified/:path*");
  });

  test("requires strict verified role and a non-empty actor id", () => {
    expect(stagingSessionHasRole({ ok: true, data: { actor: { role: "cashier", id: "u" } } }, "cashier")).toBe(true);
    expect(stagingSessionHasRole({ ok: true, data: { actor: { role: "customer", id: "u" } } }, "cashier")).toBe(false);
    expect(stagingSessionHasRole({ ok: true, data: { actor: { role: "admin", id: "" } } }, "admin")).toBe(false);
    expect(stagingSessionHasRole({ ok: false, data: { actor: { role: "admin", id: "u" } } }, "admin")).toBe(false);
    expect(stagingSessionHasRole(null, "admin")).toBe(false);
  });

  test("feature OFF leaves unrelated routes and current staff login available", async () => {
    process.env.UAT_PORTAL_LOGIN_REQUIRED = "0";
    globalThis.fetch = (async () => { throw Error("Should not probe identity when gate disabled."); }) as typeof fetch;
    expect((await proxy(request("/staff/cashier/workspace"))).status).toBe(200);
    process.env.UAT_PORTAL_LOGIN_REQUIRED = "1";
    expect((await proxy(request("/staff/activate"))).status).toBe(200);
    expect((await proxy(request("/shop"))).status).toBe(200);
  });

  test("anonymous staff visits fail closed and redirect only to internal login", async () => {
    const response = await proxy(request("/staff/cashier/workspace"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://portal.varietygroceries.com/staff/login?next=%2Fstaff%2Fcashier%2Fworkspace");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const post = await proxy(request("/staff/cashier/workspace", undefined, "POST"));
    expect(post.status).toBe(401);
    expect((await post.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("invalid cookie, wrong role and broken identity service cannot unlock cashier shell", async () => {
    authenticated("cashier");
    expect((await proxy(request("/staff/cashier/workspace", "bad"))).status).toBe(307);
    authenticated("customer");
    expect((await proxy(request("/staff/cashier/workspace", token))).status).toBe(307);
    authenticated("admin");
    expect((await proxy(request("/staff/cashier/workspace", token))).status).toBe(307);
    globalThis.fetch = (async () => { throw Error("backend unavailable"); }) as typeof fetch;
    expect((await proxy(request("/staff/cashier/workspace", token))).status).toBe(307);
    delete process.env.API_BASE_URL;
    expect((await proxy(request("/staff/cashier/workspace", token))).status).toBe(307);
    process.env.API_BASE_URL = "https://untrusted.example.test/api/v1";
    expect((await proxy(request("/staff/cashier/workspace", token))).status).toBe(307);
  });

  test("correct cashier can view only cashier shell, correct administrator can view only verified staff page", async () => {
    authenticated("cashier");
    const cashier = await proxy(request("/staff/cashier/workspace", token));
    expect(cashier.status).toBe(200);
    expect(cashier.headers.get("cache-control")).toContain("no-store");
    expect((await proxy(request("/admin/team/verified", token))).status).toBe(307);
    authenticated("admin");
    expect((await proxy(request("/admin/team/verified", token))).status).toBe(200);
    expect((await proxy(request("/staff/cashier/workspace", token))).status).toBe(307);
  });
});
