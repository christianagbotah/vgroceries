import {Body,Controller,Get,HttpCode,Param,Post,Req,UseGuards} from "@nestjs/common";
import {ApiCookieAuth,ApiTags} from "@nestjs/swagger";
import {posCashSaleCompleteSchema,replayKeySchema} from "@variety/contracts";
import {AccessGuard} from "../identity/access.guard";
import type {AuthRequest} from "../identity/identity.service";
import {ApiProblem,type ApiRequest} from "../http/errors";
import {PosCashSalesService} from "./pos-cash-sales.service";

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
  async list(@Req() req:AuthRequest){
    this.admin(req);return {ok:true,data:await this.sales.list()};
  }
  @Get(":saleId")
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
