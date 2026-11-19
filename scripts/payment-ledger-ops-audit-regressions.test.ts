/// <reference types="bun-types" />
import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {normalizePaymentLedgerPage} from "../src/services/payment-ledger";
import {paymentLedgerPageCsv} from "../src/features/staff/payment-ledger-csv";
import type {PaymentRow} from "../src/services/contracts";

const row=(overrides:Partial<PaymentRow>={}):PaymentRow=>({
 id:"attempt-1",orderId:"order-1",orderReference:"VG-ORDER-1",
 provider:"hubtel",method:"hosted_checkout",status:"pending",
 settlementState:"exception",initiationState:"uncertain",
 amountLabel:"₵1,234.50",callbackCount:0,
 createdAtLabel:"19 Nov 2026, 12:00",...overrides,
});

describe("staff payment exception rollup and page-limited CSV",()=>{
 test("rollup query is independent of current page, status and order reference",()=>{
   const page=readFileSync("src/app/admin/payments/page.tsx","utf8");
   expect(page).toContain('page: 1, perPage: 1, settlementState: "exception"');
   expect(page).toContain("globalExceptions = exceptionError || !exceptionSummary ? null : exceptionSummary.total");
   expect(page).toContain("Full exception count unavailable.");
   expect(page).toContain("Review exceptions");
   expect(page).toContain('setStatus("all"); setReferenceDraft(""); setOrderReference(""); setSettlement("exception"); setPage(1)');
   expect(page).toContain("Refresh counts");
   expect(page).not.toContain("globalExceptions = rows.filter");
 });
 test("a one-record server response can report the entire exception total",()=>{
   const value=normalizePaymentLedgerPage({
     page:1,perPage:1,total:87,
     items:[{
       attemptId:"attempt-1",orderId:"order-1",orderReference:"VG-1",
       provider:"hubtel",method:"hosted_checkout",amountMinor:250,
       status:"pending",settlementState:"exception",initiationState:"uncertain",
       callbackCount:0,createdAt:"2026-11-19T12:00:00.000Z",
     }],
   },{page:1,perPage:1,settlementState:"exception"});
   expect(value.total).toBe(87);
   expect(value.items.length).toBe(1);
   expect(value.isDemo).toBe(false);
 });
 test("demo exception count filters the complete fixture array before slicing",()=>{
   const rows=[row(),row({id:"two",settlementState:"unsettled"}),row({id:"three"})];
   const result=normalizePaymentLedgerPage(rows,{page:1,perPage:1,settlementState:"exception"});
   expect(result).toMatchObject({total:2,page:1,perPage:1,isDemo:true});
   expect(result.items).toHaveLength(1);
 });
 test("CSV says visible page only, contains scope metadata, never claims a bank deposit",()=>{
   const csv=paymentLedgerPageCsv({items:[row()],page:2,perPage:25,total:101,isDemo:false},{
     status:"pending",settlementState:"exception",orderReference:"VG-ORDER-1",
   });
   expect(csv.startsWith("\ufeff")).toBe(true);
   expect(csv).toContain("payment attempts — visible page only");
   expect(csv).toContain('"Page","2"');
   expect(csv).toContain('"Matching attempts across all pages","101"');
   expect(csv).toContain('"Attempts exported from this page","1"');
   expect(csv).toContain('"Settlement filter","exception"');
   expect(csv).toContain('"Exact order reference filter","VG-ORDER-1"');
   expect(csv).toContain('"VG-ORDER-1","hubtel","hosted_checkout"');
   expect(csv).toContain('"₵1,234.50"');
   expect(csv.split("\r\n")).toHaveLength(12);
   expect(csv).not.toContain("bank deposit verified");
 });
 test("untrusted provider references and free text cannot execute spreadsheet formulas",()=>{
   const csv=paymentLedgerPageCsv({
     items:[row({
       orderReference:' =HYPERLINK("https://evil.test")',
       providerRef:"-SUM(1,1)",failureReason:'@SUM(1,2)\r\nInjected',
       method:'+HYPERLINK("fake")',provider:'="secret"',
     })],page:1,perPage:25,total:1,isDemo:true,
   });
   for(const escaped of [
     "' =HYPERLINK", "'-SUM", "'@SUM", "'+HYPERLINK", "'=",
   ]) expect(csv).toContain(escaped);
   expect(csv).not.toContain("\nInjected");
   expect(csv).toContain('""https://evil.test""');
   expect(csv).toContain('""secret""');
   expect(csv).toContain('"Demo fixture, not financial evidence"');
 });
 test("unsafe or inconsistent export page metadata is rejected, never claimed complete",()=>{
   const data={items:[row(),row({id:"two"})],page:1,perPage:1,total:2,isDemo:false};
   expect(()=>paymentLedgerPageCsv(data)).toThrow(/Invalid payment ledger snapshot/);
   expect(()=>paymentLedgerPageCsv({...data,perPage:25,total:-1})).toThrow();
   expect(()=>paymentLedgerPageCsv({...data,perPage:25,page:0})).toThrow();
 });
 test("staff page only exports currently loaded ledger rows; never mutates financial state",()=>{
   const page=readFileSync("src/app/admin/payments/page.tsx","utf8");
   expect(page).toContain("paymentLedgerPageCsv(data, {");
   expect(page).toContain("Export visible page CSV");
   expect(page).toContain("data.items.length");
   expect(page).toContain("new Blob([csv]");
   expect(page).not.toContain('apiOps.paymentReconcile');
   expect(page).not.toContain('apiOps.refundAction');
 });
});
