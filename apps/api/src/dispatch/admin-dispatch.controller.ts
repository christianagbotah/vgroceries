import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import {
  dispatchAssignRequestSchema,
  dispatchListQuerySchema,
  dispatchProviderTransitionRequestSchema,
  dispatchReassignRequestSchema,
  dispatchRescheduleRequestSchema,
  dispatchReturnRequestSchema,
  dispatchReturnedRequestSchema,
  dispatchUnassignRequestSchema,
  replayKeySchema,
  type DispatchListQuery,
  type DispatchProviderTransitionRequest,
  type ProductionDispatchAssignRequest,
  type ProductionDispatchReassignRequest,
  type ProductionDispatchRescheduleRequest,
  type ProductionDispatchReturnRequest,
  type ProductionDispatchReturnedRequest,
  type ProductionDispatchUnassignRequest,
} from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { DispatchCommandService } from "./dispatch-command.service";
import { DispatchQueryService } from "./dispatch-query.service";
import type { DispatchCommandContext } from "./dispatch.values";

type Issue={path:PropertyKey[];message:string};
type Parser<T>={safeParse(input:unknown):{success:true;data:T}|{success:false;error:{issues:Issue[]}}};
@ApiExcludeController()
@Controller("admin/dispatch")
@UseGuards(AccessGuard)
export class AdminDispatchController {
  constructor(private readonly commands:DispatchCommandService,private readonly queries:DispatchQueryService){}
  private admin(req:AuthRequest){if(req.actor.role!=="admin")throw new ApiProblem(403,"FORBIDDEN","Administrator access required.");}
  private parse<T>(schema:Parser<T>,input:unknown,message:string):T{const parsed=schema.safeParse(input);if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED",message,parsed.error.issues.map(i=>({path:i.path.map(String).join("."),message:i.message})));return parsed.data;}
  private context(req:AuthRequest):DispatchCommandContext{return{actorId:req.actor.id,requestId:req.requestId,idempotencyKey:this.parse(replayKeySchema,req.get("idempotency-key"),"A valid Idempotency-Key header is required.")};}
  @Get() async list(@Req()req:AuthRequest,@Query()query:unknown){this.admin(req);const input=this.parse<DispatchListQuery>(dispatchListQuerySchema,query,"Dispatch query is invalid.");return{ok:true,data:await this.queries.listDispatch(input)};}
  @Get("jobs/:jobId") async detail(@Req()req:AuthRequest,@Param("jobId")jobId:string){this.admin(req);return{ok:true,data:await this.queries.dispatchDetail(jobId)};}
  @Post("orders/:orderId/assign") @HttpCode(200) async assign(@Req()req:AuthRequest,@Param("orderId")orderId:string,@Body()body:unknown){this.admin(req);const input=this.parse<ProductionDispatchAssignRequest>(dispatchAssignRequestSchema,body,"Dispatch assignment body is invalid.");return{ok:true,data:await this.commands.assign(orderId,input,this.context(req))};}
  @Post("jobs/:jobId/unassign") @HttpCode(200) async unassign(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.admin(req);const input=this.parse<ProductionDispatchUnassignRequest>(dispatchUnassignRequestSchema,body,"Dispatch unassignment body is invalid.");return{ok:true,data:await this.commands.unassign(jobId,input,this.context(req))};}
  @Post("jobs/:jobId/reassign") @HttpCode(200) async reassign(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.admin(req);const input=this.parse<ProductionDispatchReassignRequest>(dispatchReassignRequestSchema,body,"Dispatch reassignment body is invalid.");return{ok:true,data:await this.commands.reassign(jobId,input,this.context(req))};}
  @Post("jobs/:jobId/reschedule") @HttpCode(200) async reschedule(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.admin(req);const input=this.parse<ProductionDispatchRescheduleRequest>(dispatchRescheduleRequestSchema,body,"Dispatch reschedule body is invalid.");return{ok:true,data:await this.commands.reschedule(jobId,input,this.context(req))};}
  @Post("jobs/:jobId/return-to-store") @HttpCode(200) async returnToStore(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.admin(req);const input=this.parse<ProductionDispatchReturnRequest>(dispatchReturnRequestSchema,body,"Return-to-store body is invalid.");return{ok:true,data:await this.commands.returnToStore(jobId,input,this.context(req))};}
  @Post("jobs/:jobId/returned-to-store") @HttpCode(200) async returnedToStore(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.admin(req);const input=this.parse<ProductionDispatchReturnedRequest>(dispatchReturnedRequestSchema,body,"Returned-goods body is invalid.");return{ok:true,data:await this.commands.receiveReturnedGoods(jobId,input,this.context(req))};}
  @Post("jobs/:jobId/provider-transition") @HttpCode(200) async providerTransition(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.admin(req);const input=this.parse<DispatchProviderTransitionRequest>(dispatchProviderTransitionRequestSchema,body,"Manual provider transition body is invalid.");return{ok:true,data:await this.commands.manualProviderTransition(jobId,input,this.context(req))};}
}
