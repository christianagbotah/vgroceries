/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  normalizePaymentLedgerPage,
  normalizePaymentLedgerResponse,
} from "../src/services/payment-ledger";
import { restEndpoints } from "../packages/contracts/src/endpoints";

const base = {
  orderId: "order-1", orderReference: "VG-2026-001",
  provider: "hubtel", method: "hosted_checkout",
  amountMinor: 10050, status: "pending",
  settlementState: "exception", callbackCount: 0,
  createdAt: "2026-11-19T09:30:00.000Z",
};
function response(overrides: Record<string, unknown> = {}) {
  return {
    page: 2, perPage: 25, total: 58,
    items: [{attemptId:"attempt-26",...base}],
    ...overrides,
  };
}
function demoRows(n = 58) {
  return Array.from({length:n}, (_,i)=>({
    id:`demo-${i+1}`,orderId:`order-${i+1}`,
    orderReference:i===33?"VG-SPECIAL":"VG-2026-"+String(i+1).padStart(3,"0"),
    method:"mobile_money",amountLabel:"₵100.50",
    status:i%2 ? "pending":"succeeded",
    settlementState:i%3 ? "unsettled":"exception",
    callbackCount:0,createdAtLabel:"19 Nov, 09:30",
  }));
}
describe("admin payments paginated ledger",()=>{
  test("preserves authoritative production page/total without fabricating a whole-ledger count",()=>{
    const result = normalizePaymentLedgerPage(response(),{page:2,perPage:25});
    expect(result).toMatchObject({page:2,perPage:25,total:58,isDemo:false});
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id:"attempt-26",orderId:"order-1",orderReference:"VG-2026-001",
      provider:"hubtel",status:"pending",settlementState:"exception",
      amountLabel:"₵100.50",
    });
    expect(normalizePaymentLedgerResponse(response())).toHaveLength(1);
  });
  test("demo array retains all fixtures but exposes bounded pages",()=>{
    const rows=demoRows();
    expect(normalizePaymentLedgerPage(rows,{page:1,perPage:25})).toMatchObject({
      total:58,page:1,isDemo:true,
    });
    const page2=normalizePaymentLedgerPage(rows,{page:2,perPage:25});
    expect(page2.items).toHaveLength(25);
    expect(page2.items[0].id).toBe("demo-26");
    const page3=normalizePaymentLedgerPage(rows,{page:3,perPage:25});
    expect(page3.items).toHaveLength(8);
    expect(page3.items[7].id).toBe("demo-58");
  });
  test("demo filters before paging, not after",()=>{
    const all=demoRows();
    const filtered=normalizePaymentLedgerPage(all,{
      page:1,perPage:25,status:"pending",settlementState:"exception",
    });
    const expected=all.filter(x=>x.status==="pending"&&x.settlementState==="exception");
    expect(filtered.total).toBe(expected.length);
    expect(filtered.items.map(x=>x.id)).toEqual(expected.slice(0,25).map(x=>x.id));
  });
  test("exact order reference is case-insensitive for demo and server-scoped for production",()=>{
    const demo=normalizePaymentLedgerPage(demoRows(),{page:1,perPage:25,orderReference:"vg-special"});
    expect(demo.total).toBe(1);
    expect(demo.items[0].id).toBe("demo-34");
    const production=normalizePaymentLedgerPage(response(),{page:2,perPage:25,orderReference:"VG-2026-001"});
    expect(production.total).toBe(58); // server, not a locally recomputed result
  });
  test("invalid production metadata or mismatched requested page fails closed",()=>{
    for(const malformed of [
      response({page:1}),response({perPage:1000}),
      response({total:-1}),response({total:1.2}),
      response({items:[{...base}]}),
      response({items:Array(26).fill({attemptId:"a",...base})}),
    ]) expect(()=>normalizePaymentLedgerPage(malformed,{page:2,perPage:25})).toThrow();
    for(const page of [0,-2,1.5]) expect(()=>normalizePaymentLedgerPage([], {page})).toThrow();
    expect(()=>normalizePaymentLedgerPage([], {page:1,perPage:101})).toThrow();
  });
  test("real REST operation supports server-side query parameters without payment mutations",()=>{
    expect(restEndpoints["admin.payments"]).toMatchObject({method:"GET",path:"/payments"});
    const client=readFileSync("src/services/client.ts","utf8");
    expect(client).toContain('api<unknown>("admin.payments", { query: filters');
    const page=readFileSync("src/app/admin/payments/page.tsx","utf8");
    expect(page).toContain("apiOps.paymentLedger({");
    expect(page).toContain("orderReference: orderReference || undefined");
    expect(page).toContain("setPage(1)");
    expect(page).toContain("page {page} of {pageCount}");
    expect(page).toContain("Matching attempts (all pages)");
    expect(page).toContain("Exceptions (this page)");
    expect(page).toContain("Previous page");
    expect(page).toContain("Next page");
    expect(page).not.toContain("apiOps.payments()");
    expect(page).not.toContain("Settlement states here derive from the demo fixtures.");
  });
});
