import {Body,Controller,Get,Headers,HttpCode,Module,Param,Post,Req,UseGuards} from "@nestjs/common";
import {ApiExcludeController} from "@nestjs/swagger";
import {AccessGuard} from "../identity/access.guard";
import type {AuthRequest} from "../identity/identity.service";
import {ApiProblem} from "../http/errors";
import {TransferRequisitionService} from "./transfer-requisition.service";
import {transferDecisionSchema,transferRequestSchema} from "./transfer-requisition.schemas";

@ApiExcludeController()
@Controller("inventory/transfer-requisitions")
@UseGuards(AccessGuard)
export class TransferRequisitionController{
 constructor(private readonly service:TransferRequisitionService){}
 @Get()
 async list(@Req() req:AuthRequest){return {ok:true,data:await this.service.list(req)};}
 @Post()
 async request(@Req() req:AuthRequest,@Body() raw:unknown,@Headers("idempotency-key") key?:string){
  const parsed=transferRequestSchema.safeParse(raw);
  if(!parsed.success||!key||!/^[A-Za-z0-9:_-]{8,128}$/.test(key))throw new ApiProblem(400,"VALIDATION_FAILED","Valid transfer request and Idempotency-Key required.");
  return {ok:true,data:await this.service.request(req,parsed.data,key)};
 }
 @Post(":id/decision") @HttpCode(200)
 async decide(@Req() req:AuthRequest,@Param("id") id:string,@Body() raw:unknown){
  const parsed=transferDecisionSchema.safeParse(raw);
  if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Valid head-office decision required.");
  return {ok:true,data:await this.service.decide(req,id,parsed.data)};
 }
}
@Module({controllers:[TransferRequisitionController],providers:[TransferRequisitionService]})
export class TransferRequisitionModule{}
