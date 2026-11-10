import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createCashierReportClient } from "../src/features/staff/cashier-report-client";

const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });

test("real cashier client uses cookie-authenticated GETs without any demo endpoint or mutation", async () => {
  const calls: {url:string; init:RequestInit}[] = [];
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({url,init:init??{}});
    if (url.endsWith("/auth/me")) return Response.json({
      ok:true,data:{actor:{id:"cashier-one",name:"Accra Cashier",role:"cashier",locationIds:["loc_accra"]}},
    });
    if (url.endsWith("/admin/pos/tills")) return Response.json({
      ok:true,data:{enabled:false,includesSales:false,sessions:[]},
    });
    throw new Error("Unexpected operation: "+url);
  },{preconnect:()=>{}});
  const api=createCashierReportClient("https://example.invalid/api/v1");
  const actor=await api.session();
  expect(actor.role).toBe("cashier");
  expect(actor.locationIds).toEqual(["loc_accra"]);
  expect((await api.list()).sessions).toEqual([]);
  expect(calls.map(c=>c.url)).toEqual([
    "https://example.invalid/api/v1/auth/me",
    "https://example.invalid/api/v1/admin/pos/tills",
  ]);
  for (const {url,init} of calls) {
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
    expect(url.includes("/api/mock/")).toBe(false);
  }
});

test("cashier client rejects non-cashier and non-admin identities", async()=>{
  globalThis.fetch=Object.assign(async()=>Response.json({
    ok:true,data:{actor:{id:"stock",name:"Stock Officer",role:"inventory_manager",locationIds:["loc_accra"]}},
  }),{preconnect:()=>{}});
  await expect(createCashierReportClient("https://example.invalid/api/v1").session())
    .rejects.toThrow("This account does not have cashier report access.");
});

test("cashier transport fails closed without an API and CSV path is server-owned",()=>{
  expect(()=>createCashierReportClient(" ")).toThrow("The authenticated cashier API is not configured.");
  const client=createCashierReportClient("https://example.invalid/api/v1/");
  expect(client.cashCsvHref("session other")).toBe(
    "https://example.invalid/api/v1/admin/pos/tills/session%20other/reconciliation.csv",
  );
});

test("cashier route is separated from admin layout and the demo role menu",()=>{
  const page=readFileSync("src/app/staff/cashier/page.tsx","utf8");
  const cashier=readFileSync("src/features/staff/cashier-workspace.tsx","utf8");
  const login=readFileSync("src/features/staff/staff-login-form.tsx","utf8");
  expect(page).toContain("CashierWorkspace");
  expect(cashier).not.toContain("resolveClientAdapter");
  expect(cashier).not.toContain("/api/mock/");
  expect(cashier).toContain("This workspace cannot create sales");
  expect(login).toContain('candidate === "/staff/cashier"');
  expect(login).toContain("clearDemoStaffSession()");
  expect(login).toContain('session.actor.role === "cashier"');
});

test("cashier sign-out sends the session CSRF token but no POS mutation", async () => {
  const calls: {url:string;init:RequestInit}[]=[];
  const token="a".repeat(64);
  globalThis.fetch=Object.assign(async (input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);calls.push({url,init:init??{}});
    if (url.endsWith("/auth/me"))return Response.json({
      ok:true,data:{actor:{id:"cashier-one",name:"Cashier",role:"cashier",
        locationIds:["loc_accra"]},csrfToken:token},
    });
    if (url.endsWith("/auth/logout"))return Response.json({ok:true,data:{done:true}});
    throw new Error("Unexpected request: "+url);
  },{preconnect:()=>{}});
  await createCashierReportClient("https://example.invalid/api/v1").signOut();
  expect(calls.map(x=>x.url)).toEqual([
    "https://example.invalid/api/v1/auth/me",
    "https://example.invalid/api/v1/auth/logout",
  ]);
  expect(calls[0]?.init.method).toBe("GET");
  expect(calls[1]?.init.method).toBe("POST");
  expect((calls[1]?.init.headers as Record<string,string>)["X-CSRF-Token"]).toBe(token);
  expect(calls[1]?.init.credentials).toBe("include");
  expect(calls.every(x=>!x.url.includes("/pos/"))).toBe(true);
});

test("cashier sign-out fails closed without a CSRF-bearing web session", async () => {
  globalThis.fetch=Object.assign(async()=>Response.json({ok:true,data:{
    actor:{id:"cashier-one",name:"Cashier",role:"cashier",locationIds:["loc_accra"]},
  }}),{preconnect:()=>{}});
  await expect(createCashierReportClient("https://example.invalid/api/v1").signOut())
    .rejects.toThrow("A verified web session is required to sign out.");
});
