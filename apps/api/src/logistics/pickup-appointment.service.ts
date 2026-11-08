import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  pickupAppointmentOptionsSchema,
  pickupAppointmentPolicyInputSchema,
  pickupAppointmentPolicyViewSchema,
  pickupAppointmentMutationResponseSchema,
  type PickupAppointmentPolicyInput, type PickupAppointmentOptions,
  type PickupAppointmentMutationResponse, type PickupAppointmentView,
} from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import type { CheckoutPrincipal } from "../commerce-identity/checkout-principal.service";
import { logisticsCommandHash } from "./logistics.values";

type Tx=Prisma.TransactionClient;
type Policy={
  nodeId:string;active:boolean;serviceDays:number[];opensAt:string;closesAt:string;
  slotMinutes:number;capacity:number;minLeadMinutes:number;maxDaysAhead:number;
};
const MINUTE=60_000;
function minutes(value:string) {return Number(value.slice(0,2))*60+Number(value.slice(3,5));}
function policyView(row:{nodeId:string;active:boolean;serviceDays:number[];opensAt:string;closesAt:string;
  slotMinutes:number;capacity:number;minLeadMinutes:number;maxDaysAhead:number;updatedAt:Date}) {
  return pickupAppointmentPolicyViewSchema.parse({
    nodeId:row.nodeId,active:row.active,serviceDays:row.serviceDays,
    opensAt:row.opensAt,closesAt:row.closesAt,slotMinutes:row.slotMinutes,
    capacity:row.capacity,minLeadMinutes:row.minLeadMinutes,
    maxDaysAhead:row.maxDaysAhead,updatedAt:row.updatedAt.toISOString(),
  });
}
function view(a:{startsAt:Date;endsAt:Date;status:string;updatedAt:Date}):PickupAppointmentView {
  return {startsAt:a.startsAt.toISOString(),endsAt:a.endsAt.toISOString(),
    status:a.status as PickupAppointmentView["status"],updatedAt:a.updatedAt.toISOString()};
}
/** Africa/Accra uses UTC without daylight-saving changes; all times are unambiguous UTC instants. */
export function candidatePickupSlots(policy:Policy,now=new Date()) {
  if(!policy.active) return [];
  const day=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  const earliest=now.getTime()+policy.minLeadMinutes*MINUTE;
  const results:{startsAt:Date;endsAt:Date}[]=[];
  const open=minutes(policy.opensAt),close=minutes(policy.closesAt);
  for(let offset=0;offset<policy.maxDaysAhead;offset++){
    const date=new Date(day.getTime()+offset*86400_000);
    const weekday=date.getUTCDay()||7;
    if(!policy.serviceDays.includes(weekday))continue;
    for(let t=open;t+policy.slotMinutes<=close;t+=policy.slotMinutes){
      const startsAt=new Date(date.getTime()+t*MINUTE);
      if(startsAt.getTime()<earliest)continue;
      const endsAt=new Date(startsAt.getTime()+policy.slotMinutes*MINUTE);
      results.push({startsAt,endsAt});
      if(results.length>=400)return results;
    }
  }
  return results;
}

