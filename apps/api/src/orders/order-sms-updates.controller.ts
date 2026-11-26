import {Body,Controller,Get,Header,HttpCode,Param,Post,Req,Res} from "@nestjs/common";
import {ApiExcludeController} from "@nestjs/swagger";
import type {Response} from "express";
import {CheckoutPrincipalService} from "../commerce-identity/checkout-principal.service";
import type {CheckoutPrincipal} from "../commerce-identity/checkout-principal.service";
import {Database} from "../database/database";
import {ApiProblem,type ApiRequest} from "../http/errors";

const ownership=(principal:CheckoutPrincipal)=>principal.kind==="customer"?{customerUserId:principal.userId}:{guestSessionId:principal.guestSessionId};

@ApiExcludeController()
@Controller("orders/:orderId/sms-updates")
export class OrderSmsUpdatesController{
 constructor(private readonly principals:CheckoutPrincipalService,private readonly db:Database){}
 @Get() @Header("Cache-Control","private, no-store")
 async status(@Param("orderId") id:string,@Req() req:ApiRequest){
  const principal=await this.principals.forRead(req);
  const order=await this.db.order.findFirst({where:{id,...ownership(principal)},select:{smsConsent:true}});
  if(!order)throw new ApiProblem(404,"NOT_FOUND","Order not found.");
  return {ok:true,data:{state:order.smsConsent?(order.smsConsent.revokedAt?"revoked":"requested"):"not_requested"}};
 }
 @Post() @HttpCode(200) @Header("Cache-Control","private, no-store")
 async revoke(@Param("orderId") id:string,@Body() body:unknown,@Req() req:ApiRequest,@Res({passthrough:true}) res:Response){
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==1||(body as Record<string,unknown>).action!=="revoke")
   throw new ApiProblem(400,"VALIDATION_FAILED","Invalid SMS preference action.");
  const principal=await this.principals.forMutation(req,res);
  return this.db.$transaction(async tx=>{
   const owned=await tx.order.findFirst({where:{id,...ownership(principal)},select:{id:true}});
   if(!owned)throw new ApiProblem(404,"NOT_FOUND","Order not found.");
   // Same order-first lock as SMS staging and dispatch. A committed send
   // claim cannot be recalled, but no later claim may use revoked consent.
   await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
   const order=await tx.order.findFirst({where:{id,...ownership(principal)},select:{smsConsent:true}});
   if(!order)throw new ApiProblem(404,"NOT_FOUND","Order not found.");
   if(order.smsConsent&&!order.smsConsent.revokedAt){
    await tx.orderSmsConsent.updateMany({where:{orderId:id,revokedAt:null},data:{revokedAt:new Date()}});
    await tx.auditEvent.create({data:{actorId:principal.actorId,action:"order.sms_updates_revoked",entityId:id,requestId:req.requestId,details:{}}});
   }
   return {ok:true,data:{revoked:true}};
  });
 }
}
