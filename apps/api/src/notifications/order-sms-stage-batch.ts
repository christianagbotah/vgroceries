import type {PrismaClient} from "@prisma/client";
import {encryptCustomerDestination} from "./customer-message-crypto";
import {orderSmsStageEvents,planOrderSms} from "./order-sms-staging-policy";

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
    type:{in:[...orderSmsStageEvents]},smsStageReceipt:{is:null},createdAt:{lte:now},
  },select:{id:true,type:true,aggregateId:true,createdAt:true},orderBy:[{createdAt:"asc"},{id:"asc"}],take});
  let queued=0;
  for(const event of events){
   let outcome:"queued"|"ineligible"|"expired"="ineligible";
   if(now.getTime()-event.createdAt.getTime()>maxAgeMs)outcome="expired";
   else{
    // Order-first locking is shared with checkout/fulfilment. A future
    // revocation endpoint must follow the same lock order.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${event.aggregateId} FOR UPDATE`;
    const order=await tx.order.findUnique({where:{id:event.aggregateId},select:{id:true,reference:true,customerPhone:true,smsConsent:true}});
    const plan=order?planOrderSms({event,order,enabled,evaluatedAt:now}):null;
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
