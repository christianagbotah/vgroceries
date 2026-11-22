import { Body,Controller,Get,HttpCode,Param,Post,Req } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { trackRequestSchema, trackPublicRequestSchema, trackOtpVerifyRequestSchema } from "@variety/contracts";
import { CheckoutPrincipalService } from "../commerce-identity/checkout-principal.service";
import { ApiProblem,ApiRequest } from "../http/errors";
import { OrderQueryService } from "./order-query.service";
import { OrderTrackingOtpService } from "./order-tracking-otp.service";
@ApiTags("orders") @Controller("orders")
export class OrdersController {constructor(private readonly principals:CheckoutPrincipalService,private readonly orders:OrderQueryService,private readonly orderOtp:OrderTrackingOtpService){}
 @Get(":orderId") async status(@Param("orderId") id:string,@Req() req:ApiRequest){const p=await this.principals.forRead(req);return{ok:true,data:await this.orders.status(p,id)};}
 @ApiExcludeEndpoint() @Post("track-public") @HttpCode(200)
 async trackPublic(@Body() body:unknown,@Req() req:ApiRequest){
  const parsed=trackPublicRequestSchema.safeParse(body);
  if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Enter a valid order number.");
  return {ok:true,data:await this.orders.trackPublic(parsed.data.reference,req.ip||req.socket.remoteAddress||"unknown")};
 }
 @ApiExcludeEndpoint() @Post("track-otp/request") @HttpCode(200)
 async requestTrackOtp(@Body() body:unknown,@Req() req:ApiRequest){
  const parsed=trackPublicRequestSchema.safeParse(body);
  if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Enter a valid order number.");
  return {ok:true,data:await this.orderOtp.request(parsed.data.reference,req.ip||req.socket.remoteAddress||"unknown")};
 }
 @ApiExcludeEndpoint() @Post("track-otp/verify") @HttpCode(200)
 async verifyTrackOtp(@Body() body:unknown,@Req() req:ApiRequest){
  const parsed=trackOtpVerifyRequestSchema.safeParse(body);
  if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Enter the 6-digit verification code.");
  return {ok:true,data:await this.orderOtp.verify(parsed.data.reference,parsed.data.challengeId,parsed.data.code,req.ip||req.socket.remoteAddress||"unknown")};
 }
 @Post("track") @HttpCode(200) async track(@Body() body:unknown,@Req() req:ApiRequest){const p=trackRequestSchema.safeParse(body);if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED","Invalid tracking request.");const clientKey=req.ip||req.socket.remoteAddress||"unknown";return{ok:true,data:await this.orders.track(p.data.reference,p.data.code,clientKey,req.requestId)};}
}