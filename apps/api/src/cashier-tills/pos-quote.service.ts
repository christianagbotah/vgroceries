import {Inject,Injectable} from "@nestjs/common";
import {posQuoteViewSchema,type PosQuoteRequest} from "@variety/contracts";
import {API_CONFIG,type ApiConfig} from "../config";
import {Database} from "../database/database";
import {ApiProblem} from "../http/errors";
import {CheckoutQuoteService} from "../orders/checkout-quote.service";

/**
 * P0b1: same pricing/stock availability authority as online checkout.
 * Intentionally read-only. No reservations, orders, tenders or till sales.
 */
@Injectable()
export class PosQuoteService {
  constructor(
    private readonly db:Database,
    @Inject(API_CONFIG) private readonly cfg:ApiConfig,
    private readonly checkoutQuote:CheckoutQuoteService,
  ) {}

  async quote(input:PosQuoteRequest){
    if(!this.cfg.posTillFoundationEnabled || !this.cfg.posQuoteEnabled)
      throw new ApiProblem(503,"POS_QUOTE_DISABLED",
        "Counter sale quotes have not been enabled for this environment.");
    if(!this.cfg.commerce)
      throw new ApiProblem(503,"UNAVAILABLE","Commerce stock has not been configured.");

    const till=await this.db.cashierTillSession.findUnique({
      where:{id:input.sessionId},
      select:{id:true,status:true,locationId:true},
    });
    if(!till)throw new ApiProblem(404,"NOT_FOUND","Cashier session not found.");
    if(till.status!=="open")
      throw new ApiProblem(409,"TILL_CLOSED","The selected cashier till is closed.");
    // The shared checkout quote is currently configured for one commerce
    // location. Never show another store's stock as if it were local.
    if(till.locationId!==this.cfg.commerce.locationId)
      throw new ApiProblem(422,"POS_LOCATION_NOT_SUPPORTED",
        "This till does not use the configured online inventory location.");

    const pricing=await this.checkoutQuote.quote({lines:input.lines});
    return posQuoteViewSchema.parse({
      sessionId:till.id,
      locationId:till.locationId,
      quotedAt:new Date().toISOString(),
      quoteOnly:true,
      stockReserved:false,
      orderCreated:false,
      paymentVerified:false,
      pricing,
    });
  }
}
