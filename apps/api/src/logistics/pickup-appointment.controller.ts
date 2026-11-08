import { Body,Controller,Get,HttpCode,Param,Post,Req,Res,UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { bookPickupAppointmentRequestSchema,cancelPickupAppointmentRequestSchema,
  pickupAppointmentPolicyInputSchema,replayKeySchema } from "@variety/contracts";
import { CheckoutPrincipalService } from "../commerce-identity/checkout-principal.service";
import { ApiProblem,ApiRequest } from "../http/errors";
import { AccessGuard } from "../identity/access.guard";
import type { AuthRequest } from "../identity/identity.service";
import { PickupAppointmentService } from "./pickup-appointment.service";

function valid<T>(schema:{safeParse(value:unknown):any},input:unknown):T{
  const parsed=schema.safeParse(input);
  if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Invalid pickup appointment request.",
    parsed.error.issues.map((i:{path:PropertyKey[];message:string})=>({path:i.path.join("."),message:i.message})));
  return parsed.data as T;
}
function key(req:ApiRequest):string {return valid<string>(replayKeySchema,req.get("idempotency-key"));}

@ApiTags("pickup-appointments")
@Controller("orders/:orderId/pickup-appointments")
export class CustomerPickupAppointmentController {
  constructor(private readonly principal:CheckoutPrincipalService,private readonly appointments:PickupAppointmentService){}
  @Get()
  async list(@Param("orderId") orderId:string,@Req() req:ApiRequest){
    return {ok:true,data:await this.appointments.options(orderId,await this.principal.forRead(req))};
  }
  @Post() @HttpCode(200)
  async book(@Param("orderId") orderId:string,@Req() req:ApiRequest,@Res({passthrough:true}) res:Response,@Body() body:unknown){
    const input=valid<{startsAt:string}>(bookPickupAppointmentRequestSchema,body);
    const actor=await this.principal.forMutation(req,res);
    return {ok:true,data:await this.appointments.change(orderId,actor,key(req),{kind:"book",startsAt:input.startsAt},req.requestId)};
  }
  @Post("cancel") @HttpCode(200)
  async cancel(@Param("orderId") orderId:string,@Req() req:ApiRequest,@Res({passthrough:true}) res:Response,@Body() body:unknown){
    valid(cancelPickupAppointmentRequestSchema,body);
    const actor=await this.principal.forMutation(req,res);
    return {ok:true,data:await this.appointments.change(orderId,actor,key(req),{kind:"cancel"},req.requestId)};
  }
}

@ApiTags("admin-pickup-appointments")
@Controller("admin/logistics/nodes/:nodeId/pickup-appointment-policy")
@UseGuards(AccessGuard)
export class AdminPickupAppointmentPolicyController {
  constructor(private readonly appointments:PickupAppointmentService){}
  private admin(req:AuthRequest) {
    if(req.actor.role!=="admin")throw new ApiProblem(403,"FORBIDDEN","Administrator access required.");
  }
  @Get()
  async get(@Param("nodeId") nodeId:string,@Req() req:AuthRequest){
    this.admin(req);return {ok:true,data:await this.appointments.policy(nodeId)};
  }
  @Post() @HttpCode(200)
  async save(@Param("nodeId") nodeId:string,@Req() req:AuthRequest,@Body() raw:unknown){
    this.admin(req);
    const input=valid(pickupAppointmentPolicyInputSchema,raw);
    return {ok:true,data:await this.appointments.savePolicy(nodeId,req.actor.id,key(req),input,req.requestId)};
  }
}
