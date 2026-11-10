import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { verifiedPosUat } from "../src/features/staff/verified-pos-uat-transport";

const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

test("verified UAT checkout sends only exact REST bodies with CSRF and idempotency in headers", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://pos-uat.example.test/api/v1";
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Response.json({ok:true,data:{accepted:true}});
  }, { preconnect: () => {} });

  const csrf = "test-csrf";
  const lines = [{variantId:"sample-rice",quantity:"2"}];
  await verifiedPosUat.quote(csrf,"till-id",lines);
  await verifiedPosUat.hold(csrf,"till-id",lines);
  await verifiedPosUat.sale(csrf,"hold-id",4000,"Simulated cash and test grocery handover");
  await verifiedPosUat.release(csrf,"hold-id");

  expect(calls.map(c => c.url)).toEqual([
    "https://pos-uat.example.test/api/v1/admin/pos/quote",
    "https://pos-uat.example.test/api/v1/admin/pos/holds",
    "https://pos-uat.example.test/api/v1/admin/pos/cash-sales",
    "https://pos-uat.example.test/api/v1/admin/pos/holds/hold-id/release",
  ]);
  const bodies = calls.map(c=>JSON.parse(String(c.init.body)) as Record<string, unknown>);
  expect(bodies[0]).toEqual({sessionId:"till-id",lines});
  expect(bodies[1]).toEqual({tillSessionId:"till-id",lines});
  expect(bodies[2]).toEqual({
    holdId:"hold-id",cashReceivedMinor:4000,cashCountConfirmed:true,
    goodsHandedOver:true,handoverNote:"Simulated cash and test grocery handover",
  });
  expect(bodies[3]).toEqual({note:"UAT sample basket released without any simulated cash sale"});
  for(const [i,call] of calls.entries()){
    expect(call.init.method).toBe("POST");
    expect(call.init.credentials).toBe("include");
    expect((call.init.headers as Record<string,string>)["X-CSRF-Token"]).toBe(csrf);
    expect(JSON.stringify(bodies[i])).not.toContain("idempotencyKey");
    expect(call.url).not.toContain("/api/mock/");
  }
  const headers = calls.map(c => (c.init.headers as Record<string,string>)["Idempotency-Key"]);
  expect(headers[0]).toBeUndefined();
  expect(headers.slice(1).every(x=>typeof x==="string" && x.length>20)).toBe(true);
  expect(new Set(headers.slice(1)).size).toBe(3);
});

test("admin till commands use strict POST bodies, CSRF and independent replay headers", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://pos-uat.example.test/api/v1";
  const calls: Array<{url:string;init:RequestInit}> = [];
  globalThis.fetch=Object.assign(async(input:RequestInfo|URL,init?:RequestInit)=>{
    calls.push({url:String(input),init:init??{}});
    return Response.json({ok:true,data:{id:"session-1"}});
  },{preconnect:()=>{}});
  const csrf="test-csrf";
  await verifiedPosUat.openTill(csrf,{
    locationId:"loc_accra",tillCode:"UATACCRA02",openingFloatMinor:1000,
  });
  await verifiedPosUat.moveCash(csrf,"session-1",{
    kind:"cash_in",amountMinor:250,note:"Sample safe float topup",
  });
  await verifiedPosUat.closeTill(csrf,"session-1",{
    countedCashMinor:1250,note:"Counted all test drawer cash",
  });
  expect(calls.map(x=>x.url)).toEqual([
    "https://pos-uat.example.test/api/v1/admin/pos/tills",
    "https://pos-uat.example.test/api/v1/admin/pos/tills/session-1/movements",
    "https://pos-uat.example.test/api/v1/admin/pos/tills/session-1/close",
  ]);
  const bodies=calls.map(x=>JSON.parse(String(x.init.body)) as Record<string,unknown>);
  expect(bodies).toEqual([
    {locationId:"loc_accra",tillCode:"UATACCRA02",openingFloatMinor:1000},
    {kind:"cash_in",amountMinor:250,note:"Sample safe float topup"},
    {countedCashMinor:1250,note:"Counted all test drawer cash"},
  ]);
  for(const {url,init} of calls){
    const headers=init.headers as Record<string,string>;
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(headers["X-CSRF-Token"]).toBe(csrf);
    expect(headers["Idempotency-Key"]?.length).toBeGreaterThan(20);
    expect(url.includes("/api/mock/")).toBe(false);
  }
  expect(new Set(calls.map(x=>(x.init.headers as Record<string,string>)["Idempotency-Key"])).size).toBe(3);
});

test("private till management screen enforces stage flag and real administrator role",()=>{
  const route=readFileSync("src/app/admin/pos/till-operations/page.tsx","utf8");
  const ui=readFileSync("src/features/staff/verified-till-operations.tsx","utf8");
  expect(route).toContain("VerifiedTillOperations");
  expect(ui).toContain('NEXT_PUBLIC_POS_COUNTER_UAT === "1"');
  expect(ui).toContain('session.actor.role!=="admin"');
  expect(ui).toContain("window.confirm");
  expect(ui).toContain("Confirm counted close");
  expect(ui).not.toContain("/api/mock/");
  expect(ui).not.toContain("resolveClientAdapter");
});

test("staged POS transport rejects missing verification or insecure remote API", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://example.test/api/v1";
  await expect(verifiedPosUat.tills()).rejects.toThrow("requires HTTPS");
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://pos-uat.example.test/api/v1";
  await expect(verifiedPosUat.hold("","id",[])).rejects.toThrow("verified web session");
});

test("UAT checkout page cannot use demo role or render cash actions without explicit build flag",()=>{
  const route=readFileSync("src/app/admin/pos/verified-uat/page.tsx","utf8");
  const ui=readFileSync("src/features/staff/verified-pos-uat.tsx","utf8");
  expect(route).toContain("VerifiedPosUat");
  const staffRoute=readFileSync("src/app/staff/pos/page.tsx","utf8");
  expect(staffRoute).toContain("VerifiedPosUat");
  expect(ui).toContain('NEXT_PUBLIC_POS_COUNTER_UAT === "1"');
  expect(ui).not.toContain("resolveClientAdapter");
  expect(ui).not.toContain("/api/mock/");
  expect(ui).toContain('!["admin", "cashier"].includes(session.actor.role)');
  expect(ui).toContain("window.confirm");
  expect(ui).toContain("no real customers or tender");
  expect(ui).toContain("Release reserved stock");
});
