import { randomUUID } from "node:crypto";
import { Database } from "../database/database";
import { CustomerOtpRepository } from "../notifications/customer-otp-repository";
import { sendHubtelSms } from "../notifications/hubtel-sms-provider";
import { Body,Controller,Get,HttpCode,Param,Post,Req } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { trackRequestSchema,trackPublicRequestSchema } from "@variety/contracts";
import { CheckoutPrincipalService } from "../commerce-identity/checkout-principal.service";
import { ApiProblem,ApiRequest } from "../http/errors";
import { OrderQueryService } from "./order-query.service";
@ApiTags("orders") @Controller("orders")
export class OrdersController {constructor(private readonly principals:CheckoutPrincipalService,private readonly orders:OrderQueryService,private readonly db:Database){}
 private otpRepo(){const secret=process.env.CUSTOMER_OTP_HMAC_KEY, key=process.env.CUSTOMER_MESSAGE_ENCRYPTION_KEY;
 if(process.env.CUSTOMER_OTP_ENABLED!=="true"||!secret||!key||!(/^[a-f0-9]{64}$/i.test(secret)&&/^[a-f0-9]{64}$/i.test(key)))throw new ApiProblem(503,"FEATURE_DISABLED","SMS verification unavailable.");
 return new CustomerOtpRepository(this.db,secret,key);}
 @Post("track-otp/request") @HttpCode(200) async requestOrderOtp(@Body() body:unknown,@Req() req:ApiRequest){
 const parsed=trackPublicRequestSchema.safeParse(body);if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Enter a valid order number.");
 const reference=parsed.data.reference.trim().toUpperCase();
 await this.orders.limitTracking(req.ip||req.socket.remoteAddress||"unknown",reference);
 const order=await this.db.order.findUnique({where:{reference},select:{id:true,customerPhone:true}});
 // Uniform response for unknown orders: no order/phone enumeration via this endpoint.
 const fallback={challengeId:randomUUID(),expiresAt:new Date(Date.now()+300000).toISOString()};
 if(!order||!/^\+?[0-9]{9,15}$/.test(order.customerPhone))return {ok:true,data:fallback};
 const endpoint=process.env.HUBTEL_SMS_ENDPOINT??"https://sms.hubtel.com/v1/messages/send";
 const clientId=process.env.HUBTEL_SMS_CLIENT_ID,clientSecret=process.env.HUBTEL_SMS_CLIENT_SECRET,senderId=process.env.HUBTEL_SMS_SENDER_ID;
 if(!clientId||!clientSecret||!senderId)throw new ApiProblem(503,"FEATURE_DISABLED","SMS verification unavailable.");
 let challenge;
 try{challenge=await this.otpRepo().issue(order.id,order.customerPhone,"sensitive_action");}
 catch{throw new ApiProblem(429,"RATE_LIMITED","Please wait before requesting another code.");}
 try{await sendHubtelSms({endpoint,clientId,clientSecret,senderId},order.customerPhone,`Variety Groceries order access code: ${challenge.code}. Expires in 5 minutes. Do not share.`);}
 catch{await this.db.customerOtpChallenge.updateMany({where:{id:challenge.id,status:"pending"},data:{status:"locked"}});throw new ApiProblem(503,"UNAVAILABLE","SMS delivery unavailable. Try again later.");}
 return {ok:true,data:{challengeId:challenge.id,expiresAt:challenge.expiresAt.toISOString()}};
 }
 @Post("track-otp/verify") @HttpCode(200) async verifyOrderOtp(@Body() body:unknown,@Req() req:ApiRequest){
 if(!body||typeof body!=="object"||Array.isArray(body))throw new ApiProblem(400,"VALIDATION_FAILED","Invalid verification request.");
 const {reference,challengeId,code}=body as Record<string,unknown>;
 const parsed=trackPublicRequestSchema.safeParse({reference});
 if(!parsed.success||typeof challengeId!=="string"||!(/^[0-9a-f-]{36}$/i.test(challengeId))||typeof code!=="string"||!(/^\d{6}$/.test(code)))throw new ApiProblem(400,"VALIDATION_FAILED","Invalid verification request.");
 const normalized=parsed.data.reference.trim().toUpperCase();
 await this.orders.limitTracking(req.ip||req.socket.remoteAddress||"unknown",normalized);
 const order=await this.db.order.findUnique({where:{reference:normalized},select:{id:true}});
 const challenge=order?await this.db.customerOtpChallenge.findFirst({where:{id:challengeId,userId:order.id,purpose:"sensitive_action"},select:{id:true}}):null;
 if(!challenge||!await this.otpRepo().verify(challengeId,code))throw new ApiProblem(403,"FORBIDDEN","Invalid or expired verification code.");
 return {ok:true,data:await this.orders.verifiedOrderDetails(order!.id)};
 }
 @Get(":orderId") async status(@Param("orderId") id:string,@Req() req:ApiRequest){const p=await this.principals.forRead(req);return{ok:true,data:await this.orders.status(p,id)};}
 @ApiExcludeEndpoint() @Post("track-public") @HttpCode(200) async trackPublic(@Body() body:unknown,@Req() req:ApiRequest){
  const parsed=trackPublicRequestSchema.safeParse(body);
  if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Enter a valid order number.");
  return {ok:true,data:await this.orders.trackPublic(parsed.data.reference,req.ip||req.socket.remoteAddress||"unknown")};
 }
 @Post("track") @HttpCode(200) async track(@Body() body:unknown,@Req() req:ApiRequest){const p=trackRequestSchema.safeParse(body);if(!p.success)throw new ApiProblem(400,"VALIDATION_FAILED","Invalid tracking request.");const clientKey=req.ip||req.socket.remoteAddress||"unknown";return{ok:true,data:await this.orders.track(p.data.reference,p.data.code,clientKey,req.requestId)};}
}