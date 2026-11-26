import type {Prisma} from "@prisma/client";

export const deliverySmsEvents=["delivery.out_for_delivery","delivery.delivered","delivery.provider_out_for_delivery","delivery.provider_delivered"] as const;
type Source={type:string;aggregateId:string;payload:unknown;createdAt:Date};
type Job={id:string;orderId:string;status:string;custodyState:string;assignmentKind:string;outForDeliveryAt:Date|null;deliveredAt:Date|null;proof:{method:string;reference:string|null;recordedAt:Date}|null};
type Order={id:string;fulfilment:string;fulfilmentStatus:string;deliveryStatus:string;cancelledAt:Date|null};
type Transition={deliveryJobId:string;orderId:string;action:string;toStatus:string|null;requestId:string;createdAt:Date};
export function confirmedSmsDelivery(source:Source,job:Job|null,order:Order|null,transition:Transition|null,now:Date){
 if(!deliverySmsEvents.includes(source.type as typeof deliverySmsEvents[number])||!job||!order||!transition||!source.payload||typeof source.payload!=="object"||Array.isArray(source.payload))return null;
 const payload=source.payload as Record<string,unknown>;
 const action=source.type.slice("delivery.".length);
 const delivered=action.endsWith("delivered");
 const status=delivered?"delivered":"out_for_delivery";
 const manual=action.startsWith("provider_");
 if(order.id!==source.aggregateId||job.orderId!==order.id||payload.deliveryJobId!==job.id||
    payload.requestId!==transition.requestId||transition.deliveryJobId!==job.id||transition.orderId!==order.id||
    transition.action!==action||transition.toStatus!==status||payload.toStatus!==status||
    transition.createdAt.getTime()!==source.createdAt.getTime()||source.createdAt.getTime()>now.getTime()||
    order.fulfilment!=="delivery"||order.cancelledAt||order.fulfilmentStatus==="cancelled"||
    order.deliveryStatus!==status||job.status!==status||(manual!==(job.assignmentKind==="manual_provider")))return null;
 if(delivered){
  if(order.fulfilmentStatus!=="delivered"||job.custodyState!=="customer"||!job.deliveredAt||job.deliveredAt.getTime()>now.getTime()||
     !job.proof||!["signature","photo_note"].includes(job.proof.method)||!job.proof.reference?.trim()||
     job.proof.recordedAt.getTime()!==job.deliveredAt.getTime())return null;
  return "delivery.delivered" as const;
 }
 if(order.fulfilmentStatus!=="dispatched"||job.custodyState!==(manual?"provider":"rider")||!job.outForDeliveryAt||job.outForDeliveryAt.getTime()>now.getTime())return null;
 return "delivery.out_for_delivery" as const;
}

export async function resolveSmsDelivery(tx:Prisma.TransactionClient,source:Source,now:Date){
 await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${source.aggregateId} FOR UPDATE`;
 const order=await tx.order.findUnique({where:{id:source.aggregateId},select:{id:true,fulfilment:true,fulfilmentStatus:true,deliveryStatus:true,cancelledAt:true}});
 if(!order)return null;
 const job=await tx.deliveryJob.findUnique({where:{orderId:order.id},include:{proof:true}});
 if(!job)return null;
 const actions=source.type.endsWith("delivered")?["delivered","provider_delivered"]:["out_for_delivery","provider_out_for_delivery"];
 // Only the latest authoritative transition may be notified, including retries.
 const transition=await tx.deliveryEvent.findFirst({where:{deliveryJobId:job.id,action:{in:actions}},orderBy:[{createdAt:"desc"},{id:"desc"}]});
 const template=confirmedSmsDelivery(source,job,order,transition,now);
 return template?{orderId:order.id,deliveryConfirmed:true as const,template}:null;
}
