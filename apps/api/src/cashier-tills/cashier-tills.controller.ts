import {Body,Controller,Get,Header,HttpCode,Param,Post,Req,UseGuards} from "@nestjs/common";
import {ApiCookieAuth,ApiTags} from "@nestjs/swagger";
import {cashierTillOpenSchema,cashierTillMoveSchema,cashierTillCloseSchema,replayKeySchema}
  from "@variety/contracts";
import {AccessGuard} from "../identity/access.guard";
import {hasPermission} from "../identity/permissions";
import type {AuthRequest} from "../identity/identity.service";
import {ApiProblem,ApiRequest} from "../http/errors";
import {CashierTillsService} from "./cashier-tills.service";
import {PosTillReconciliationService} from "./pos-till-reconciliation.service";
import {renderPosTillReconciliationCsv} from "./pos-till-reconciliation-csv";

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
  constructor(private readonly tills:CashierTillsService,
    private readonly reconciliation:PosTillReconciliationService){}
  private admin(req:AuthRequest){
    if(req.actor.role!=="admin")throw new ApiProblem(403,"FORBIDDEN",
      "Only authorised administrators may manage preliminary till records.");
    return req.actor.id;
  }
  /** null denotes administrator-wide access. Cashiers have location-only read access. */
  private readScope(req:AuthRequest):string[]|null{
    if(!hasPermission(req.actor.role,"pos.cash-report.read"))
      throw new ApiProblem(403,"FORBIDDEN","Cash report access is not permitted.");
    return req.actor.role==="admin"?null:req.actor.locationIds;
  }
  @Get()
  async list(@Req() req:AuthRequest){
    return {ok:true,data:await this.tills.list(this.readScope(req))};
  }
  // Safe CSV: exact values in pesewas, without verified bank/MoMo or tax claims.
  @Get(":sessionId/reconciliation.csv")
  @Header("Content-Type","text/csv; charset=utf-8")
  @Header("Cache-Control","private, no-store")
  @Header("Content-Disposition","attachment; filename=\"vg-pos-cash-drawer.csv\"")
  @Header("X-Content-Type-Options","nosniff")
  async reconciliationCsv(@Req() req:AuthRequest,@Param("sessionId") id:string){
    return renderPosTillReconciliationCsv(
      await this.reconciliation.preview(id,this.readScope(req)));
  }
  @Get(":sessionId/reconciliation")
  async reconciliationPreview(@Req() req:AuthRequest,@Param("sessionId") id:string){
    return {ok:true,data:await this.reconciliation.preview(id,this.readScope(req))};
  }
  @Get(":sessionId")
  async detail(@Req() req:AuthRequest,@Param("sessionId") id:string){
    return {ok:true,data:await this.tills.detail(id,this.readScope(req))};
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
