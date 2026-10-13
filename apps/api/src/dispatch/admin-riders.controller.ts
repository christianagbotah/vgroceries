import { Body, Controller, Get, HttpCode, Param, Put, Req, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { replayKeySchema, riderAvailabilityRequestSchema, type RiderAvailabilityRequest } from "@variety/contracts";
import { ApiProblem } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { DispatchCommandService } from "./dispatch-command.service";
import { DispatchQueryService } from "./dispatch-query.service";
import type { DispatchCommandContext } from "./dispatch.values";

type Issue={path:PropertyKey[];message:string}; type Parser<T>={safeParse(input:unknown):{success:true;data:T}|{success:false;error:{issues:Issue[]}}};
@ApiExcludeController()
@Controller("admin/riders")
@UseGuards(AccessGuard)
export class AdminRidersController {
  constructor(private readonly commands:DispatchCommandService,private readonly queries:DispatchQueryService){}
  private admin(req:AuthRequest){if(req.actor.role!=="admin")throw new ApiProblem(403,"FORBIDDEN","Administrator access required.");}
  private parse<T>(schema:Parser<T>,input:unknown,message:string):T{const parsed=schema.safeParse(input);if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED",message,parsed.error.issues.map(i=>({path:i.path.map(String).join("."),message:i.message})));return parsed.data;}
  private context(req:AuthRequest):DispatchCommandContext{return{actorId:req.actor.id,requestId:req.requestId,idempotencyKey:this.parse(replayKeySchema,req.get("idempotency-key"),"A valid Idempotency-Key header is required.")};}
  @Get() async list(@Req()req:AuthRequest){this.admin(req);return{ok:true,data:await this.queries.listRiders()};}
  @Get(":riderProfileId") async detail(@Req()req:AuthRequest,@Param("riderProfileId")id:string){this.admin(req);return{ok:true,data:await this.queries.riderDetail(id)};}
  @Put(":riderProfileId/availability") @HttpCode(200) async availability(@Req()req:AuthRequest,@Param("riderProfileId")id:string,@Body()body:unknown){this.admin(req);const input=this.parse<RiderAvailabilityRequest>(riderAvailabilityRequestSchema,body,"Rider availability body is invalid.");return{ok:true,data:await this.commands.setRiderAvailability(id,input,this.context(req))};}
}
