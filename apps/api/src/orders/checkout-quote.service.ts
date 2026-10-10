import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CartLineInput, QuoteResponse } from "@variety/contracts";
import { API_CONFIG, ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { validateCheckoutLines, roundLineTotalMinor } from "./checkout.values";

export type CheckoutQuoteInput = { lines: CartLineInput[]; zoneId?: string };
type AvailabilityRow = { variantId: string; availableToSell: Prisma.Decimal };

@Injectable()
export class CheckoutQuoteService {
  constructor(private readonly db: Database, @Inject(API_CONFIG) private readonly config: ApiConfig) {}
  private commerce() {
    if (!this.config.commerce) throw new ApiProblem(503,"UNAVAILABLE","Commerce is not configured.");
    return this.config.commerce;
  }
  async quote(input: CheckoutQuoteInput): Promise<QuoteResponse> {
    const commerce=this.commerce();
    if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100)
      throw new ApiProblem(400,"VALIDATION_FAILED","Checkout requires between 1 and 100 lines.");
    const ids=[...new Set(input.lines.map(x=>x.variantId))];
    const variants=await this.db.variant.findMany({
      where:{id:{in:ids},active:true,product:{published:true,category:{active:true}}},
      include:{product:true},
    });
    if (variants.length !== ids.length)
      throw new ApiProblem(404,"NOT_FOUND","One or more products are unavailable.");
    const byId=new Map(variants.map(v=>[v.id,v]));
    validateCheckoutLines(input.lines,new Map(variants.map(v=>[v.id,v.unit])));
    const availability=await this.db.$queryRaw<AvailabilityRow[]>`SELECT "variantId","availableToSell" FROM variant_availability WHERE "locationId"=${commerce.locationId} AND "variantId"=ANY(${ids}::text[])`;
    const available=new Map(availability.map(x=>[x.variantId,new Prisma.Decimal(x.availableToSell)]));
    const lines=input.lines.map(line=>{
      const v=byId.get(line.variantId)!;
      const qty=new Prisma.Decimal(line.quantity);
      const avail=available.get(v.id)??new Prisma.Decimal(0);
      return {
        variantId:v.id, productId:v.productId, productName:v.product.name, variantName:v.name,
        unit:v.unit, quantity:qty.toString(), unitPriceMinor:v.priceMinor,
        lineTotalMinor:roundLineTotalMinor(v.priceMinor,qty.toString()), available:avail.toString(), availableNow:qty.lte(avail),
      };
    });
    let fee=0,min=0;
    if (input.zoneId) {
      const zone=await this.db.deliveryZone.findFirst({where:{id:input.zoneId,active:true}});
      if (!zone) throw new ApiProblem(400,"VALIDATION_FAILED","Delivery zone is unavailable.");
      fee=zone.feeMinor; min=zone.minimumOrderMinor;
    }
    const subtotal=lines.reduce((n,l)=>n+l.lineTotalMinor,0);
    const conflicts=lines.filter(l=>!l.availableNow).map(l=>({variantId:l.variantId,productName:l.productName,variantName:l.variantName,requested:l.quantity,available:l.available}));
    return {ok:conflicts.length===0 && subtotal>=min,lines,subtotalMinor:subtotal,deliveryFeeMinor:fee,totalMinor:subtotal+fee,minOrderMinor:min,meetsMinimum:subtotal>=min,conflicts};
  }
}
