import {Body,Controller,Get,Header,HttpCode,Param,Post,Query,Req,UseGuards} from "@nestjs/common";
import {ApiCookieAuth,ApiTags} from "@nestjs/swagger";
import {posCashSaleCompleteSchema,replayKeySchema} from "@variety/contracts";
import {AccessGuard} from "../identity/access.guard";
import type {AuthRequest} from "../identity/identity.service";
import {ApiProblem,type ApiRequest} from "../http/errors";
import {PosCashSalesService} from "./pos-cash-sales.service";
import {posCashHistoryQuerySchema} from "./pos-cash-history-cursor";

const replay=(req:ApiRequest)=>{
  const p=replayKeySchema.safeParse(req.get("idempotency-key"));
  if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED",
    "A valid Idempotency-Key is required for each cash sale.");
  return p.data;
};
@ApiTags("pos-cash-sales")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("admin/pos/cash-sales")
export class PosCashSalesController {
  constructor(private readonly sales:PosCashSalesService){}
  private admin(req:AuthRequest){
    if(req.actor.role!=="admin")
      throw new ApiProblem(403,"FORBIDDEN",
        "Only authorised administrators may record physically counted cash sales.");
    return req.actor.id;
  }
  @Get()
  @Header("Cache-Control","private, no-store")
  async list(@Req() req:AuthRequest){
    this.admin(req);return {ok:true,data:await this.sales.list()};
  }
  @Get("history")
  @Header("Cache-Control","private, no-store")
  async history(@Req() req:AuthRequest,@Query() raw:unknown){
    this.admin(req);
    const parsed=posCashHistoryQuerySchema.safeParse(raw);
    if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Cash sale history accepts only a valid cursor and page limit.");
    return {ok:true,data:await this.sales.listPage(parsed.data.cursor,parsed.data.limit??25)};
  }
  // Read-only, authenticated browser print view. No JavaScript or third-party assets.
  @Get(":saleId/print")
  @Header("Content-Type","text/html; charset=utf-8")
  @Header("Cache-Control","private, no-store")
  @Header("X-Content-Type-Options","nosniff")
  @Header("Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
  async printReceipt(@Req() req:AuthRequest,@Param("saleId") id:string){
    this.admin(req);
    return this.sales.printReceipt(id);
  }
  @Get(":saleId")
  @Header("Cache-Control","private, no-store")
  async detail(@Req() req:AuthRequest,@Param("saleId") id:string){
    this.admin(req);return {ok:true,data:await this.sales.detail(id)};
  }
  @Post() @HttpCode(200)
  async complete(@Req() req:AuthRequest,@Body() raw:unknown){
    const actorId=this.admin(req);
    const parsed=posCashSaleCompleteSchema.safeParse(raw);
    if(!parsed.success)
      throw new ApiProblem(400,"VALIDATION_FAILED",
        "Physically counted full cash, goods handover and evidence note are required.",
        parsed.error.issues);
    return {ok:true,data:await this.sales.complete(
      actorId,replay(req),req.requestId,parsed.data)};
  }
}
