import {Body,Controller,Get,HttpCode,Param,Post,Req,UseGuards} from "@nestjs/common";
import {ApiCookieAuth,ApiTags} from "@nestjs/swagger";
import {cashierTillOpenSchema,cashierTillMoveSchema,cashierTillCloseSchema,replayKeySchema}
  from "@variety/contracts";
import {AccessGuard} from "../identity/access.guard";
import type {AuthRequest} from "../identity/identity.service";
import {ApiProblem,ApiRequest} from "../http/errors";
import {CashierTillsService} from "./cashier-tills.service";

const replay=(req:ApiRequest)=>{
  const p=replayKeySchema.safeParse(req.get("idempotency-key"));
  if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED",
    "Every till mutation requires a valid Idempotency-Key.");
  return p.data;
};
@ApiTags("pos-till-foundation")
@ApiCookieAuth()
@Controller("admin/pos/tills")
@UseGuards(AccessGuard)
export class CashierTillsController {
  constructor(private readonly tills:CashierTillsService){}
  private admin(req:AuthRequest){
    if(req.actor.role!=="admin")throw new ApiProblem(403,"FORBIDDEN",
      "Only authorised administrators may manage preliminary till records.");
    return req.actor.id;
  }
  @Get()
  async list(@Req() req:AuthRequest){
    this.admin(req);
    return {ok:true,data:await this.tills.list()};
  }
  @Get(":sessionId")
  async detail(@Req() req:AuthRequest,@Param("sessionId") id:string){
    this.admin(req);
    return {ok:true,data:await this.tills.detail(id)};
  }
  @Post() @HttpCode(200)
  async open(@Req() req:AuthRequest,@Body() raw:unknown){
    const actorId=this.admin(req);
    const p=cashierTillOpenSchema.safeParse(raw);
    if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "A valid location, till code and opening float are required.",p.error.issues);
    return {ok:true,data:await this.tills.open(actorId,replay(req),req.requestId,p.data)};
  }
  @Post(":sessionId/movements") @HttpCode(200)
  async movement(@Req() req:AuthRequest,@Param("sessionId") id:string,@Body() raw:unknown){
    const actorId=this.admin(req);
    const p=cashierTillMoveSchema.safeParse(raw);
    if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "Movement kind, positive amount and a reason are required.",p.error.issues);
    return {ok:true,data:await this.tills.move(actorId,id,replay(req),req.requestId,p.data)};
  }
  @Post(":sessionId/close") @HttpCode(200)
  async close(@Req() req:AuthRequest,@Param("sessionId") id:string,@Body() raw:unknown){
    const actorId=this.admin(req);
    const p=cashierTillCloseSchema.safeParse(raw);
    if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "Counted drawer cash and a documented closing reason are required.",p.error.issues);
    return {ok:true,data:await this.tills.close(actorId,id,replay(req),req.requestId,p.data)};
  }
}
