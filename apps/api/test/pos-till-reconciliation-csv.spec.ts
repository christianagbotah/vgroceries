import {test} from "node:test";
import assert from "node:assert/strict";
import type {PosTillReconciliationView} from "@variety/contracts";
import {renderPosTillReconciliationCsv} from
  "../src/cashier-tills/pos-till-reconciliation-csv";

const base:PosTillReconciliationView={
  tillSessionId:"11111111-1111-4111-8111-111111111111",
  locationId:"loc_accra",
  tillCode:"TILL-01",
  status:"closed",
  openedAt:"2026-11-09T10:00:00.000Z",
  closedAt:"2026-11-09T14:00:00.000Z",
  generatedAt:"2026-11-09T14:01:00.000Z",
  openingFloatMinor:1000,
  manualCashInMinor:200,
  manualCashOutMinor:50,
  manualCashDropsMinor:150,
  cashSalesMinor:523,
  cashSalesCount:1,
  expectedDrawerCashMinor:1523,
  actualCountedCashMinor:1500,
  closingExpectedCashMinor:1523,
  closingDifferenceMinor:-23,
  recomputedDifferenceMinor:-23,
  closingMatchesLedger:true,
  activeStockHoldsCount:0,
  recentCashSales:[{
    id:"22222222-2222-4222-8222-222222222222",
    reference:"VG-POS-123456789012",
    createdAt:"2026-11-09T11:00:00.000Z",
    amountMinor:523,
  }],
  recentCashSalesTruncated:false,
  source:"server_cash_ledger",
  scope:"cash_drawer_only",
  electronicPaymentsReconciled:false,
  refundsReconciled:false,
  taxOrGeneralLedgerReconciled:false,
};

test("cash reconciliation CSV is data-only, exact in pesewas, with no settlement claims",()=>{
  const csv=renderPosTillReconciliationCsv(base);
  assert.ok(csv.startsWith("\ufeffmetric,value\r\n"));
  assert.ok(csv.includes('"opening_float_minor",1000\r\n'));
  assert.ok(csv.includes('"completed_cash_sales_minor",523\r\n'));
  assert.ok(csv.includes('"closing_difference_minor",-23\r\n'));
  assert.ok(csv.includes('"expected_drawer_cash_minor",1523\r\n'));
  assert.ok(csv.includes('"recent_sale_1_reference","VG-POS-123456789012"'));
  assert.ok(csv.includes('"electronic_payments_reconciled","false"'));
  assert.ok(csv.includes('"refunds_reconciled","false"'));
  assert.ok(csv.includes('"tax_or_general_ledger_reconciled","false"'));
  assert.ok(!csv.includes("customerPhone"));
});

test("CSV formulae and malicious multiline fields are escaped, not executed",()=>{
  const csv=renderPosTillReconciliationCsv({
    ...base,
    tillCode:'=HYPERLINK("https://attacker.example", "click")\r\nOther,Data',
    recentCashSales:[{
      ...base.recentCashSales[0],
      reference:'+SUM(1,2)"\t@danger',
    }],
  });
  assert.ok(csv.includes('\"till_code\",\"\'=HYPERLINK(\"\"https://attacker.example\"\"'));
  assert.ok(csv.includes('\"recent_sale_1_reference\",\"\'+SUM(1,2)'));
  assert.ok(!csv.includes("\r\nOther,Data"));
  assert.ok(!csv.includes("\t@danger"));
  assert.equal(csv.split("\r\n").filter(x=>x.includes('"till_code"')).length,1);
});

test("CSV rejects non-integer money and never silently rounds a tampered report",()=>{
  assert.throws(()=>renderPosTillReconciliationCsv({
    ...base,cashSalesMinor:523.33,
  }),/Invalid till report integer/);
});
