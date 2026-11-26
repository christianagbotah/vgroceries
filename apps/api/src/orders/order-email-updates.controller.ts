import {Body,Controller,Get,Header,HttpCode,Param,Post,Req,Res} from "@nestjs/common";
import {ApiExcludeController} from "@nestjs/swagger";
import type {Response} from "express";
import {CheckoutPrincipalService} from "../commerce-identity/checkout-principal.service";
import {OrderEmailProofService} from "../notifications/order-email-proof.service";
import {OrderQueryService} from "./order-query.service";
import {ApiProblem, type ApiRequest} from "../http/errors";

@ApiExcludeController()
@Controller("orders/:orderId/email-updates")
export class OrderEmailUpdatesController {
 constructor(private readonly principals:CheckoutPrincipalService,private readonly proof:OrderEmailProofService,private readonly orders:OrderQueryService){}
 @Get() @Header("Cache-Control","private, no-store")
 async status(@Param("orderId") id:string,@Req() req:ApiRequest){
  return {ok:true,data:await this.proof.status(await this.principals.forRead(req),id)};
 }
 @Post() @HttpCode(200) @Header("Cache-Control","private, no-store")
 async action(@Param("orderId") id:string,@Body() body:unknown,@Req() req:ApiRequest,@Res({passthrough:true}) res:Response){
  if(!body||typeof body!=="object"||Array.isArray(body))throw new ApiProblem(400,"VALIDATION_FAILED","Invalid email preference request.");
  const value=body as Record<string,unknown>;
  const keys=Object.keys(value);
  if(value.action!=="request"&&value.action!=="verify"&&value.action!=="revoke")throw new ApiProblem(400,"VALIDATION_FAILED","Invalid email preference action.");
  if(value.action==="verify"?(keys.length!==3||typeof value.challengeId!=="string"||typeof value.code!=="string"):(keys.length!==1))
   throw new ApiProblem(400,"VALIDATION_FAILED","Invalid email preference request.");
  const principal=await this.principals.forMutation(req,res);
  // Reuse the existing durable per-IP tracking throttle in addition to
  // the mailbox-specific hourly issuance limit. Never accept a destination.
  if(value.action!=="revoke")await this.orders.limitTracking(req.ip||req.socket.remoteAddress||"unknown","email:"+id);
  if(value.action==="request")return {ok:true,data:await this.proof.request(principal,id)};
  if(value.action==="verify")return {ok:true,data:await this.proof.verify(principal,id,value.challengeId as string,value.code as string)};
  return {ok:true,data:await this.proof.revoke(principal,id)};
 }
}
