import {Body,Controller,Get,HttpCode,Post,Req,UseGuards,Inject} from "@nestjs/common";
import {ApiCookieAuth,ApiTags} from "@nestjs/swagger";
import {posQuoteRequestSchema} from "@variety/contracts";
import {AccessGuard} from "../identity/access.guard";
import type {AuthRequest} from "../identity/identity.service";
import {ApiProblem} from "../http/errors";
import {PosQuoteService} from "./pos-quote.service";
import {PosCashierAccess} from "./pos-cashier-access";
import {CatalogAdminService} from "../catalog-admin/catalog-admin.service";
import {API_CONFIG,type ApiConfig} from "../config";

@ApiTags("pos-quote")
@ApiCookieAuth()
@Controller("admin/pos")
@UseGuards(AccessGuard)
export class PosQuoteController {
  constructor(
    private readonly quotes:PosQuoteService,
    private readonly access:PosCashierAccess,
    private readonly catalogue:CatalogAdminService,
    @Inject(API_CONFIG) private readonly config:ApiConfig,
  ){}

  // Cashiers may only view published, active products at their assigned
  // configured commerce stock location. Never expose unpublished drafts.
  @Get("catalog")
  async catalog(@Req() req:AuthRequest){
    await this.access.location(req.actor,this.config.stockLocationId);
    const rows=await this.catalogue.listProducts();
    return {ok:true,data:rows.filter(row=>row.isPublished).map(row=>({
      ...row,variants:row.variants.filter(v=>v.isActive),
    }))};
  }

  @Post("quote") @HttpCode(200)
  async preview(@Req() req:AuthRequest,@Body() raw:unknown){
    const parsed=posQuoteRequestSchema.safeParse(raw);
    if(!parsed.success)
      throw new ApiProblem(400,"VALIDATION_FAILED",
        "An open till and valid item quantities are required.",parsed.error.issues);
    await this.access.till(req.actor,parsed.data.sessionId);
    return {ok:true,data:await this.quotes.quote(parsed.data)};
  }
}
