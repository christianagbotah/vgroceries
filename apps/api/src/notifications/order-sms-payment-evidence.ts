import type {Prisma} from "@prisma/client";
import {deliverySmsEvents,resolveSmsDelivery} from "./order-sms-delivery-evidence";
import {resolveSmsRefund} from "./order-sms-refund-evidence";

export const paymentStatusSmsEvents=["payment.initiation_pending","payment.initiation_uncertain","payment.initiation_failed","payment.failed","payment.expired","payment.requires_review"] as const;
export const paymentStatusTemplates=["payment.pending","payment.failed","payment.expired","payment.requires_review"] as const;
type PaymentStatusTemplate=typeof paymentStatusTemplates[number];
type PaymentEvent={type:string;aggregateId:string;payload:unknown;createdAt:Date};
type Attempt={id:string;orderId:string;status:string;initiationState:string;settlementState:string;currency:string;amountMinor:number;resolvedAt:Date|null};
type Order={id:string;paymentStatus:string;totalMinor:number;cancelledAt:Date|null;fulfilmentStatus:string};
export function confirmedSmsPayment(event:PaymentEvent,attempt:Attempt|null,order:Order|null,evaluatedAt:Date):boolean{
 if(event.type!=="payment.succeeded"||!attempt||!order||!event.payload||typeof event.payload!=="object"||Array.isArray(event.payload))return false;
 const payload=event.payload as Record<string,unknown>;
 return payload.coverage==="confirmed"&&payload.attemptId===event.aggregateId&&attempt.id===event.aggregateId&&
  payload.orderId===order.id&&attempt.orderId===order.id&&attempt.status==="succeeded"&&
  attempt.initiationState==="accepted"&&["unsettled","reconciled"].includes(attempt.settlementState)&&
  attempt.currency==="GHS"&&Number.isSafeInteger(attempt.amountMinor)&&attempt.amountMinor>0&&attempt.amountMinor===order.totalMinor&&
  !!attempt.resolvedAt&&Number.isFinite(event.createdAt.getTime())&&
  event.createdAt.getTime()<=evaluatedAt.getTime()&&attempt.resolvedAt.getTime()<=evaluatedAt.getTime()&&
  order.paymentStatus==="succeeded"&&!order.cancelledAt&&order.fulfilmentStatus!=="cancelled";
}

/** Status-only messages require a committed matching attempt and current order.
 * Never infer payment receipt from a pending, failed or exceptional attempt. */
export function confirmedPaymentStatus(event:PaymentEvent,attempt:Attempt|null,order:Order|null,latestAttemptId:string|null,now:Date):PaymentStatusTemplate|null {
 if(!paymentStatusSmsEvents.includes(event.type as typeof paymentStatusSmsEvents[number])||!attempt||!order||!event.payload||typeof event.payload!=="object"||Array.isArray(event.payload))return null;
 const payload=event.payload as Record<string,unknown>;
 if(payload.attemptId!==event.aggregateId||attempt.id!==event.aggregateId||payload.orderId!==order.id||attempt.orderId!==order.id||
    attempt.currency!=="GHS"||!Number.isSafeInteger(attempt.amountMinor)||attempt.amountMinor<=0||attempt.amountMinor!==order.totalMinor||
    !Number.isFinite(now.getTime())||!Number.isFinite(event.createdAt.getTime())||event.createdAt>now)return null;
 if(event.type==="payment.requires_review")return order.paymentStatus==="requires_review"&&attempt.settlementState==="exception"?"payment.requires_review":null;
 if(order.cancelledAt||order.fulfilmentStatus==="cancelled"||latestAttemptId!==attempt.id)return null;
 // A provider initiation timeout can leave the order pending while the attempt
 // is uncertain. Never interpret that as success or authorize another payment.
 if(event.type==="payment.initiation_uncertain")return ["pending","requires_review"].includes(order.paymentStatus)&&["initiated","pending"].includes(attempt.status)&&attempt.initiationState==="uncertain"&&attempt.settlementState==="exception"&&!attempt.resolvedAt?"payment.requires_review":null;
 if(attempt.settlementState!=="unsettled")return null;
 if(event.type==="payment.initiation_pending")return order.paymentStatus==="pending"&&attempt.status==="pending"&&attempt.initiationState==="accepted"&&!attempt.resolvedAt?"payment.pending":null;
 const expired=event.type==="payment.expired";
 const status=expired?"expired":"failed";
 if(order.paymentStatus!==status||attempt.status!==status||!attempt.resolvedAt||!Number.isFinite(attempt.resolvedAt.getTime())||attempt.resolvedAt>now)return null;
 if(!expired&&attempt.initiationState!=="rejected")return null;
 return expired?"payment.expired":"payment.failed";
}

/** Resolve attempt-owned payment events via persisted relations, not a
 * customer identifier from the payload. Preserve the order-first lock
 * sequence used by PaymentOutcomeService. */
export async function resolveSmsOrder(tx:Prisma.TransactionClient,event:PaymentEvent,evaluatedAt:Date):Promise<{orderId:string;paymentConfirmed?:true;deliveryConfirmed?:true;refundAmountMinor?:number;template?:"delivery.delivered"|"delivery.out_for_delivery"|"delivery.failed"|"order.cancelled"|PaymentStatusTemplate}|null>{
 if(deliverySmsEvents.includes(event.type as typeof deliverySmsEvents[number]))return resolveSmsDelivery(tx,event,evaluatedAt);
 if(event.type==="refund.succeeded")return resolveSmsRefund(tx,event,evaluatedAt);
 if(event.type==="order.cancelled_with_refund"){
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${event.aggregateId} FOR UPDATE`;
  const order=await tx.order.findUnique({where:{id:event.aggregateId},select:{id:true,fulfilmentStatus:true,cancelledAt:true}});
  return order?.fulfilmentStatus==="cancelled"&&order.cancelledAt?{orderId:order.id,template:"order.cancelled" as const}:null;
 }
 if(event.type==="fulfilment.handed_over"&&(!event.payload||typeof event.payload!=="object"||Array.isArray(event.payload)||(event.payload as Record<string,unknown>).toStatus!=="collected"))return null;
 const isPaymentStatus=paymentStatusSmsEvents.includes(event.type as typeof paymentStatusSmsEvents[number]);
 if(event.type!=="payment.succeeded"&&!isPaymentStatus){
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${event.aggregateId} FOR UPDATE`;
  return {orderId:event.aggregateId};
 }
 const seed=await tx.paymentAttempt.findUnique({where:{id:event.aggregateId},select:{orderId:true}});
 if(!seed)return null;
 await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${seed.orderId} FOR UPDATE`;
 await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE "orderId"=${seed.orderId} ORDER BY id FOR UPDATE`;
 const attempt=await tx.paymentAttempt.findUnique({where:{id:event.aggregateId}});
 const order=await tx.order.findUnique({where:{id:seed.orderId},select:{id:true,paymentStatus:true,totalMinor:true,cancelledAt:true,fulfilmentStatus:true}});
 if(isPaymentStatus){
  const latest=await tx.paymentAttempt.findFirst({where:{orderId:seed.orderId},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true}});
  const template=confirmedPaymentStatus(event,attempt,order,latest?.id??null,evaluatedAt);
  return template&&order?{orderId:order.id,paymentConfirmed:true as const,template}:null;
 }
 if(!confirmedSmsPayment(event,attempt,order,evaluatedAt)||!order)return null;
 return {orderId:order.id,paymentConfirmed:true as const};
}
