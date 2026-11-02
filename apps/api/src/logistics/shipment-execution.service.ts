import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  shipmentActionResponseSchema, shipmentArriveRequestSchema, shipmentCheckpointRequestSchema, shipmentDepartRequestSchema, shipmentRerouteRequestSchema,
  type ShipmentActionResponse, type ShipmentArriveRequest, type ShipmentCheckpointRequest, type ShipmentDepartRequest, type ShipmentRerouteRequest,
} from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { logisticsCommandHash } from "./logistics.values";
import { ShipmentPlanningService } from "./shipment-planning.service";

type Tx = Prisma.TransactionClient;

type HandoverActivationInput = {
  orderId: string;
  actorId: string;
  requestId: string;
};

function rule(message: string, code = "SHIPMENT_INVALID_STATE"): never {
  throw new ApiProblem(422, code, message);
}

@Injectable()
export class ShipmentExecutionService {
  constructor(private readonly db: Database, @Inject(API_CONFIG) private readonly config: ApiConfig, private readonly planning: ShipmentPlanningService) {}

  private assertEnabled() {
    if (!this.config.shipmentExecutionEnabled) throw new ApiProblem(503, "UNAVAILABLE", "Shipment route execution is not enabled.");
  }

  private action(shipment: { id:string; orderId:string; status:string; custody:string|null; currentNodeId:string|null; currentLegId:string|null; routeRevision:number }): ShipmentActionResponse {
    const allowedActions = shipment.status === "at_node" ? ["depart","reroute","checkpoint"]
      : shipment.status === "in_transit" ? ["arrive","checkpoint"]
      : ["checkpoint"];
    return shipmentActionResponseSchema.parse({ shipmentId: shipment.id, orderId: shipment.orderId, status: shipment.status, custody: shipment.custody, currentNodeId: shipment.currentNodeId, currentLegId: shipment.currentLegId, routeRevision: shipment.routeRevision, allowedActions, blockers: [] });
  }

  private parse<T>(schema: { safeParse(input: unknown): any }, raw: unknown, message: string): T {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ApiProblem(400, "VALIDATION_FAILED", message, parsed.error.issues.map((issue:any)=>({ path: issue.path.map(String).join("."), message: issue.message })));
    return parsed.data as T;
  }

