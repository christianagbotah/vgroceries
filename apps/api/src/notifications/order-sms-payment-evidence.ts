import type {Prisma} from "@prisma/client";
import {deliverySmsEvents,resolveSmsDelivery} from "./order-sms-delivery-evidence";
import {resolveSmsRefund} from "./order-sms-refund-evidence";

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

/** Resolve attempt-owned payment events via persisted relations, not a
 * customer identifier from the payload. Preserve the order-first lock
 * sequence used by PaymentOutcomeService. */
export async function resolveSmsOrder(tx:Prisma.TransactionClient,event:PaymentEvent,evaluatedAt:Date):Promise<{orderId:string;paymentConfirmed?:true;deliveryConfirmed?:true;refundAmountMinor?:number;template?:"delivery.delivered"|"delivery.out_for_delivery"}|null>{
 if(deliverySmsEvents.includes(event.type as typeof deliverySmsEvents[number]))return resolveSmsDelivery(tx,event,evaluatedAt);
 if(event.type==="refund.succeeded")return resolveSmsRefund(tx,event,evaluatedAt);
 if(event.type==="fulfilment.handed_over"&&(!event.payload||typeof event.payload!=="object"||Array.isArray(event.payload)||(event.payload as Record<string,unknown>).toStatus!=="collected"))return null;
 if(event.type!=="payment.succeeded"){
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${event.aggregateId} FOR UPDATE`;
  return {orderId:event.aggregateId};
 }
 const seed=await tx.paymentAttempt.findUnique({where:{id:event.aggregateId},select:{orderId:true}});
 if(!seed)return null;
 await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${seed.orderId} FOR UPDATE`;
 await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE id=${event.aggregateId} FOR UPDATE`;
 const attempt=await tx.paymentAttempt.findUnique({where:{id:event.aggregateId}});
 const order=await tx.order.findUnique({where:{id:seed.orderId},select:{id:true,paymentStatus:true,totalMinor:true,cancelledAt:true,fulfilmentStatus:true}});
 if(!confirmedSmsPayment(event,attempt,order,evaluatedAt)||!order)return null;
 return {orderId:order.id,paymentConfirmed:true as const};
}