@Injectable()
export class PickupAppointmentService {
  constructor(private readonly db:Database,@Inject(API_CONFIG) private readonly config:ApiConfig){}
  private gates() {return this.config.customerPickupEnabled&&this.config.shipmentExecutionEnabled;}
  private owned(o:{customerUserId:string|null;guestSessionId:string|null},principal:CheckoutPrincipal) {
    return principal.kind==="customer" ? o.customerUserId===principal.userId : o.guestSessionId===principal.guestSessionId;
  }
  private failed(message:string,code="PICKUP_APPOINTMENT_UNAVAILABLE"):never {
    throw new ApiProblem(422,code,message);
  }
  private async evidence(tx:Tx,orderId:string,principal:CheckoutPrincipal) {
    const o=await tx.order.findUnique({where:{id:orderId},include:{
      pickupSnapshot:true,pickupAppointment:true,
      shipments:{where:{sequence:1},take:1},refunds:{select:{status:true}},
    }});
    if(!o||!this.owned(o,principal))throw new ApiProblem(404,"NOT_FOUND","Order not found.");
    const shipment=o.shipments[0];
    const policy=o.pickupSnapshot?await tx.pickupAppointmentPolicy.findUnique({where:{nodeId:o.pickupSnapshot.nodeId},
      include:{node:{select:{active:true,customerVisible:true,kind:true}}}}):null;
    const ready=!!(this.gates()&&o.pickupSnapshot&&policy?.active&&policy.node.active&&policy.node.customerVisible&&
      policy.node.kind==="pickup_point"&&shipment?.destinationKind==="pickup_point"&&
      shipment.finalPickupNodeId===o.pickupSnapshot.nodeId&&shipment.currentNodeId===o.pickupSnapshot.nodeId&&
      shipment.status==="ready_for_pickup"&&!shipment.completedAt&&!shipment.currentLegId&&
      o.paymentStatus==="succeeded"&&!o.cancelledAt&&o.fulfilmentStatus==="dispatched"&&
      !o.refunds.some(r=>["awaiting_approval","approved","processing","requires_review","succeeded"].includes(r.status)));
    return {o,policy,ready};
  }
  async policy(nodeId:string){
    const row=await this.db.pickupAppointmentPolicy.findUnique({where:{nodeId}});
    return row?policyView(row):null;
  }
  async savePolicy(nodeId:string,actorId:string,key:string,raw:unknown,requestId:string){
    const parsed=pickupAppointmentPolicyInputSchema.safeParse(raw);
    if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Invalid collection appointment policy.",parsed.error.issues);
    const input:PickupAppointmentPolicyInput=parsed.data;
    const operation=`pickup.appointment.policy:${nodeId}`;
    const hash=logisticsCommandHash({nodeId,...input});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId,operation,key])},0))`;
      const previous=await tx.idempotency.findUnique({where:{actorId_operation_key:{actorId,operation,key}}});
      if(previous){
        if(previous.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","Policy idempotency key was reused.");
        return pickupAppointmentPolicyViewSchema.parse(previous.outcome);
      }
      const node=await tx.logisticsNode.findUnique({where:{id:nodeId},select:{kind:true}});
      if(!node||node.kind!=="pickup_point")this.failed("Appointment schedules are only available for configured pickup centres.");
      const row=await tx.pickupAppointmentPolicy.upsert({where:{nodeId},
        create:{nodeId,...input,updatedBy:actorId},
        update:{...input,updatedBy:actorId}});
      const result=policyView(row);
      await tx.auditEvent.create({data:{actorId,action:"pickup.appointment.policy_saved",entityId:nodeId,requestId,
        details:{active:input.active,capacity:input.capacity,slotMinutes:input.slotMinutes,serviceDays:input.serviceDays}}});
      await tx.outboxEvent.create({data:{type:"pickup.appointment.policy_saved",aggregateId:nodeId,
        payload:{nodeId,active:input.active}}});
      await tx.idempotency.create({data:{actorId,operation,key,requestHash:hash,outcome:result}});
      return result;
    },{timeout:15000});
  }
  async options(orderId:string,principal:CheckoutPrincipal,now=new Date()):Promise<PickupAppointmentOptions>{
    const {o,policy,ready}=await this.evidence(this.db as Tx,orderId,principal);
    const appointment=o.pickupAppointment?view(o.pickupAppointment):null;
    if(!ready||!policy)return pickupAppointmentOptionsSchema.parse({
      enabled:false,ready:false,timezone:"Africa/Accra",slots:[],appointment,
    });
    const windows=candidatePickupSlots(policy,now);
    if(!windows.length)return pickupAppointmentOptionsSchema.parse({
      enabled:true,ready:true,timezone:"Africa/Accra",slots:[],appointment,
    });
    const booked=await this.db.pickupAppointment.groupBy({
      by:["startsAt"],where:{nodeId:policy.nodeId,status:"booked",
        startsAt:{gte:windows[0].startsAt,lte:windows[windows.length-1].startsAt}},
      _count:{_all:true},
    });
    const counts=new Map(booked.map(row=>[row.startsAt.getTime(),row._count._all]));
    return pickupAppointmentOptionsSchema.parse({enabled:true,ready:true,timezone:"Africa/Accra",
      slots:windows.map(w=>({...w,startsAt:w.startsAt.toISOString(),endsAt:w.endsAt.toISOString(),
        available:Math.max(0,policy.capacity-(counts.get(w.startsAt.getTime())??0)),capacity:policy.capacity})),
      appointment});
  }
  async change(orderId:string,principal:CheckoutPrincipal,key:string,
    command:{kind:"book";startsAt:string}|{kind:"cancel"},requestId:string):Promise<PickupAppointmentMutationResponse>{
    if(!this.gates())throw new ApiProblem(503,"UNAVAILABLE","Remote customer pickup is not enabled.");
    const operation=`pickup.appointment.${command.kind}:${orderId}`;
    const hash=logisticsCommandHash({orderId,...command});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([principal.actorScope,operation,key])},0))`;
      const prev=await tx.idempotency.findUnique({where:{actorId_operation_key:{
        actorId:principal.actorScope,operation,key}}});
      if(prev){
        if(prev.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","Idempotency key used with different appointment input.");
        return pickupAppointmentMutationResponseSchema.parse(prev.outcome);
      }
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${orderId} FOR UPDATE`;
      const {o,policy,ready}=await this.evidence(tx,orderId,principal);
      if(!policy||!o.pickupSnapshot||(command.kind==="book"&&!ready))
        this.failed("Collection appointments can be booked only after the paid parcel is recorded ready at the centre.");
      if(command.kind==="cancel"&&o.pickupAppointment?.status!=="booked")
        this.failed("There is no active appointment to cancel.");
      let result:PickupAppointmentView;
      const at=new Date();
      if(command.kind==="book"){
        // Lock policy to prevent admin changes to capacity/hours during reservation.
        await tx.$queryRaw`SELECT "nodeId" FROM "PickupAppointmentPolicy" WHERE "nodeId"=${policy.nodeId} FOR SHARE`;
        const refreshed=await tx.pickupAppointmentPolicy.findUniqueOrThrow({where:{nodeId:policy.nodeId}});
        const start=new Date(command.startsAt);
        const available=candidatePickupSlots(refreshed,at).find(slot=>slot.startsAt.getTime()===start.getTime());
        if(!available)this.failed("The requested collection appointment is no longer within opening hours.");
        // Order lock first, then a node+slot advisory lock. Concurrent customer
        // transactions cannot oversell capacity, even on separate API instances.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["pickup-slot",policy.nodeId,available.startsAt.toISOString()])},0))`;
        const old=o.pickupAppointment;
        const count=await tx.pickupAppointment.count({where:{nodeId:policy.nodeId,status:"booked",
          startsAt:available.startsAt,orderId:{not:orderId}}});
        if(count>=refreshed.capacity)this.failed("This pickup appointment has just filled. Choose another time.","PICKUP_SLOT_FULL");
        if(old?.status==="completed")this.failed("A completed collection appointment cannot be changed.");
        const row=await tx.pickupAppointment.upsert({where:{orderId},
          create:{orderId,nodeId:policy.nodeId,startsAt:available.startsAt,endsAt:available.endsAt,status:"booked",bookedAt:at},
          update:{startsAt:available.startsAt,endsAt:available.endsAt,status:"booked",
            bookedAt:at,completedAt:null}});
        result=view(row);
      }else{
        const row=await tx.pickupAppointment.update({where:{orderId},
          data:{status:"cancelled",completedAt:null}});
        result=view(row);
      }
      const action=command.kind==="book"?"pickup.appointment_booked":"pickup.appointment_cancelled";
      await tx.orderEvent.create({data:{orderId,actorKind:principal.kind,actorId:principal.actorId,action,
        note:command.kind==="book"?`Appointment: ${result.startsAt}`:null,customerSafe:true}});
      await tx.auditEvent.create({data:{actorId:principal.actorId,action,entityId:orderId,requestId,
        details:{startsAt:result.startsAt,endsAt:result.endsAt,nodeId:policy.nodeId,status:result.status}}});
      await tx.outboxEvent.create({data:{type:action,aggregateId:orderId,
        payload:{orderId,nodeId:policy.nodeId,status:result.status}}});
      const outcome=pickupAppointmentMutationResponseSchema.parse({appointment:result});
      await tx.idempotency.create({data:{actorId:principal.actorScope,operation,key,requestHash:hash,outcome}});
      return outcome;
    },{timeout:15000});
  }
}
