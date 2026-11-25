import type {PrismaClient} from "@prisma/client";
import {customerMessage} from "./customer-channel-policy";
import {decryptCustomerDestination} from "./customer-message-crypto";
import {planOrderSms} from "./order-sms-staging-policy";
import {sendHubtelSms,validateHubtelSmsConfig,type HubtelSmsConfig} from "./hubtel-sms-provider";

const maxAge=24*60*60*1000;
const safeReference=(value:unknown)=>typeof value==="string"&&/^[A-Za-z0-9._:-]{1,128}$/.test(value)?value:undefined;

export function currentOrderSmsState(type:string,fulfilmentStatus:string,cancelledAt:Date|null){
 if(type==="order.cancelled")return !!cancelledAt&&fulfilmentStatus==="cancelled";
 if(cancelledAt||fulfilmentStatus==="cancelled")return false;
 if(type==="order.created")return fulfilmentStatus==="awaiting_confirmation";
 if(type==="fulfilment.confirmed")return fulfilmentStatus==="confirmed";
 if(type==="fulfilment.packed")return ["packed","ready_for_pickup","ready_for_dispatch"].includes(fulfilmentStatus);
 return false;
}

/** A committed one-attempt claim precedes the external POST. A crash or
 * ambiguous result remains sending, never automatically eligible again.
 * Gateway acceptance is not a handset delivery receipt. */
export async function dispatchOneOrderSms(db:PrismaClient,options:{
 enabled:boolean;keyHex:string;config:HubtelSmsConfig;fetcher?:typeof fetch;now?:Date;
}){
 if(!options.enabled)return {outcome:"disabled" as const};
 validateHubtelSmsConfig(options.config);
 if(!/^[a-f0-9]{64}$/i.test(options.keyHex))throw Error("Message dispatch key not configured.");
 const now=options.now??new Date();
 if(!Number.isFinite(now.getTime()))throw Error("Invalid dispatch clock.");
 const claimed=await db.$transaction(async tx=>{
  const lock=await tx.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(20261125,50) AS locked`;
  if(!lock[0]?.locked)return {outcome:"busy" as const};
  const item=await tx.customerMessageDelivery.findFirst({where:{channel:"sms",status:"pending",attempts:0,nextAttemptAt:{lte:now}},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  if(!item)return {outcome:"empty" as const};
  const event=await tx.outboxEvent.findUnique({where:{id:item.sourceEventId},select:{id:true,type:true,aggregateId:true,createdAt:true,smsStageReceipt:true}});
  let prepared:{recipient:string;content:string}|null=null;
  if(event&&event.smsStageReceipt?.outcome==="queued"&&now.getTime()-event.createdAt.getTime()<=maxAge){
   await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${event.aggregateId} FOR UPDATE`;
   const order=await tx.order.findUnique({where:{id:event.aggregateId},select:{id:true,reference:true,customerPhone:true,smsConsent:true,fulfilmentStatus:true,cancelledAt:true,customerUser:{select:{phone:true,phoneVerifiedAt:true,active:true,role:true}}}});
   const plan=order?planOrderSms({event,order,enabled:true,evaluatedAt:now}):null;
   // Initial sending scope is registered, active customers with a verified
   // matching phone. Guest SMS requires its own proof-of-possession flow.
   if(order&&plan&&order.customerUser?.active&&order.customerUser.role==="customer"&&
      order.customerUser.phoneVerifiedAt&&order.customerUser.phoneVerifiedAt.getTime()<=now.getTime()&&
      order.customerUser.phone===order.customerPhone&&
      plan.recipientFingerprint===item.recipientFingerprint&&plan.templateKey===item.templateKey&&
      item.templateVersion===1&&item.consentRecordedAt?.getTime()===plan.consentRecordedAt.getTime()&&
      currentOrderSmsState(event.type,order.fulfilmentStatus,order.cancelledAt)){
    try{
     const recipient=decryptCustomerDestination(item.recipientEncrypted,options.keyHex);
     if(recipient===order.customerPhone)prepared={recipient,content:customerMessage(plan.templateKey,order.reference).body};
    }catch{/* Invalid ciphertext never reaches a provider. */}
   }
  }
  if(!prepared){
   const changed=await tx.customerMessageDelivery.updateMany({where:{id:item.id,status:"pending",attempts:0},data:{status:"suppressed",lastErrorCode:"dispatch_evidence_invalid"}});
   return {outcome:changed.count?"suppressed" as const:"busy" as const};
  }
  const changed=await tx.customerMessageDelivery.updateMany({where:{id:item.id,status:"pending",attempts:0},data:{status:"sending",attempts:1,lastErrorCode:"attempt_started"}});
  if(!changed.count)return {outcome:"busy" as const};
  return {outcome:"claimed" as const,id:item.id,...prepared};
 },{timeout:15000});
 if(claimed.outcome!=="claimed")return {outcome:claimed.outcome};
 let reference:string|undefined;
 try{
  const result=await sendHubtelSms(options.config,claimed.recipient,claimed.content,options.fetcher);
  reference=safeReference(result.providerReference);
 }catch{
  // Never retry an uncertain POST, including a timeout or lost response.
  await db.customerMessageDelivery.updateMany({where:{id:claimed.id,status:"sending",attempts:1,lastErrorCode:"attempt_started"},data:{lastErrorCode:"provider_outcome_unknown"}});
  return {outcome:"unknown" as const};
 }
 await db.customerMessageDelivery.updateMany({where:{id:claimed.id,status:"sending",attempts:1,lastErrorCode:"attempt_started"},data:{providerMessageId:reference,lastErrorCode:"accepted_awaiting_delivery"}});
 return {outcome:"accepted" as const};
}
