import {afterEach,expect,test} from "bun:test";
import {HttpServiceAdapter} from "./http";
import {restEndpoints} from "../contracts/endpoints";

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
  globalThis.fetch=async(input,init)=>{
    calls.push({url:String(input),init:init??{}});
    return Response.json({ok:true,data:{source:"server_cash_ledger"}});
  };
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
