import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { CheckoutPrincipal } from "../commerce-identity/checkout-principal.service";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { customerDestinationFingerprint, encryptCustomerDestination } from "./customer-message-crypto";
import { canIssueCustomerOtp, digestCustomerOtp, generateCustomerOtp, OTP_TTL_MS } from "./customer-otp-policy";
import { otpConsumeWhere, otpFailureWhere } from "./customer-otp-state";
import { hasOrderEmailProof, normalizeOrderEmail } from "./order-email-policy";
import { sendOrderEmail, validateOrderEmailConfig } from "./order-email-transport";

const purpose = "order_email_verification";
const unavailable = () => new ApiProblem(503,"FEATURE_DISABLED","Email verification is unavailable.");
const invalid = () => new ApiProblem(403,"FORBIDDEN","Invalid or expired email verification code.");

@Injectable()
export class OrderEmailProofService {
 constructor(private readonly db: Database) {}

 private settings(){
  const secret=process.env.CUSTOMER_ORDER_EMAIL_OTP_HMAC_KEY??"",key=process.env.CUSTOMER_MESSAGE_ENCRYPTION_KEY??"";
  const config={enabled:process.env.CUSTOMER_ORDER_EMAIL_PROOF_ENABLED==="true",from:process.env.CUSTOMER_ORDER_EMAIL_FROM??"",sendmailPath:process.env.CUSTOMER_ORDER_EMAIL_SENDMAIL_PATH??""};
  if(!config.enabled||! /^[a-f0-9]{64}$/i.test(secret)||! /^[a-f0-9]{64}$/i.test(key))throw unavailable();
  try{validateOrderEmailConfig(config);}catch{throw unavailable();}
  return {secret,key,config};
 }

 private async owned(tx:Prisma.TransactionClient,principal:CheckoutPrincipal,orderId:string){
  // Same order-first lock as the lifecycle staging/dispatch transaction.
  const ownership=principal.kind==="customer"?{customerUserId:principal.userId}:{guestSessionId:principal.guestSessionId};
  const exists=await tx.order.findFirst({where:{id:orderId,...ownership},select:{id:true}});
  if(!exists)throw new ApiProblem(404,"NOT_FOUND","Order not found.");
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
  const order=await tx.order.findFirst({where:{id:orderId,...ownership},select:{id:true,customerEmail:true,emailConsent:true,cancelledAt:true,fulfilmentStatus:true}});
  if(!order)throw new ApiProblem(404,"NOT_FOUND","Order not found.");
  return order;
 }

 private eligible(order:Awaited<ReturnType<OrderEmailProofService["owned"]>>,now:Date){
  const email=normalizeOrderEmail(order.customerEmail),consent=order.emailConsent;
  if(!email||!consent||consent.policyVersion!=="order-email-v1"||consent.orderId!==order.id||
     consent.recipientFingerprint!==customerDestinationFingerprint(email)||consent.revokedAt||
     consent.recordedAt>now||order.cancelledAt||order.fulfilmentStatus==="cancelled")
   throw new ApiProblem(409,"CONFLICT","Email updates are not available for this order.");
  return {email,consent};
 }

 async request(principal:CheckoutPrincipal,orderId:string,now=new Date()){
  const {secret,key,config}=this.settings();
  const id=randomUUID(),code=generateCustomerOtp(),expiresAt=new Date(now.getTime()+OTP_TTL_MS);
  const result=await this.db.$transaction(async tx=>{
   const order=await this.owned(tx,principal,orderId);
   const {email,consent}=this.eligible(order,now);
   if(hasOrderEmailProof(consent,now))return {verified:true as const};
   const fingerprint=consent.recipientFingerprint;
   // Shared mailbox limit across different orders and replicas.
   await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${purpose+":"+fingerprint},0))`;
   const recent=await tx.customerOtpChallenge.findMany({where:{purpose,recipientFingerprint:fingerprint,createdAt:{gte:new Date(now.getTime()-3600000)}},orderBy:{createdAt:"desc"},take:5,select:{createdAt:true}});
   if(!canIssueCustomerOtp({now,lastIssuedAt:recent[0]?.createdAt,issuesLastHour:recent.length}))throw new ApiProblem(429,"OTP_RATE_LIMITED","Please wait before requesting another email code.");
   // Only the newest challenge for this order and mailbox remains usable.
   await tx.customerOtpChallenge.updateMany({where:{userId:orderId,purpose,status:"pending"},data:{status:"locked"}});
   await tx.customerOtpChallenge.create({data:{id,userId:orderId,purpose,recipientFingerprint:fingerprint,recipientEncrypted:encryptCustomerDestination(email,key),codeDigest:digestCustomerOtp(secret,id,code),expiresAt,createdAt:now}});
   return {verified:false as const,email};
  });
  if(result.verified)return {verified:true as const};
  try{
   await sendOrderEmail(config,{recipient:result.email,subject:"Variety Groceries - Verify your email",body:"Your Variety Groceries email verification code is "+code+". It expires in 5 minutes. Do not share it. If you did not request this code, ignore this message."});
  }catch{
   await this.db.customerOtpChallenge.updateMany({where:{id,purpose,status:"pending"},data:{status:"locked"}});
   throw new ApiProblem(503,"UNAVAILABLE","Email verification delivery unavailable. Try again later.");
  }
  return {verified:false as const,challengeId:id,expiresAt:expiresAt.toISOString()};
 }

 async verify(principal:CheckoutPrincipal,orderId:string,challengeId:string,code:string,now=new Date()){
  const {secret}=this.settings();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)||!/^\d{6}$/.test(code))throw invalid();
  const digest=digestCustomerOtp(secret,challengeId,code);
  const success=await this.db.$transaction(async tx=>{
   const order=await this.owned(tx,principal,orderId);
   const {consent}=this.eligible(order,now);
   const challenge=await tx.customerOtpChallenge.findFirst({where:{id:challengeId,userId:orderId,purpose,recipientFingerprint:consent.recipientFingerprint,createdAt:{gte:consent.recordedAt,lte:now}},select:{id:true}});
   if(!challenge)return false;
   const result=await tx.customerOtpChallenge.updateMany({where:otpConsumeWhere(challengeId,digest,now),data:{status:"consumed",consumedAt:now}});
   if(result.count!==1){
    await tx.customerOtpChallenge.updateMany({where:otpFailureWhere(challengeId,now),data:{attempts:{increment:1}}});
    return false;
   }
   const updated=await tx.orderEmailConsent.updateMany({where:{orderId,recipientFingerprint:consent.recipientFingerprint,revokedAt:null,recordedAt:consent.recordedAt},data:{verifiedAt:now}});
   if(updated.count!==1)throw invalid();
   return true;
  });
  if(!success)throw invalid();
  return {verified:true as const};
 }

 async revoke(principal:CheckoutPrincipal,orderId:string,now=new Date()){
  // Revocation stays available even when delivery/proof flags are disabled.
  return this.db.$transaction(async tx=>{
   const order=await this.owned(tx,principal,orderId);
   if(order.emailConsent&&!order.emailConsent.revokedAt){
    await tx.orderEmailConsent.updateMany({where:{orderId,revokedAt:null},data:{revokedAt:now}});
    await tx.customerOtpChallenge.updateMany({where:{userId:orderId,purpose,status:"pending"},data:{status:"locked"}});
   }
   return {revoked:true as const};
  });
 }
}
