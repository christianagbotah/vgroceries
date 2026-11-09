import {Body,Controller,Get,HttpCode,Param,Post,Req,UseGuards} from "@nestjs/common";
import {ApiCookieAuth,ApiTags} from "@nestjs/swagger";
import {posHoldCreateSchema,posHoldReleaseSchema,replayKeySchema}
  from "@variety/contracts";
import {AccessGuard} from "../identity/access.guard";
import type {AuthRequest} from "../identity/identity.service";
import {ApiProblem,type ApiRequest} from "../http/errors";
import {PosHoldsService} from "./pos-holds.service";

const replay=(req:ApiRequest)=>{
  const p=replayKeySchema.safeParse(req.get("idempotency-key"));
  if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED",
    "A valid Idempotency-Key is required for stock reservation changes.");
  return p.data;
};

@ApiTags("pos-stock-holds")
@ApiCookieAuth()
@UseGuards(AccessGuard)
@Controller("admin/pos/holds")
export class PosHoldsController {
  constructor(private readonly holds:PosHoldsService){}
  private admin(req:AuthRequest){
    if(req.actor.role!=="admin")throw new ApiProblem(403,"FORBIDDEN",
      "Only authorised administrators can reserve a counter cart at this stage.");
    return req.actor.id;
  }
  @Get()
  async list(@Req() req:AuthRequest){
    this.admin(req);
    return {ok:true,data:await this.holds.list()};
  }
  @Get(":holdId")
  async detail(@Req() req:AuthRequest,@Param("holdId") id:string){
    this.admin(req);
    return {ok:true,data:await this.holds.detail(id)};
  }
  @Post() @HttpCode(200)
  async create(@Req() req:AuthRequest,@Body() raw:unknown){
    const actorId=this.admin(req);
    const p=posHoldCreateSchema.safeParse(raw);
    if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "Provide one open till and valid distinct product quantities.",p.error.issues);
    return {ok:true,data:await this.holds.create(actorId,replay(req),req.requestId,p.data)};
  }
  @Post(":holdId/release") @HttpCode(200)
  async release(@Req() req:AuthRequest,@Param("holdId") id:string,@Body() raw:unknown){
    const actorId=this.admin(req);
    const p=posHoldReleaseSchema.safeParse(raw);
    if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "A documented reason is required to release a reserved cart.",p.error.issues);
    return {ok:true,data:await this.holds.release(actorId,id,replay(req),req.requestId,p.data)};
  }
}
