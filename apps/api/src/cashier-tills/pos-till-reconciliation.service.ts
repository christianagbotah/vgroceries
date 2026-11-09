import {Inject,Injectable} from "@nestjs/common";
import {Prisma} from "@prisma/client";
import {posTillReconciliationViewSchema} from "@variety/contracts";
import {API_CONFIG,type ApiConfig} from "../config";
import {Database} from "../database/database";
import {ApiProblem} from "../http/errors";

/** P0c2b: read-only CASH drawer ledger, not a customer payment, refund, tax
 * or bank/GL reconciliation. Derived under one repeatable-read snapshot.
 */
@Injectable()
export class PosTillReconciliationService {
  constructor(
    private readonly db:Database,
    @Inject(API_CONFIG) private readonly config:ApiConfig,
  ) {}

  async preview(tillSessionId:string){
    if(!this.config.posTillFoundationEnabled)
      throw new ApiProblem(503,"POS_TILL_DISABLED",
        "Cashier shift reconciliation is not enabled for this environment.");
    const generatedAt=new Date();
    return this.db.$transaction(async tx=>{
      const till=await tx.cashierTillSession.findUnique({
        where:{id:tillSessionId},
      });
      if(!till)throw new ApiProblem(404,"NOT_FOUND","Cashier till session not found.");

      const [movements,sales,recent,activeStockHoldsCount]=await Promise.all([
        tx.cashierTillMovement.groupBy({
          by:["kind"],where:{sessionId:tillSessionId},
          _sum:{amountMinor:true},
        }),
        tx.posCashSale.aggregate({
          where:{tillSessionId},_sum:{subtotalMinor:true},
          _count:{id:true},
        }),
        tx.posCashSale.findMany({
          where:{tillSessionId},
          orderBy:[{createdAt:"desc"},{id:"desc"}],
          take:20,
          select:{id:true,reference:true,createdAt:true,subtotalMinor:true},
        }),
        tx.posStockHold.count({
          where:{tillSessionId,status:"held",expiresAt:{gt:generatedAt}},
        }),
      ]);
      const totals={cash_in:0,cash_out:0,drop:0};
      for(const row of movements){
        if(row.kind!=="cash_in"&&row.kind!=="cash_out"&&row.kind!=="drop")
          throw new ApiProblem(409,"POS_UNKNOWN_CASH_MOVEMENT",
            "The till contains a cash movement category requiring investigation.");
        totals[row.kind]=row._sum.amountMinor??0;
      }
      const cashSalesMinor=sales._sum.subtotalMinor??0;
      const expected=till.openingFloatMinor+totals.cash_in-
        totals.cash_out-totals.drop+cashSalesMinor;
      if(!Number.isSafeInteger(expected)||expected<0||expected>100000000)
        throw new ApiProblem(409,"POS_TILL_BALANCE_INTEGRITY",
          "Cash drawer expected balance is outside the permitted range.");

      const closed=till.status==="closed";
      const recomputedDifferenceMinor=closed&&till.closingCountedMinor!==null
        ?till.closingCountedMinor-expected:null;
      const closingMatchesLedger=closed
        ?(till.closingCountedMinor!==null&&
          till.closingExpectedMinor===expected&&
          till.closingDifferenceMinor===recomputedDifferenceMinor)
        :null;

      return posTillReconciliationViewSchema.parse({
        tillSessionId:till.id,locationId:till.locationId,
        tillCode:till.tillCode,status:till.status,
        openedAt:till.openedAt.toISOString(),
        closedAt:till.closedAt?.toISOString()??null,
        generatedAt:generatedAt.toISOString(),
        openingFloatMinor:till.openingFloatMinor,
        manualCashInMinor:totals.cash_in,
        manualCashOutMinor:totals.cash_out,
        manualCashDropsMinor:totals.drop,
        cashSalesMinor,
        cashSalesCount:sales._count.id,
        expectedDrawerCashMinor:expected,
        actualCountedCashMinor:closed?till.closingCountedMinor:null,
        closingExpectedCashMinor:closed?till.closingExpectedMinor:null,
        closingDifferenceMinor:closed?till.closingDifferenceMinor:null,
        recomputedDifferenceMinor,
        closingMatchesLedger,
        activeStockHoldsCount,
        recentCashSales:recent.map(s=>({
          id:s.id,reference:s.reference,
          createdAt:s.createdAt.toISOString(),
          amountMinor:s.subtotalMinor,
        })),
        recentCashSalesTruncated:sales._count.id>20,
        source:"server_cash_ledger",scope:"cash_drawer_only",
        electronicPaymentsReconciled:false,
        refundsReconciled:false,
        taxOrGeneralLedgerReconciled:false,
      });
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }
}
