import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { verifiedStaff } from "../src/features/staff/verified-staff-transport";

const oldFetch = globalThis.fetch;
const oldBase = process.env.NEXT_PUBLIC_API_BASE_URL;

afterEach(() => {
  globalThis.fetch = oldFetch;
  if (oldBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = oldBase;
});

test("real staff management requires protected HTTPS, CSRF and exact API bodies", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://pos-uat.example.test/api/v1";
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Response.json({ ok: true, data: { id: "cashier-01" } });
  }, { preconnect: () => {} });
  await verifiedStaff.list();
  await verifiedStaff.createCashier("csrf-token", {
    name: "Synthetic Cashier", email: "synthetic@example.test", phone: "",
    password: "A synthetic password!", locationIds: ["loc_accra"],
  });
  await verifiedStaff.manageCashier("csrf-token", "cashier-01", {
    action: "assign_locations", locationIds: ["loc_accra", "loc_kumasi"],
  });
  await verifiedStaff.manageCashier("csrf-token", "cashier-01", {
    action: "set_active", active: false,
  });
  await verifiedStaff.manageCashier("csrf-token", "cashier-01", {
    action: "reset_password", password: "Another synthetic password!",
  });

  expect(calls.map(c => c.url)).toEqual([
    "https://pos-uat.example.test/api/v1/admin/staff",
    "https://pos-uat.example.test/api/v1/admin/staff",
    "https://pos-uat.example.test/api/v1/admin/staff/cashier-01/actions",
    "https://pos-uat.example.test/api/v1/admin/staff/cashier-01/actions",
    "https://pos-uat.example.test/api/v1/admin/staff/cashier-01/actions",
  ]);
  expect(calls[0].init.method).toBe("GET");
  for (const c of calls.slice(1)) {
    const headers = c.init.headers as Record<string, string>;
    expect(c.init.method).toBe("POST");
    expect(c.init.credentials).toBe("include");
    expect(headers["X-CSRF-Token"]).toBe("csrf-token");
    expect(c.url.includes("/api/mock/")).toBe(false);
  }
  expect(JSON.parse(String(calls[2].init.body))).toEqual({
    action: "assign_locations", locationIds: ["loc_accra", "loc_kumasi"],
  });
  expect(JSON.parse(String(calls[3].init.body))).toEqual({
    action: "set_active", active: false,
  });
  expect(JSON.parse(String(calls[4].init.body))).toEqual({
    action: "reset_password", password: "Another synthetic password!",
  });
});

test("a missing CSRF or insecure remote API cannot manage staff", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://pos-uat.example.test/api/v1";
  await expect(verifiedStaff.manageCashier("", "x", {
    action: "set_active", active: false,
  })).rejects.toThrow("verified web session");
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://staging.example.test/api/v1";
  await expect(verifiedStaff.list()).rejects.toThrow("requires HTTPS");
});

test("team route renders real, server-scoped account management instead of fictional identities", () => {
  const page = readFileSync("src/app/admin/team/page.tsx", "utf8");
  const ui = readFileSync("src/features/staff/verified-staff-management.tsx", "utf8");
  expect(page).toContain("VerifiedStaffManagement");
  expect(page).not.toContain("apiOps.team");
  expect(ui).toContain('NEXT_PUBLIC_POS_COUNTER_UAT === "1"');
  expect(ui).toContain('session.actor.role !== "admin"');
  expect(ui).toContain("window.confirm");
  expect(ui).toContain("Invitation issued. Copy and share");
  expect(ui).toContain('data-testid="staff-invitation-code"');
  expect(ui).not.toContain("Initial password (12");
  expect(ui).not.toContain("UAT_DEMO_ACCOUNTS");
  expect(ui).not.toContain("/api/mock/");
});
