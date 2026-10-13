import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import {
  replayKeySchema,
  riderAcceptRequestSchema,
  riderAvailabilityRequestSchema,
  riderDeliverRequestSchema,
  riderFailRequestSchema,
  riderJobsQuerySchema,
  riderNoteRequestSchema,
  riderOutRequestSchema,
  riderPickupRequestSchema,
  type RiderAcceptRequest,
  type RiderAvailabilityRequest,
  type RiderDeliverRequest,
  type RiderFailRequest,
  type RiderJobsQuery,
  type RiderNoteRequest,
  type RiderOutRequest,
  type RiderPickupRequest,
} from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { RiderCommandService, type RiderCommandContext } from "./rider-command.service";
import { DispatchQueryService } from "./dispatch-query.service";

type Issue={path:PropertyKey[];message:string}; type Parser<T>={safeParse(input:unknown):{success:true;data:T}|{success:false;error:{issues:Issue[]}}};
@ApiExcludeController()
@Controller("rider")
@UseGuards(AccessGuard)
export class RiderController {
  constructor(private readonly commands:RiderCommandService,private readonly queries:DispatchQueryService){}
  private rider(req:AuthRequest){if(req.actor.role!=="rider")throw new ApiProblem(403,"FORBIDDEN","Rider access required.");}
  private parse<T>(schema:Parser<T>,input:unknown,message:string):T{const parsed=schema.safeParse(input);if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED",message,parsed.error.issues.map(i=>({path:i.path.map(String).join("."),message:i.message})));return parsed.data;}
  private context(req:AuthRequest):RiderCommandContext{return{requestId:req.requestId,idempotencyKey:this.parse(replayKeySchema,req.get("idempotency-key"),"A valid Idempotency-Key header is required.")};}
  @Get("me") async me(@Req()req:AuthRequest){this.rider(req);return{ok:true,data:await this.queries.riderMe(req.actor.id)};}
  @Put("me/availability") @HttpCode(200) async availability(@Req()req:AuthRequest,@Body()body:unknown){this.rider(req);const input=this.parse<RiderAvailabilityRequest>(riderAvailabilityRequestSchema,body,"Rider availability body is invalid.");return{ok:true,data:await this.commands.setOwnAvailability(req.actor.id,input,this.context(req))};}
  @Get("jobs") async jobs(@Req()req:AuthRequest,@Query()query:unknown){this.rider(req);const input=this.parse<RiderJobsQuery>(riderJobsQuerySchema,query,"Rider jobs query is invalid.");return{ok:true,data:input.scope==="history"?await this.queries.riderHistory(req.actor.id):await this.queries.riderJobs(req.actor.id)};}
  @Get("jobs/:jobId") async job(@Req()req:AuthRequest,@Param("jobId")jobId:string){this.rider(req);return{ok:true,data:await this.queries.riderJob(req.actor.id,jobId)};}
  @Post("jobs/:jobId/accept") @HttpCode(200) async accept(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.rider(req);const input=this.parse<RiderAcceptRequest>(riderAcceptRequestSchema,body,"Rider accept body is invalid.");return{ok:true,data:await this.commands.accept(req.actor.id,jobId,input,this.context(req))};}
  @Post("jobs/:jobId/pickup") @HttpCode(200) async pickup(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.rider(req);const input=this.parse<RiderPickupRequest>(riderPickupRequestSchema,body,"Rider pickup body is invalid.");return{ok:true,data:await this.commands.pickup(req.actor.id,jobId,input,this.context(req))};}
  @Post("jobs/:jobId/out-for-delivery") @HttpCode(200) async out(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.rider(req);const input=this.parse<RiderOutRequest>(riderOutRequestSchema,body,"Rider out-for-delivery body is invalid.");return{ok:true,data:await this.commands.outForDelivery(req.actor.id,jobId,input,this.context(req))};}
  @Post("jobs/:jobId/deliver") @HttpCode(200) async deliver(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.rider(req);const input=this.parse<RiderDeliverRequest>(riderDeliverRequestSchema,body,"Rider delivery body is invalid.");return{ok:true,data:await this.commands.deliver(req.actor.id,jobId,input,this.context(req))};}
  @Post("jobs/:jobId/fail") @HttpCode(200) async fail(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.rider(req);const input=this.parse<RiderFailRequest>(riderFailRequestSchema,body,"Rider failure body is invalid.");return{ok:true,data:await this.commands.fail(req.actor.id,jobId,input,this.context(req))};}
  @Post("jobs/:jobId/notes") @HttpCode(200) async note(@Req()req:AuthRequest,@Param("jobId")jobId:string,@Body()body:unknown){this.rider(req);const input=this.parse<RiderNoteRequest>(riderNoteRequestSchema,body,"Rider note body is invalid.");return{ok:true,data:await this.commands.note(req.actor.id,jobId,input,this.context(req))};}
}
