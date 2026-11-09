import {Body,Controller,Get,HttpCode,Param,Post,Query,Req,UseGuards} from "@nestjs/common";
import {ApiTags} from "@nestjs/swagger";
import {
  customerReturnClaimRequestSchema,customerReturnClaimCancelSchema,
  customerReturnClaimDecisionSchema,customerReturnClaimsQuerySchema,replayKeySchema,
} from "@variety/contracts";
import {IdentityService} from "../identity/identity.service";
import {AccessGuard} from "../identity/access.guard";
import type {AuthRequest} from "../identity/identity.service";
import {ApiProblem,ApiRequest} from "../http/errors";
import {CustomerReturnClaimsService} from "./customer-return-claims.service";

const replay=(req:ApiRequest)=>{
  const p=replayKeySchema.safeParse(req.get("idempotency-key"));
  if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED","An Idempotency-Key is required.");
  return p.data;
};

@ApiTags("customer-return-claims")
@Controller("account/return-claims")
export class CustomerReturnClaimsController {
  constructor(private readonly identity:IdentityService,
    private readonly claims:CustomerReturnClaimsService){}
  private async customer(req:ApiRequest){
    const auth=await this.identity.authenticate(req);
    if(auth.actor.role!=="customer")throw new ApiProblem(403,"FORBIDDEN",
      "Only the customer's authenticated account may manage return requests.");
    return auth.actor.id;
  }
  @Get()
  async list(@Req() req:ApiRequest,@Query() raw:unknown){
    const userId=await this.customer(req);
    const p=customerReturnClaimsQuerySchema.safeParse(raw);
    if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED","Invalid return pagination.");
    return {ok:true,data:await this.claims.list(userId,p.data.page,p.data.perPage)};
  }
  @Get("orders/:orderId/eligibility")
  async eligibility(@Req() req:ApiRequest,@Param("orderId") orderId:string){
    return {ok:true,data:await this.claims.eligibility(await this.customer(req),orderId)};
  }
  @Get(":claimId")
  async detail(@Req() req:ApiRequest,@Param("claimId") claimId:string){
    return {ok:true,data:await this.claims.detail(await this.customer(req),claimId)};
  }
  @Post() @HttpCode(200)
  async create(@Req() req:ApiRequest,@Body() raw:unknown){
    const userId=await this.customer(req);
    const p=customerReturnClaimRequestSchema.safeParse(raw);
    if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "Invalid return request or item quantities.",p.error.issues);
    return {ok:true,data:await this.claims.create(userId,replay(req),req.requestId,p.data)};
  }
  @Post(":claimId/cancel") @HttpCode(200)
  async cancel(@Req() req:ApiRequest,@Param("claimId") claimId:string,@Body() raw:unknown){
    const userId=await this.customer(req);
    const p=customerReturnClaimCancelSchema.safeParse(raw);
    if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED","Cancellation body must be empty.");
    return {ok:true,data:await this.claims.cancel(userId,claimId,replay(req),req.requestId)};
  }
}
@ApiTags("admin-return-claims")
@Controller("admin/return-claims")
@UseGuards(AccessGuard)
export class AdminReturnClaimsController {
  constructor(private readonly claims:CustomerReturnClaimsService){}
  private admin(req:AuthRequest){
    if(req.actor.role!=="admin")throw new ApiProblem(403,"FORBIDDEN",
      "Only administrators may review customer return claims.");
    return req.actor.id;
  }
  @Get()
  async list(@Req() req:AuthRequest,@Query() raw:unknown){
    this.admin(req);
    const p=customerReturnClaimsQuerySchema.safeParse(raw);
    if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED","Invalid return pagination.");
    return {ok:true,data:await this.claims.list(undefined,p.data.page,p.data.perPage)};
  }
  @Post(":claimId/decision") @HttpCode(200)
  async decide(@Req() req:AuthRequest,@Param("claimId") claimId:string,@Body() raw:unknown){
    const adminId=this.admin(req);
    const p=customerReturnClaimDecisionSchema.safeParse(raw);
    if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "A reasoned accept/reject decision is required.",p.error.issues);
    return {ok:true,data:await this.claims.decide(adminId,claimId,replay(req),req.requestId,p.data)};
  }
}
