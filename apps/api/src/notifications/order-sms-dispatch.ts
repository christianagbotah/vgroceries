import type {PrismaClient} from "@prisma/client";
import {customerMessage} from "./customer-channel-policy";
import {decryptCustomerDestination} from "./customer-message-crypto";
import {planOrderSms} from "./order-sms-staging-policy";
import {sendHubtelSms,validateHubtelSmsConfig,type HubtelSmsConfig} from "./hubtel-sms-provider";

import {outForDeliveryCopy,type DeliverySmsContact} from "./out-for-delivery-copy";
import {resolveSmsOrder} from "./order-sms-payment-evidence";
import {guestOrderSmsProofWhere, registeredOrderSmsPhoneVerified, orderCreatedPaymentInstruction} from "./order-sms-recipient-policy";

const maxAge=24*60*60*1000;
const safeReference=(value:unknown)=>typeof value==="string"&&/^[A-Za-z0-9._:-]{1,128}$/.test(value)?value:undefined;

export function currentOrderSmsState(type:string,fulfilmentStatus:string,cancelledAt:Date|null){
 if(type==="refund.succeeded")return true; // Independent committed refund authority required, including cancelled orders.
 if(type==="order.cancelled")return !!cancelledAt&&fulfilmentStatus==="cancelled";
 if(type==="payment.requires_review")return true; // Current committed exception independently revalidated.
 if(cancelledAt||fulfilmentStatus==="cancelled")return false;
 if(["payment.pending","payment.failed","payment.expired"].includes(type))return true; // Current payment state and newest attempt independently revalidated.
 if(type==="delivery.failed")return !["delivered","collected"].includes(fulfilmentStatus); // Current authoritative failed job independently revalidated.
 if(type==="payment.succeeded")return true; // Independently revalidated financial evidence required.
 if(type==="delivery.out_for_delivery")return fulfilmentStatus==="dispatched";
 if(type==="delivery.delivered")return fulfilmentStatus==="delivered";
 if(type==="order.created")return true; // Historical creation is true even after preparation starts.
 if(type==="fulfilment.confirmed")return fulfilmentStatus==="confirmed";
 if(type==="fulfilment.picking_started")return fulfilmentStatus==="picking";
 if(type==="fulfilment.handed_over")return fulfilmentStatus==="collected";
 if(type==="fulfilment.packed")return ["packed","ready_for_collection"].includes(fulfilmentStatus);
 return false;
}

/** A committed one-attempt claim precedes the external POST. A crash or
 * ambiguous result remains sending, never automatically eligible again.
 * Gateway acceptance is not a handset delivery receipt. */
export async function dispatchOneOrderSms(db:PrismaClient,options:{
 enabled:boolean;keyHex:string;config:HubtelSmsConfig;fetcher?:typeof fetch;now?:Date;guestProofEnabled?:boolean;
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
  const event=await tx.outboxEvent.findUnique({where:{id:item.sourceEventId},select:{id:true,type:true,aggregateId:true,createdAt:true,payload:true,smsStageReceipt:true}});
  let prepared:{recipient:string;content:string}|null=null;
  if(event&&event.smsStageReceipt?.outcome==="queued"&&now.getTime()-event.createdAt.getTime()<=maxAge){
   const resolved=await resolveSmsOrder(tx,event,now);
   const order=resolved?await tx.order.findUnique({where:{id:resolved.orderId},select:{id:true,reference:true,customerPhone:true,customerUserId:true,guestSessionId:true,smsConsent:true,fulfilmentStatus:true,cancelledAt:true,paymentMethod:true,paymentStatus:true,totalMinor:true,deliveryJob:{select:{assignmentKind:true,providerKey:true,providerNameSnapshot:true,riderProfile:{select:{phone:true,user:{select:{name:true,role:true,active:true}}}}}},customerUser:{select:{phone:true,phoneVerifiedAt:true,active:true,role:true}}}}):null;
   const plan=order&&resolved?planOrderSms({event:{...event,type:resolved.template??event.type,aggregateId:resolved.orderId},order,enabled:true,evaluatedAt:now,paymentConfirmed:resolved.paymentConfirmed,deliveryConfirmed:resolved.deliveryConfirmed,refundAmountMinor:resolved.refundAmountMinor}):null;
   // Revalidate immutable queue identity and current consent before reading
   // phone proof. A guest who has not yet verified may finish the OTP flow
   // within the existing 24-hour event window, without losing the queued event.
   const valid = order && plan &&
      plan.recipientFingerprint===item.recipientFingerprint&&plan.templateKey===item.templateKey&&
      item.templateVersion===1&&item.consentRecordedAt?.getTime()===plan.consentRecordedAt.getTime()&&
      currentOrderSmsState(plan.templateKey,order.fulfilmentStatus,order.cancelledAt);
   let recipientVerified = false;
   if(valid && order && plan){
    recipientVerified=registeredOrderSmsPhoneVerified(order.customerUser,order.customerPhone,now);
    if(!order.customerUserId&&order.guestSessionId){
     if(options.guestProofEnabled!==true){
      await tx.customerMessageDelivery.updateMany({where:{id:item.id,status:"pending",attempts:0},data:{nextAttemptAt:new Date(now.getTime()+30000),lastErrorCode:"guest_sms_temporarily_disabled"}});
      return {outcome:"deferred" as const};
     }
     const proof=await tx.customerOtpChallenge.findFirst({
      where:guestOrderSmsProofWhere(order.id,plan.recipientFingerprint,plan.consentRecordedAt,now),
      select:{id:true},
     });
     recipientVerified=!!proof;
     if(!recipientVerified){
      await tx.customerMessageDelivery.updateMany({where:{id:item.id,status:"pending",attempts:0},
       data:{nextAttemptAt:new Date(now.getTime()+30000),lastErrorCode:"awaiting_guest_phone_verification"}});
      return {outcome:"deferred" as const};
     }
    }
   }
   if(valid&&order&&plan&&recipientVerified){
    try{
     const recipient=decryptCustomerDestination(item.recipientEncrypted,options.keyHex);
     if(recipient===order.customerPhone){
      let content=customerMessage(plan.templateKey,order.reference,plan.templateKey==="payment.succeeded"?order.totalMinor:plan.templateKey==="refund.succeeded"?resolved?.refundAmountMinor:undefined,order.fulfilmentStatus).body;
      if(plan.templateKey==="order.created")
       content+=orderCreatedPaymentInstruction(order.paymentMethod,order.paymentStatus);
      if(plan.templateKey==="delivery.out_for_delivery"){
       const job=order.deliveryJob;
       let contact:DeliverySmsContact|null=null;
       if(job?.assignmentKind==="rider"&&job.riderProfile?.user.active&&job.riderProfile.user.role==="rider"){
        contact={kind:"rider",name:job.riderProfile.user.name,phone:job.riderProfile.phone};
       }else if(job?.assignmentKind==="manual_provider"){
        const id=job.providerKey?.startsWith("directory:")?job.providerKey.slice("directory:".length):null;
        const partner=id?await tx.deliveryPartner.findUnique({where:{id},select:{contactPhone:true}}):null;
        contact={kind:"courier",name:job.providerNameSnapshot??"",phone:partner?.contactPhone};
       }
       content=outForDeliveryCopy({reference:order.reference,contact,paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,totalMinor:order.totalMinor});
      }
      prepared={recipient,content};
     }
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
