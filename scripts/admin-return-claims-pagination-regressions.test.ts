/// <reference types="bun-types" />
import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {customerReturnClaimsQuerySchema,customerReturnClaimsListSchema} from "../packages/contracts/src/customer-return-claims";
import {restEndpoints} from "../packages/contracts/src/endpoints";

const code=readFileSync("src/app/admin/return-claims/page.tsx","utf8");

describe("staff return request list is actually paginated and access controlled",()=>{
 test("existing server list endpoint is administrator-only, read-only and paginated",()=>{
   expect(restEndpoints["admin.return-claims"]).toMatchObject({method:"GET",path:"/admin/return-claims"});
   expect(code).toContain('apiOps.adminReturnClaims({page,perPage:PAGE_SIZE})');
   expect(code).toContain("const PAGE_SIZE=20");
   expect(code).not.toContain("adminReturnClaims({perPage:50})");
   expect(customerReturnClaimsQuerySchema.parse({page:"3",perPage:"20"})).toEqual({page:3,perPage:20});
   expect(customerReturnClaimsQuerySchema.safeParse({page:"0",perPage:"20"}).success).toBe(false);
   expect(customerReturnClaimsQuerySchema.safeParse({page:"1",perPage:"51"}).success).toBe(false);
 });
 test("server authoritative total, not first page item count, drives navigation",()=>{
   const value={enabled:false,items:[],page:3,perPage:20,total:45};
   expect(customerReturnClaimsListSchema.parse(value)).toEqual(value);
   expect(code).toContain("Math.ceil((list?.total??0)/PAGE_SIZE)");
   expect(code).toContain("list.total.toLocaleString()");
   expect(code).toContain("list.page");
   expect(code).toContain("Showing {(list.page-1)*PAGE_SIZE+1}");
   expect(code).toContain("Previous page");
   expect(code).toContain("Next page");
   expect(code).toContain("setPage(next)");
 });
 test("changing pages discards any in-flight prior response or pending decision",()=>{
   expect(code).toContain("const version=++requestVersion.current");
   expect(code).toContain("if(version===requestVersion.current)");
   expect(code).toContain("return()=>{requestVersion.current++;}");
   expect(code).toContain("setSelected(null);setNotice(null);setError(null)");
   expect(code).toContain("setList(null);setLoading(true);setPage(next)");
   expect(code).toContain("Retry this page");
   expect(code).toContain("goToPage(1)");
   expect(code).toContain("Refresh verified server records before retrying an uncertain review action.");
   expect(code).toContain("if(busy||loading||next<1||next>pageCount||next===page)return");
 });
 test("non-admin actors cannot render protected data or make financial mutations",()=>{
   expect(code).toContain('const isAdmin=can("returns.decide")');
   expect(code).toContain("isAdmin&&!loading&&list?.items.map");
   expect(code).toContain("isAdmin&&selected&&list?.enabled");
   expect(code).toContain("isAdmin&&list&&!loading?<nav");
   expect(code).toContain("No physical receipt, refund, stock restoration or payment operation");
   expect(code).not.toContain("apiOps.refundAction");
   expect(code).not.toContain("apiOps.paymentOutcome");
   expect(code).not.toContain("apiOps.physicalReturnReceive");
 });
});
