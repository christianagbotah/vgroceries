import type {Prisma} from "@prisma/client";

type RefundEvent={type:string;aggregateId:string;payload:unknown;createdAt:Date};
type Capture={id:string;orderId:string;provider:string;method:string;currency:string;status:string;amountMinor:number};
type Execution={refundId:string;provider:string;method:string;currency:string;amountMinor:number;status:string;reconciliationState:string;resolvedAt:Date|null};
type Refund={id:string;orderId:string;paymentAttemptId:string;provider:string;method:string;currency:string;amountMinor:number;status:string;resolvedAt:Date|null;execution:Execution|null;paymentAttempt:Capture};

/** Notify only a reconciled, successful refund with a matching successful capture. */
export function confirmedSmsRefund(event:RefundEvent,refund:Refund|null,orderId:string,now:Date):number|null{
 if(event.type!=="refund.succeeded"||!refund||!event.payload||typeof event.payload!=="object"||Array.isArray(event.payload))return null;
 const payload=event.payload as Record<string,unknown>, e=refund.execution, a=refund.paymentAttempt;
 if(!e||!a||event.aggregateId!==refund.id||payload.refundId!==refund.id||payload.orderId!==orderId||refund.orderId!==orderId||
   refund.status!=="succeeded"||e.refundId!==refund.id||e.status!=="succeeded"||e.reconciliationState!=="reconciled"||
   refund.currency!=="GHS"||e.currency!==refund.currency||e.provider!==refund.provider||e.method!==refund.method||e.amountMinor!==refund.amountMinor||
   a.id!==refund.paymentAttemptId||a.orderId!==orderId||a.status!=="succeeded"||a.provider!==refund.provider||a.method!==refund.method||a.currency!==refund.currency||
   !Number.isSafeInteger(refund.amountMinor)||refund.amountMinor<=0||!Number.isSafeInteger(a.amountMinor)||refund.amountMinor>a.amountMinor||
   !refund.resolvedAt||!e.resolvedAt||![event.createdAt,refund.resolvedAt,e.resolvedAt,now].every(d=>Number.isFinite(d.getTime()))||
   event.createdAt>now||refund.resolvedAt>now||e.resolvedAt>now)return null;
 return refund.amountMinor;
}

/** Same order-first lock as refund outcome; recheck durable truth both at staging and dispatch. */
export async function resolveSmsRefund(tx:Prisma.TransactionClient,event:RefundEvent,now:Date){
 const seed=await tx.refund.findUnique({where:{id:event.aggregateId},select:{orderId:true}});
 if(!seed)return null;
 await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${seed.orderId} FOR UPDATE`;
 const refund=await tx.refund.findUnique({where:{id:event.aggregateId},include:{execution:true,paymentAttempt:true}});
 const amount=confirmedSmsRefund(event,refund,seed.orderId,now);
 return amount===null?null:{orderId:seed.orderId,refundAmountMinor:amount};
}
