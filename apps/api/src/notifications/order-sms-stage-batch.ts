import type {PrismaClient} from "@prisma/client";
import {encryptCustomerDestination} from "./customer-message-crypto";
import {smsStageEvents,planOrderSms} from "./order-sms-staging-policy";

import {resolveSmsOrder} from "./order-sms-payment-evidence";

const maxAgeMs=24*60*60*1000;

/** Source-only staging authority. No network, sender, or delivery claim.
 * One transaction per bounded batch; a separate receipt prevents skipped
 * events from starving later orders. Dispatch must independently recheck
 * consent and current order state before sending any staged item. */
export async function stageOrderSmsBatch(db:PrismaClient,options:{
 enabled:boolean;keyHex:string;take?:number;now?:Date;
}){
 const {enabled,keyHex,take=50,now=new Date()}=options;
 if(!enabled)return {disabled:true,scanned:0,queued:0,busy:false};
 if(!/^[a-f0-9]{64}$/i.test(keyHex))throw Error("Message staging key not configured.");
 if(!Number.isInteger(take)||take<1||take>100||!Number.isFinite(now.getTime()))throw Error("Invalid staging batch.");
 return db.$transaction(async tx=>{
  const locks=await tx.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(20261125,49) AS locked`;
  if(!locks[0]?.locked)return {disabled:false,scanned:0,queued:0,busy:true};
  const events=await tx.outboxEvent.findMany({where:{
    type:{in:[...smsStageEvents]},smsStageReceipt:{is:null},createdAt:{lte:now},
  },select:{id:true,type:true,aggregateId:true,createdAt:true,payload:true},orderBy:[{createdAt:"asc"},{id:"asc"}],take});
  let queued=0;
  for(const event of events){
   let outcome:"queued"|"ineligible"|"expired"="ineligible";
   if(now.getTime()-event.createdAt.getTime()>maxAgeMs)outcome="expired";
   else{
    // Order-first locking is shared with checkout/fulfilment. A future
    // revocation endpoint must follow the same lock order.
    const resolved=await resolveSmsOrder(tx,event,now);
    const order=resolved?await tx.order.findUnique({where:{id:resolved.orderId},select:{id:true,reference:true,customerPhone:true,smsConsent:true}}):null;
    const plan=order&&resolved?planOrderSms({event:{...event,type:resolved.template??event.type,aggregateId:resolved.orderId},order,enabled,evaluatedAt:now,paymentConfirmed:resolved.paymentConfirmed,deliveryConfirmed:resolved.deliveryConfirmed}):null;
    if(plan&&order){
     const result=await tx.customerMessageDelivery.createMany({data:[{...plan,recipientEncrypted:encryptCustomerDestination(order.customerPhone,keyHex)}],skipDuplicates:true});
     queued+=result.count;
     outcome="queued";
    }
   }
   await tx.orderSmsStageReceipt.create({data:{sourceEventId:event.id,outcome,processedAt:now}});
  }
  return {disabled:false,scanned:events.length,queued,busy:false};
 },{timeout:15000});
}
