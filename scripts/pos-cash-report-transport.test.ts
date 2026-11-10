import {afterEach,expect,test} from "bun:test";
import {HttpServiceAdapter} from "../src/services/adapters/http";
import {restEndpoints} from "../src/services/contracts/endpoints";
import {resolveProductionClientAdapter} from "../src/services/adapters/browser";
import {isDemoStaffSessionActive} from "@/features/staff/staff-demo-session";

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});

test("verified till report exposes only read operations",()=>{
  expect(restEndpoints["pos.tills.list"]).toEqual({
    method:"GET",path:"/admin/pos/tills",
  });
  expect(restEndpoints["pos.tills.reconciliation"]).toEqual({
    method:"GET",path:"/admin/pos/tills/{sessionId}/reconciliation",
  });
});

test("real till report uses cookie-authenticated GET with no writes",async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  // Bun 1.4.4 adds fetch.preconnect to the global callable type.
  globalThis.fetch=Object.assign(async(input: RequestInfo | URL,init?: RequestInit)=>{
    calls.push({url:String(input),init:init??{}});
    return Response.json({ok:true,data:{source:"server_cash_ledger"}});
  },{preconnect:()=>{}});
  const api=new HttpServiceAdapter("https://api.varietygroceries.com/api/v1",{
    credentials:"include",kind:"http:api",
  });
  await api.request({op:"pos.tills.list"});
  await api.request({op:"pos.tills.reconciliation",query:{
    sessionId:"550e8400-e29b-41d4-a716-446655440000",
  }});
  expect(calls.map(c=>c.url)).toEqual([
    "https://api.varietygroceries.com/api/v1/admin/pos/tills",
    "https://api.varietygroceries.com/api/v1/admin/pos/tills/550e8400-e29b-41d4-a716-446655440000/reconciliation",
  ]);
  for(const {init} of calls){
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
  }
});

test("verified report never uses demo endpoints when a stale demo flag exists",async()=>{
  const originalBase=process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,"window");
  const calls:string[]=[];
  try{
    process.env.NEXT_PUBLIC_API_BASE_URL="https://api.varietygroceries.com/api/v1";
    Object.defineProperty(globalThis,"window",{
      configurable:true,
      value:{sessionStorage:{getItem:(key:string)=>
        key==="vg-staff-demo-session-v1"?"1":null}},
    });
    expect(isDemoStaffSessionActive()).toBe(true);
    globalThis.fetch=Object.assign(async(input:RequestInfo|URL)=>{
      calls.push(String(input));
      return Response.json({ok:true,data:{enabled:false,includesSales:false,sessions:[]}});
    },{preconnect:()=>{}});
    await resolveProductionClientAdapter().request({op:"pos.tills.list"});
    expect(calls).toEqual([
      "https://api.varietygroceries.com/api/v1/admin/pos/tills",
    ]);
    expect(calls.every(url=>!url.includes("/api/mock/"))).toBe(true);
  }finally{
    if(originalWindow)Object.defineProperty(globalThis,"window",originalWindow);
    else Reflect.deleteProperty(globalThis,"window");
    if(originalBase===undefined)delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL=originalBase;
  }
});

test("verified reporting fails closed if the real API URL is missing",()=>{
  const originalBase=process.env.NEXT_PUBLIC_API_BASE_URL;
  try{
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    expect(()=>resolveProductionClientAdapter()).toThrow(
      "The production API is not configured.",
    );
  }finally{
    if(originalBase!==undefined)process.env.NEXT_PUBLIC_API_BASE_URL=originalBase;
  }
});
