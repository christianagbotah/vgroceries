import type {PrismaClient} from "@prisma/client";
import {decryptCustomerDestination} from "./customer-message-crypto";
import {resolveSmsOrder} from "./order-sms-payment-evidence";
import {currentOrderSmsState} from "./order-sms-dispatch";
import {hasOrderEmailProof,normalizeOrderEmail,orderEmailCopy,orderEmailMaxAgeMs,planOrderEmail} from "./order-email-policy";
import {sendOrderEmail,validateOrderEmailConfig,type OrderEmailConfig,type OrderEmailMessage} from "./order-email-transport";

/** Claim before calling the MTA. Never retry an ambiguous external attempt. */
export async function dispatchOneOrderEmail(db:PrismaClient,options:{
 enabled:boolean;keyHex:string;config:OrderEmailConfig;now?:Date;sender?:typeof sendOrderEmail;
}){
 if(!options.enabled)return {outcome:"disabled" as const};
 validateOrderEmailConfig(options.config);
 if(!/^[a-f0-9]{64}$/i.test(options.keyHex))throw Error("Invalid email dispatch key.");
 const now=options.now??new Date();
 if(!Number.isFinite(now.getTime()))throw Error("Invalid email dispatch time.");
 const claim=await db.$transaction(async tx=>{
  const lock=await tx.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(20261126,61) AS locked`;
  if(!lock[0]?.locked)return {outcome:"busy" as const};
  const item=await tx.customerMessageDelivery.findFirst({where:{channel:"email",status:"pending",attempts:0,nextAttemptAt:{lte:now}},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  if(!item)return {outcome:"empty" as const};
  const event=await tx.outboxEvent.findUnique({where:{id:item.sourceEventId},select:{id:true,type:true,aggregateId:true,createdAt:true,payload:true,emailStageReceipt:true}});
  let message:OrderEmailMessage|null=null;
  if(event&&event.emailStageReceipt?.outcome==="queued"&&now.getTime()-event.createdAt.getTime()<=orderEmailMaxAgeMs){
   const resolved=await resolveSmsOrder(tx,event,now);
   const order=resolved?await tx.order.findUnique({where:{id:resolved.orderId},select:{id:true,reference:true,customerEmail:true,emailConsent:true,fulfilmentStatus:true,cancelledAt:true,paymentStatus:true,paymentMethod:true,totalMinor:true}}):null;
   const plan=order&&resolved?planOrderEmail({event:{...event,type:resolved.template??event.type,aggregateId:resolved.orderId},order,enabled:true,evaluatedAt:now,paymentConfirmed:resolved.paymentConfirmed,deliveryConfirmed:resolved.deliveryConfirmed}):null;
   if(order?.emailConsent&&plan&&plan.recipientFingerprint===item.recipientFingerprint&&plan.templateKey===item.templateKey&&item.templateVersion===1&&item.consentRecordedAt?.getTime()===plan.consentRecordedAt.getTime()&&currentOrderSmsState(plan.templateKey,order.fulfilmentStatus,order.cancelledAt)){
    if(!hasOrderEmailProof(order.emailConsent,now)){
     await tx.customerMessageDelivery.updateMany({where:{id:item.id,status:"pending",attempts:0},data:{nextAttemptAt:new Date(now.getTime()+120000),lastErrorCode:"awaiting_email_verification"}});
     return {outcome:"deferred" as const};
    }
    try{
     const recipient=decryptCustomerDestination(item.recipientEncrypted,options.keyHex);
     if(recipient===normalizeOrderEmail(order.customerEmail))message={recipient,...orderEmailCopy(plan.templateKey,order)};
    }catch{/* Suppress invalid ciphertext or copy. */}
   }
  }
  if(!message){
   const changed=await tx.customerMessageDelivery.updateMany({where:{id:item.id,status:"pending",attempts:0},data:{status:"suppressed",lastErrorCode:"dispatch_evidence_invalid"}});
   return {outcome:changed.count?"suppressed" as const:"busy" as const};
  }
  const changed=await tx.customerMessageDelivery.updateMany({where:{id:item.id,status:"pending",attempts:0},data:{status:"sending",attempts:1,lastErrorCode:"attempt_started"}});
  if(!changed.count)return {outcome:"busy" as const};
  return {outcome:"claimed" as const,id:item.id,message};
 },{timeout:15000});
 if(claim.outcome!=="claimed")return {outcome:claim.outcome};
 try{
  await (options.sender??sendOrderEmail)(options.config,claim.message);
 }catch{
  await db.customerMessageDelivery.updateMany({where:{id:claim.id,status:"sending",attempts:1,lastErrorCode:"attempt_started"},data:{lastErrorCode:"provider_outcome_unknown"}});
  return {outcome:"unknown" as const};
 }
 await db.customerMessageDelivery.updateMany({where:{id:claim.id,status:"sending",attempts:1,lastErrorCode:"attempt_started"},data:{lastErrorCode:"accepted_awaiting_delivery"}});
 return {outcome:"accepted" as const};
}
