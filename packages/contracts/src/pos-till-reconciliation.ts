import {z} from "zod";

/** Read-only, server-owned counter CASH drawer reconciliation preview.
 * Electronic provider settlements, refunds, tax/GL and off-platform deposits
 * are intentionally excluded from this surface.
 */
const minor=z.number().int().min(0).max(100000000);
const signedMinor=z.number().int().min(-100000000).max(100000000);
const date=z.string().datetime({offset:true});
const id=z.string().uuid();
export const posTillReconciliationViewSchema=z.object({
  tillSessionId:id,
  locationId:z.string().min(1),
  tillCode:z.string().min(1),
  status:z.enum(["open","closed"]),
  openedAt:date,closedAt:date.nullable(),
  generatedAt:date,
  openingFloatMinor:minor,
  manualCashInMinor:minor,
  manualCashOutMinor:minor,
  manualCashDropsMinor:minor,
  cashSalesMinor:minor,
  cashSalesCount:z.number().int().min(0),
  expectedDrawerCashMinor:minor,
  actualCountedCashMinor:minor.nullable(),
  closingExpectedCashMinor:minor.nullable(),
  closingDifferenceMinor:signedMinor.nullable(),
  recomputedDifferenceMinor:signedMinor.nullable(),
  closingMatchesLedger:z.boolean().nullable(),
  activeStockHoldsCount:z.number().int().min(0),
  recentCashSales:z.array(z.object({
    id,
    reference:z.string().min(1),
    createdAt:date,
    amountMinor:minor,
  }).strict()).max(20),
  recentCashSalesTruncated:z.boolean(),
  source:z.literal("server_cash_ledger"),
  scope:z.literal("cash_drawer_only"),
  electronicPaymentsReconciled:z.literal(false),
  refundsReconciled:z.literal(false),
  taxOrGeneralLedgerReconciled:z.literal(false),
}).strict();
export type PosTillReconciliationView=z.infer<typeof posTillReconciliationViewSchema>;
