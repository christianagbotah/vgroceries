import type {PrismaClient} from "@prisma/client";
import {encryptCustomerDestination} from "./customer-message-crypto";
import {resolveSmsOrder} from "./order-sms-payment-evidence";
import {emailStageEvents,normalizeOrderEmail,orderEmailMaxAgeMs,planOrderEmail} from "./order-email-policy";

/** Stages only committed lifecycle events. No mail or payment calls. */
export async function stageOrderEmailBatch(db:PrismaClient,options:{enabled:boolean;keyHex:string;take?:number;now?:Date}){
 const {enabled,keyHex,take=50,now=new Date()}=options;
 if(!enabled)return {disabled:true,scanned:0,queued:0,busy:false};
 if(!/^[a-f0-9]{64}$/i.test(keyHex)||!Number.isInteger(take)||take<1||take>100||!Number.isFinite(now.getTime()))throw Error("Invalid email staging configuration.");
 return db.$transaction(async tx=>{
  const lock=await tx.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(20261126,60) AS locked`;
  if(!lock[0]?.locked)return {disabled:false,scanned:0,queued:0,busy:true};
  const events=await tx.outboxEvent.findMany({where:{type:{in:[...emailStageEvents]},emailStageReceipt:{is:null},createdAt:{lte:now}},select:{id:true,type:true,aggregateId:true,createdAt:true,payload:true},orderBy:[{createdAt:"asc"},{id:"asc"}],take});
  let queued=0;
  for(const event of events){
   let outcome:"queued"|"ineligible"|"expired"="ineligible";
   if(now.getTime()-event.createdAt.getTime()>orderEmailMaxAgeMs)outcome="expired";
   else{
    const resolved=await resolveSmsOrder(tx,event,now);
    const order=resolved?await tx.order.findUnique({where:{id:resolved.orderId},select:{id:true,reference:true,customerEmail:true,emailConsent:true}}):null;
    const plan=order&&resolved?planOrderEmail({event:{...event,type:resolved.template??event.type,aggregateId:resolved.orderId},order,enabled,evaluatedAt:now,paymentConfirmed:resolved.paymentConfirmed,deliveryConfirmed:resolved.deliveryConfirmed}):null;
    const email=normalizeOrderEmail(order?.customerEmail);
    if(plan&&email){
     const result=await tx.customerMessageDelivery.createMany({data:[{...plan,recipientEncrypted:encryptCustomerDestination(email,keyHex)}],skipDuplicates:true});
     queued+=result.count;outcome="queued";
    }
   }
   await tx.orderEmailStageReceipt.create({data:{sourceEventId:event.id,outcome,processedAt:now}});
  }
  return {disabled:false,scanned:events.length,queued,busy:false};
 },{timeout:15000});
}
