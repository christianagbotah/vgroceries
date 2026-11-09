import type {PosTillReconciliationView} from "@variety/contracts";

/**
 * Read-only CSV serialization of one already validated, consistent till
 * snapshot. Never claims electronic settlement, refund or tax reconciliation.
 * Guard against spreadsheet formula injection in dynamic text fields.
 */
function textCell(value:string):string{
  const oneLine=value.replace(/[\r\n\t\u0000-\u001f\u007f]/g," ");
  const safe=/^\s*[=+\-@]/u.test(oneLine)?"'"+oneLine:oneLine;
  return '"'+safe.replace(/"/g,'""')+'"';
}
const numeric=(value:number)=>{
  if(!Number.isSafeInteger(value))throw new Error("Invalid till report integer");
  return String(value);
};
const csvRow=(label:string,value:string|number|null)=>{
  const v=value===null?"":typeof value==="number"?numeric(value):textCell(value);
  return textCell(label)+","+v;
};

/** Each monetary value is in **pesewas**, not major currency units.
 * This avoids rounding and establishes a consistent machine-read format.
 */
export function renderPosTillReconciliationCsv(report:PosTillReconciliationView):string{
  const rows:Array<[string,string|number|null]>=[
    ["report_kind","Variety Groceries CASH DRAWER ONLY"],
    ["reference_scope","Not a tax invoice, bank/provider settlement or complete accounting reconciliation"],
    ["till_session_id",report.tillSessionId],
    ["location_id",report.locationId],
    ["till_code",report.tillCode],
    ["status",report.status],
    ["generated_at_utc",report.generatedAt],
    ["opened_at_utc",report.openedAt],
    ["closed_at_utc",report.closedAt],
    ["currency","Ghana cedi"],
    ["monetary_units","pesewas"],
    ["opening_float_minor",report.openingFloatMinor],
    ["manual_cash_in_minor",report.manualCashInMinor],
    ["manual_cash_out_minor",report.manualCashOutMinor],
    ["manual_cash_drops_minor",report.manualCashDropsMinor],
    ["completed_cash_sales_minor",report.cashSalesMinor],
    ["completed_cash_sales_count",report.cashSalesCount],
    ["expected_drawer_cash_minor",report.expectedDrawerCashMinor],
    ["actual_counted_cash_minor",report.actualCountedCashMinor],
    ["closing_expected_cash_minor",report.closingExpectedCashMinor],
    ["closing_difference_minor",report.closingDifferenceMinor],
    ["independent_recomputed_difference_minor",report.recomputedDifferenceMinor],
    ["closing_matches_ledger",report.closingMatchesLedger===null?null:
      String(report.closingMatchesLedger)],
    ["active_stock_holds_count",report.activeStockHoldsCount],
    ["cash_sales_references_truncated",String(report.recentCashSalesTruncated)],
    ["electronic_payments_reconciled","false"],
    ["refunds_reconciled","false"],
    ["tax_or_general_ledger_reconciled","false"],
  ];
  report.recentCashSales.forEach((sale,index)=>{
    const n=index+1;
    rows.push(
      ["recent_sale_"+n+"_reference",sale.reference],
      ["recent_sale_"+n+"_at_utc",sale.createdAt],
      ["recent_sale_"+n+"_amount_minor",sale.amountMinor],
    );
  });
  return "\ufeff"+["metric,value",...rows.map(([label,value])=>csvRow(label,value))].join("\r\n")+"\r\n";
}
