/// <reference types="bun-types" />
import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {customerReturnClaimsQuerySchema,customerReturnClaimsListSchema} from "../packages/contracts/src/customer-return-claims";
import {restEndpoints} from "../packages/contracts/src/endpoints";

const code=readFileSync("src/app/(storefront)/account/returns/page.tsx","utf8");

describe("customer return history honors every server-held request",()=>{
 test("owner-scoped GET uses bounded pages and exact server total",()=>{
   expect(restEndpoints["account.return-claims"]).toMatchObject({method:"GET",path:"/account/return-claims"});
   expect(code).toContain("apiOps.customerReturnClaims({page:historyPage,perPage:PAGE_SIZE})");
   expect(code).toContain("const PAGE_SIZE=20");
   expect(code).not.toContain("apiOps.customerReturnClaims({perPage:50})");
   expect(customerReturnClaimsQuerySchema.parse({page:"3",perPage:"20"})).toEqual({page:3,perPage:20});
   expect(customerReturnClaimsQuerySchema.safeParse({page:"0",perPage:"20"}).success).toBe(false);
   expect(customerReturnClaimsListSchema.parse({
     enabled:true,page:3,perPage:20,total:48,items:[],
   }).total).toBe(48);
   expect(code).toContain("Math.ceil((claims?.total??0)/PAGE_SIZE)");
   expect(code).toContain("claims.total.toLocaleString()");
 });
 test("previous and next navigation show only loaded history page",()=>{
   expect(code).toContain('aria-label="Your return request history pagination"');
   expect(code).toContain("Page {claims.page} of {pageCount}");
   expect(code).toContain("Showing {(claims.page-1)*PAGE_SIZE+1}");
   expect(code).toContain("Previous page");
   expect(code).toContain("Next page");
   expect(code).toContain("goToHistoryPage(historyPage+1)");
   expect(code).toContain("goToHistoryPage(historyPage-1)");
   expect(code).toContain("!historyLoading&&!historyError&&claims?.items.map");
   expect(code).toContain("(claims||historyLoading||historyError)?<section");
 });
 test("failed or stale reads cannot display outdated page or invent no return cases",()=>{
   expect(code).toContain("const version=++historyVersion.current");
   expect(code).toContain("if(version!==historyVersion.current)return false");
   expect(code).toContain("return()=>{historyVersion.current++;}");
   expect(code).toContain("setHistoryError(errorMessage(err))");
   expect(code).toContain("No earlier page is being presented as the current history");
   expect(code).toContain("Retry this page");
   expect(code).toContain("First page");
   expect(code).toContain('claims?.total===0?"No verified return requests');
 });
 test("creating a new claim returns to first page and retaining clear refund semantics",()=>{
   expect(code).toContain("if(historyPage!==1){setHistoryLoading(true);setHistoryPage(1);}");
   expect(code).toContain("apiOps.customerReturnClaimCreate");
   expect(code).toContain("apiOps.customerReturnClaimCancel");
   expect(code).toContain("Staff-recorded physical receipt");
   expect(code).toContain("They do not confirm");
   expect(code).toContain("does not guarantee a refund");
   expect(code).not.toContain("apiOps.createReturn(");
   expect(code).not.toContain("apiOps.paymentOutcome(");
   expect(code).not.toContain("apiOps.refundAction(");
 });
});
