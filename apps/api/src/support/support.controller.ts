import { Body,Controller,Get,Inject,Module,Param,Post,Query,Req,UseGuards } from "@nestjs/common";
import { ApiCookieAuth,ApiOperation,ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { API_CONFIG, type ApiConfig } from "../config";
import { AccessGuard } from "../identity/access.guard";
import { trustedOrigin, type AuthRequest } from "../identity/identity.service";
import { ApiProblem, type ApiRequest } from "../http/errors";
import { SupportService,supportActionSchema,supportCreateSchema } from "./support.service";

@ApiTags("customer-support")
@Controller("support")
export class SupportPublicController {
  constructor(private readonly cases:SupportService,
    @Inject(API_CONFIG) private readonly config:ApiConfig){}
  @Post("requests")
  @ApiOperation({summary:"Request a human follow-up; no immediate SMS or telephone call"})
  async request(@Req() req:ApiRequest,@Body() input:unknown){
    trustedOrigin(req,this.config,true);
    const parsed=supportCreateSchema.safeParse(input);
    if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED",
      "Check the name, Ghana phone, subject, message and contact consent.",
      parsed.error.flatten());
    return {ok:true,data:await this.cases.create(
      parsed.data,req.ip??req.socket.remoteAddress??"unknown",req.requestId)};
  }
}
@ApiTags("admin-support")
@ApiCookieAuth()
@Controller("admin/support")
@UseGuards(AccessGuard)
export class SupportAdminController {
  constructor(private readonly cases:SupportService){}
  private admin(req:AuthRequest){
    if(req.actor.role!=="admin")throw new ApiProblem(403,"FORBIDDEN","Administrator-only customer support queue.");
  }
  @Get()
  @ApiOperation({summary:"List support requests and private case history (admin only)"})
  async list(@Req() req:AuthRequest,@Query("status") status?:string){
    this.admin(req);
    return {ok:true,data:await this.cases.list(status)};
  }
  @Post(":caseId/actions")
  @ApiOperation({summary:"Record support status and audited private note (admin only)"})
  async action(@Req() req:AuthRequest,@Param("caseId") caseId:string,@Body() input:unknown){
    this.admin(req);
    const parsed=supportActionSchema.safeParse(input);
    if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Valid status and an explanatory note are required.");
    return {ok:true,data:await this.cases.action(caseId,req.actor.id,req.requestId,parsed.data)};
  }
}
@Module({
  controllers:[SupportPublicController,SupportAdminController],
  providers:[SupportService],
})
export class SupportModule {}
