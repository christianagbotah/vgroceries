import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { acceptCashierInvitation, verifiedStaff } from "../src/features/staff/verified-staff-transport";

const previousFetch = globalThis.fetch;
const previousBase = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  globalThis.fetch = previousFetch;
  if (previousBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = previousBase;
});

test("invitation issuance uses authenticated CSRF; activation uses no administrator secret", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://pos-uat.example.test/api/v1";
  const calls: Array<{url:string; init:RequestInit}> = [];
  globalThis.fetch = Object.assign(async (input: RequestInfo|URL, init?: RequestInit) => {
    calls.push({ url:String(input), init:init??{} });
    return Response.json({ok:true,data:{activated:true}});
  }, {preconnect:()=>{}});
  await verifiedStaff.inviteCashier("csrf",{
    name:"Cashier Example", email:"cashier@example.test",phone:"",
    locationIds:["loc_accra"],
  });
  const secret = "a".repeat(64);
  await acceptCashierInvitation(secret,"Secure Test Password");
  expect(calls.map(x=>x.url)).toEqual([
    "https://pos-uat.example.test/api/v1/admin/staff/invitations",
    "https://pos-uat.example.test/api/v1/auth/staff-invitations/accept",
  ]);
  expect(calls[0].init.credentials).toBe("include");
  expect((calls[0].init.headers as Record<string,string>)["X-CSRF-Token"]).toBe("csrf");
  expect(JSON.parse(String(calls[0].init.body))).toEqual({
    name:"Cashier Example",email:"cashier@example.test",phone:"",locationIds:["loc_accra"],
  });
  expect(calls[1].init.credentials).toBe("include");
  expect((calls[1].init.headers as Record<string,string>)["X-CSRF-Token"]).toBeUndefined();
  expect(JSON.parse(String(calls[1].init.body))).toEqual({
    code:secret,password:"Secure Test Password",
  });
  expect(calls[1].url).not.toContain(secret);
});

test("invitation activation refuses insecure remote API", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://offhost.example.test/api/v1";
  await expect(acceptCashierInvitation("a".repeat(64),"Secure Test Password"))
    .rejects.toThrow("requires HTTPS");
});

test("invited cashiers set their own password; no administrator-chosen password UI", () => {
  const team = readFileSync("src/features/staff/verified-staff-management.tsx","utf8");
  const activate = readFileSync("src/features/staff/cashier-activation.tsx","utf8");
  const page = readFileSync("src/app/staff/activate/page.tsx","utf8");
  expect(team).toContain("Issue cashier invitation");
  expect(team).toContain("Copy invitation code");
  expect(team).not.toContain("Initial password (12");
  expect(team).not.toContain("verifiedStaff.createCashier(csrf");
  expect(activate).toContain("Set password and activate");
  expect(activate).toContain("password !== confirmation");
  expect(activate).not.toContain("/api/mock/");
  expect(page).toContain("referrer: \"no-referrer\"");
  expect(page).toContain("CashierActivation");
});
