import { Injectable } from "@nestjs/common";
import type { PublicOrder } from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
const money=(minor:number)=>`₵${(minor/100).toFixed(2)}`;
@Injectable()
export class OrderProjectionService {
  constructor(private readonly db:Database) {}
  async publicOrder(orderId:string):Promise<PublicOrder>{
    const o=await this.db.order.findUnique({where:{id:orderId},include:{lines:{orderBy:{id:"asc"}},events:{where:{customerSafe:true},orderBy:{createdAt:"asc"}},slot:true}});
    if(!o)throw new ApiProblem(404,"NOT_FOUND","Order not found.");
    return {id:o.id,reference:o.reference,channel:o.channel as "online"|"pos",customerName:o.customerName,customerPhone:o.customerPhone,fulfilment:o.fulfilment as PublicOrder["fulfilment"],...(o.slot?{slotLabel:`${o.slot.startsAt.toISOString().slice(0,10)} ${o.slot.startsAt.toISOString().slice(11,16)}–${o.slot.endsAt.toISOString().slice(11,16)}`}:{ }),createdAt:o.createdAt.toISOString(),createdAtLabel:o.createdAt.toISOString(),subtotalMinor:o.subtotalMinor,discountMinor:o.discountMinor,deliveryFeeMinor:o.deliveryFeeMinor,totalMinor:o.totalMinor,totalLabel:money(o.totalMinor),paymentMethod:o.paymentMethod as PublicOrder["paymentMethod"],paymentStatus:o.paymentStatus as PublicOrder["paymentStatus"],fulfilmentStatus:o.fulfilmentStatus as PublicOrder["fulfilmentStatus"],deliveryStatus:o.deliveryStatus as PublicOrder["deliveryStatus"],paymentAttempts:[],lines:o.lines.map(l=>({id:l.id,productId:l.productId,variantId:l.variantId,productName:l.productName,variantName:l.variantName,unit:l.unit,quantity:l.quantity.toString(),unitPriceMinor:l.unitPriceMinor,unitPriceLabel:money(l.unitPriceMinor),lineTotalMinor:l.lineTotalMinor,lineTotalLabel:money(l.lineTotalMinor),allocations:[]})),notes:[],events:o.events.map(e=>({at:e.createdAt.toISOString(),atLabel:e.createdAt.toISOString(),actor:e.actorKind,action:e.action,...(e.fromStatus?{fromStatus:e.fromStatus}:{}),...(e.toStatus?{toStatus:e.toStatus}:{}),...(e.note?{note:e.note}:{})})),returns:[],...(o.stockConsumedAt?{stockConsumedAt:o.stockConsumedAt.toISOString()}:{})};
  }
}