  private async replayOrLock(tx: Tx, actorId:string, operation:string, key:string, requestHash:string): Promise<ShipmentActionResponse|null> {
    const lockKey=JSON.stringify([actorId,operation,key]);
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${lockKey},0))`;
    const replay=await tx.idempotency.findUnique({where:{actorId_operation_key:{actorId,operation,key}}});
    if(!replay) return null;
    if(replay.requestHash!==requestHash) throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","Idempotency key already belongs to another shipment command.");
    const parsed=shipmentActionResponseSchema.safeParse(replay.outcome);
    if(!parsed.success) throw new ApiProblem(409,"CONFLICT","Shipment command replay state is incomplete.");
    return parsed.data;
  }

  private async lockShipment(tx:Tx, shipmentId:string) {
    const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Shipment" WHERE id=${shipmentId} FOR UPDATE`;
    if(!locked[0]) throw new ApiProblem(404,"NOT_FOUND","Shipment not found.");
    return tx.shipment.findUniqueOrThrow({where:{id:shipmentId}});
  }

  async activateForHandover(tx: Tx, input: HandoverActivationInput): Promise<void> {
    if (!this.config.shipmentExecutionEnabled) return;

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Shipment"
      WHERE "orderId"=${input.orderId} AND "sequence"=1
      FOR UPDATE
    `;
    if (!locked[0])
      rule("Delivery handover requires a planned shipment snapshot.", "SHIPMENT_NOT_PLANNED");

    const shipment = await tx.shipment.findUnique({
      where: { orderId_sequence: { orderId: input.orderId, sequence: 1 } },
    });
    if (!shipment)
      rule("Delivery handover requires a planned shipment snapshot.", "SHIPMENT_NOT_PLANNED");
    if (
      shipment.status !== "planned" ||
      shipment.activatedAt ||
      shipment.currentNodeId ||
      shipment.currentLegId ||
      shipment.custody
    ) rule("Shipment is not in its pristine planned state for fulfilment handover.");

    const stops = await tx.shipmentStop.findMany({
      where: { shipmentId: shipment.id, routeRevision: shipment.routeRevision },
      orderBy: { position: "asc" },
    });
    const legs = await tx.shipmentLeg.findMany({
      where: { shipmentId: shipment.id, routeRevision: shipment.routeRevision },
      orderBy: { position: "asc" },
    });
    if (!stops.length || stops[0]!.position !== 1 || stops[0]!.nodeId !== shipment.originNodeId)
      rule("Shipment route snapshot does not begin at its configured source node.");

    for (let index = 0; index < stops.length; index++) {
      if (stops[index]!.position !== index + 1)
        rule("Shipment route snapshot stop positions are incomplete.");
    }
    for (let index = 0; index < legs.length; index++) {
      const leg = legs[index]!;
      if (
        leg.position !== index + 1 ||
        leg.status !== "planned" ||
        leg.originStopId !== stops[index]?.id ||
        leg.destinationStopId !== stops[index + 1]?.id
      ) rule("Shipment route snapshot legs are incomplete or already active.");
    }
    if (legs.length !== Math.max(0, stops.length - 1))
      rule("Shipment route snapshot has an invalid stop-to-leg topology.");

    let status: "at_node" | "final_mile_ready" | "ready_for_pickup";
    if (legs.length) {
      status = "at_node";
      await tx.shipmentLeg.update({
        where: { id: legs[0]!.id },
        data: { status: "ready", version: { increment: 1 } },
      });
    } else {
      const terminalRole = stops[0]!.terminalRole;
      if (terminalRole === "final_mile_dispatch") status = "final_mile_ready";
      else if (terminalRole === "customer_pickup") status = "ready_for_pickup";
      else rule("One-stop shipment must terminate at final-mile dispatch or customer pickup.");
    }

    const now = new Date();
    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        status,
        currentNodeId: stops[0]!.nodeId,
        currentLegId: null,
        custody: "source_staff",
        activatedAt: now,
        version: { increment: 1 },
      },
    });
    await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        routeRevision: shipment.routeRevision,
        nodeId: stops[0]!.nodeId,
        eventKind: "fulfilment_handed_over",
        actorKind: "staff",
        actorId: input.actorId,
        fromCustody: null,
        toCustody: "source_staff",
        safeMetadata: { status },
        requestId: input.requestId,
        occurredAt: now,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId,
        action: "logistics.shipment.handed_over",
        entityId: shipment.id,
        requestId: input.requestId,
        details: { orderId: input.orderId, routeRevision: shipment.routeRevision, status, currentNodeId: stops[0]!.nodeId },
      },
    });
    await tx.outboxEvent.create({
      data: {
        type: "logistics.shipment.handed_over",
        aggregateId: shipment.id,
        payload: { shipmentId: shipment.id, orderId: input.orderId, routeRevision: shipment.routeRevision, status, currentNodeId: stops[0]!.nodeId },
      },
    });
  }

  async depart(shipmentId:string, actorId:string, idempotencyKey:string, raw:ShipmentDepartRequest, requestId:string):Promise<ShipmentActionResponse> {
    this.assertEnabled();
    const input=this.parse<ShipmentDepartRequest>(shipmentDepartRequestSchema,raw,"Shipment departure body is invalid.");
    const operation=`logistics.shipment.depart:${shipmentId}`; const requestHash=logisticsCommandHash({shipmentId,...input});
    return this.db.$transaction(async tx=>{
      const replay=await this.replayOrLock(tx,actorId,operation,idempotencyKey,requestHash); if(replay)return replay;
      const shipment=await this.lockShipment(tx,shipmentId);
      if(shipment.status!=="at_node"||!shipment.currentNodeId||shipment.currentLegId) rule("Shipment must be at a node with no active leg before departure.");
      const ready=await tx.shipmentLeg.findMany({where:{shipmentId,routeRevision:shipment.routeRevision,status:"ready"},include:{originStop:true,destinationStop:true},orderBy:{position:"asc"}});
      if(ready.length!==1) rule("Shipment must have exactly one ready next leg before departure.");
      const leg=ready[0]!;
      await tx.$queryRaw`SELECT id FROM "ShipmentLeg" WHERE id=${leg.id} FOR UPDATE`;
      if(leg.originStop.nodeId!==shipment.currentNodeId) rule("Ready shipment leg does not begin at the shipment current node.");
      const custody = ["internal_transfer","linehaul"].includes(leg.mode) ? "linehaul_internal" : ["third_party","last_mile"].includes(leg.mode) ? "provider" : null;
      if(!custody) rule("This shipment leg cannot be executed by linehaul movement authority.");
      const now=new Date(); const slaDeadline=new Date(now.getTime()+leg.typicalMinutes*60_000);
      await tx.shipmentLeg.update({where:{id:leg.id},data:{status:"in_transit",departedAt:now,slaDeadline,version:{increment:1}}});
      const updated=await tx.shipment.update({where:{id:shipmentId},data:{status:"in_transit",currentNodeId:null,currentLegId:leg.id,custody,version:{increment:1}}});
      await tx.shipmentEvent.create({data:{shipmentId,routeRevision:shipment.routeRevision,legId:leg.id,nodeId:leg.originStop.nodeId,eventKind:"shipment_departed",actorKind:"staff",actorId,fromCustody:shipment.custody,toCustody:custody,safeMetadata:{legPosition:leg.position},requestId,occurredAt:now}});
      await tx.auditEvent.create({data:{actorId,action:"logistics.shipment.departed",entityId:shipmentId,requestId,details:{orderId:shipment.orderId,routeRevision:shipment.routeRevision,legId:leg.id,legPosition:leg.position,note:input.note??null}}});
      await tx.outboxEvent.create({data:{type:"logistics.shipment.departed",aggregateId:shipmentId,payload:{shipmentId,orderId:shipment.orderId,routeRevision:shipment.routeRevision,legId:leg.id,legPosition:leg.position}}});
      const outcome=this.action(updated); await tx.idempotency.create({data:{actorId,operation,key:idempotencyKey,requestHash,outcome:outcome as Prisma.InputJsonValue}}); return outcome;
    },{timeout:15_000});
  }

  async arrive(shipmentId:string, actorId:string, idempotencyKey:string, raw:ShipmentArriveRequest, requestId:string):Promise<ShipmentActionResponse> {
    this.assertEnabled();
    const input=this.parse<ShipmentArriveRequest>(shipmentArriveRequestSchema,raw,"Shipment arrival body is invalid.");
    const operation=`logistics.shipment.arrive:${shipmentId}`; const requestHash=logisticsCommandHash({shipmentId,...input});
    return this.db.$transaction(async tx=>{
      const replay=await this.replayOrLock(tx,actorId,operation,idempotencyKey,requestHash); if(replay)return replay;
      const shipment=await this.lockShipment(tx,shipmentId);
      if(shipment.status!=="in_transit"||shipment.currentNodeId||!shipment.currentLegId) rule("Shipment must be in transit on one active leg before arrival.");
      await tx.$queryRaw`SELECT id FROM "ShipmentLeg" WHERE id=${shipment.currentLegId} FOR UPDATE`;
      const leg=await tx.shipmentLeg.findUnique({where:{id:shipment.currentLegId},include:{destinationStop:true}});
      if(!leg||leg.shipmentId!==shipmentId||leg.routeRevision!==shipment.routeRevision||leg.status!=="in_transit"||!leg.departedAt) rule("Shipment active leg is inconsistent with its current route revision.");
      const next=await tx.shipmentLeg.findUnique({where:{shipmentId_routeRevision_position:{shipmentId,routeRevision:shipment.routeRevision,position:leg.position+1}}});
      const now=new Date(); await tx.shipmentLeg.update({where:{id:leg.id},data:{status:"arrived",arrivedAt:now,version:{increment:1}}});
      let status:string;
      if(next){ if(next.status!=="planned") rule("Next shipment leg is not in the expected planned state."); await tx.shipmentLeg.update({where:{id:next.id},data:{status:"ready",version:{increment:1}}}); status="at_node"; }
      else if(leg.destinationStop.terminalRole==="final_mile_dispatch") status="final_mile_ready";
      else if(leg.destinationStop.terminalRole==="customer_pickup") status="ready_for_pickup";
      else rule("Terminal shipment stop does not define a supported handoff authority.");
      const updated=await tx.shipment.update({where:{id:shipmentId},data:{status,currentNodeId:leg.destinationStop.nodeId,currentLegId:null,custody:"node_staff",version:{increment:1}}});
      await tx.shipmentEvent.create({data:{shipmentId,routeRevision:shipment.routeRevision,legId:leg.id,nodeId:leg.destinationStop.nodeId,eventKind:"shipment_arrived",actorKind:"staff",actorId,fromCustody:shipment.custody,toCustody:"node_staff",safeMetadata:{legPosition:leg.position,status},requestId,occurredAt:now}});
      await tx.auditEvent.create({data:{actorId,action:"logistics.shipment.arrived",entityId:shipmentId,requestId,details:{orderId:shipment.orderId,routeRevision:shipment.routeRevision,legId:leg.id,legPosition:leg.position,status,note:input.note??null}}});
      await tx.outboxEvent.create({data:{type:"logistics.shipment.arrived",aggregateId:shipmentId,payload:{shipmentId,orderId:shipment.orderId,routeRevision:shipment.routeRevision,legId:leg.id,legPosition:leg.position,status}}});
      const outcome=this.action(updated); await tx.idempotency.create({data:{actorId,operation,key:idempotencyKey,requestHash,outcome:outcome as Prisma.InputJsonValue}}); return outcome;
    },{timeout:15_000});
  }

  async checkpoint(shipmentId:string, actorId:string, idempotencyKey:string, raw:ShipmentCheckpointRequest, requestId:string):Promise<ShipmentActionResponse> {
    this.assertEnabled();
    const input=this.parse<ShipmentCheckpointRequest>(shipmentCheckpointRequestSchema,raw,"Shipment checkpoint body is invalid.");
    const operation=`logistics.shipment.checkpoint:${shipmentId}`; const requestHash=logisticsCommandHash({shipmentId,...input});
    return this.db.$transaction(async tx=>{
      const replay=await this.replayOrLock(tx,actorId,operation,idempotencyKey,requestHash); if(replay)return replay;
      const shipment=await this.lockShipment(tx,shipmentId);
      if(!shipment.activatedAt||shipment.status==="planned"||shipment.status==="completed") rule("Informational checkpoints require an active, incomplete shipment.");
      const now=new Date(); await tx.shipmentEvent.create({data:{shipmentId,routeRevision:shipment.routeRevision,legId:shipment.currentLegId,nodeId:shipment.currentNodeId,eventKind:"custom_checkpoint",actorKind:"staff",actorId,customerTitle:input.title,customerDetail:input.detail??null,safeMetadata:{},requestId,occurredAt:now}});
      await tx.auditEvent.create({data:{actorId,action:"logistics.shipment.checkpoint",entityId:shipmentId,requestId,details:{orderId:shipment.orderId,routeRevision:shipment.routeRevision,title:input.title}}});
      await tx.outboxEvent.create({data:{type:"logistics.shipment.checkpoint",aggregateId:shipmentId,payload:{shipmentId,orderId:shipment.orderId,routeRevision:shipment.routeRevision,title:input.title}}});
      const outcome=this.action(shipment); await tx.idempotency.create({data:{actorId,operation,key:idempotencyKey,requestHash,outcome:outcome as Prisma.InputJsonValue}}); return outcome;
    },{timeout:15_000});
  }


  async reroute(shipmentId:string, actorId:string, idempotencyKey:string, raw:ShipmentRerouteRequest, requestId:string):Promise<ShipmentActionResponse> {
    this.assertEnabled();
    const input=this.parse<ShipmentRerouteRequest>(shipmentRerouteRequestSchema,raw,"Shipment reroute body is invalid.");
    const operation=`logistics.shipment.reroute:${shipmentId}`; const requestHash=logisticsCommandHash({shipmentId,...input});
    return this.db.$transaction(async tx=>{
      const replay=await this.replayOrLock(tx,actorId,operation,idempotencyKey,requestHash); if(replay)return replay;
      const shipment=await this.lockShipment(tx,shipmentId);
      if(!shipment.activatedAt||shipment.status!=="at_node"||!shipment.currentNodeId||shipment.currentLegId||shipment.completedAt)
        rule("Shipment can be rerouted only while physically at a node with no active leg before completion.");
      await tx.$queryRaw`SELECT id FROM "ShipmentLeg" WHERE "shipmentId"=${shipmentId} AND "routeRevision"=${shipment.routeRevision} ORDER BY position FOR UPDATE`;
      const currentRule=await tx.deliveryRouteRule.findUnique({where:{id:shipment.routeRuleId},select:{serviceLevel:true}});
      if(!currentRule) rule("Shipment current route configuration is unavailable.","LOGISTICS_ROUTE_NOT_CONFIGURED");
      const newRevision=shipment.routeRevision+1;
      const snapshot=await this.planning.snapshotRerouteRevisionInTransaction(tx,{shipmentId,orderId:shipment.orderId,currentNodeId:shipment.currentNodeId,workflowVersionId:shipment.workflowVersionId,destinationKind:shipment.destinationKind,finalPickupNodeId:shipment.finalPickupNodeId,destinationAddress:shipment.destinationAddress,newRevision,serviceLevel:input.serviceLevel===undefined?currentRule.serviceLevel:input.serviceLevel});
      await tx.shipmentLeg.updateMany({where:{shipmentId,routeRevision:shipment.routeRevision,status:{in:["planned","ready"]}},data:{status:"superseded",version:{increment:1}}});
      let status:string;
      if(snapshot.firstLegId){await tx.shipmentLeg.update({where:{id:snapshot.firstLegId},data:{status:"ready",version:{increment:1}}});status="at_node";}
      else if(snapshot.terminalRole==="final_mile_dispatch")status="final_mile_ready";
      else if(snapshot.terminalRole==="customer_pickup")status="ready_for_pickup";
      else rule("Replacement one-stop route has no supported terminal handoff.","LOGISTICS_ROUTE_INVALID");
      const oldRouteRuleId=shipment.routeRuleId,oldRouteRevision=shipment.routeRevision;
      const updated=await tx.shipment.update({where:{id:shipmentId},data:{routeRuleId:snapshot.routeRuleId,routeRevision:newRevision,status,version:{increment:1}}});
      const now=new Date(); const metadata={oldRouteRuleId,newRouteRuleId:snapshot.routeRuleId,oldRouteRevision,newRouteRevision:newRevision};
      await tx.shipmentEvent.create({data:{shipmentId,routeRevision:newRevision,nodeId:shipment.currentNodeId,eventKind:"shipment_rerouted",actorKind:"staff",actorId,safeMetadata:metadata,requestId,occurredAt:now}});
      await tx.auditEvent.create({data:{actorId,action:"logistics.shipment.rerouted",entityId:shipmentId,requestId,details:{orderId:shipment.orderId,...metadata,reason:input.reason,serviceLevel:input.serviceLevel??null}}});
      await tx.outboxEvent.create({data:{type:"logistics.shipment.rerouted",aggregateId:shipmentId,payload:{shipmentId,orderId:shipment.orderId,...metadata,status}}});
      const outcome=this.action(updated); await tx.idempotency.create({data:{actorId,operation,key:idempotencyKey,requestHash,outcome:outcome as Prisma.InputJsonValue}}); return outcome;
    },{timeout:15_000});
  }

}
