import { Injectable } from "@nestjs/common";
import {
  shipmentDetailViewSchema,
  shipmentListItemSchema,
  shipmentStatusSchema,
  type ShipmentAllowedAction,
  type ShipmentDetailView,
  type ShipmentListItem,
} from "@variety/contracts";
import { z } from "zod";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

const querySchema=z.object({
  page:z.coerce.number().int().min(1).max(1_000_000).default(1),
  perPage:z.coerce.number().int().min(1).max(100).default(25),
  status:shipmentStatusSchema.optional(),
}).strict();

type ProjectionInput={id:string;orderId:string;sequence:number;workflowVersionId:string;routeRuleId:string;routeRevision:number;status:string;originNodeId:string;destinationKind:string;finalPickupNodeId:string|null;currentNodeId:string|null;currentLegId:string|null;custody:string|null;activatedAt:Date|null;completedAt:Date|null;version:number;createdAt:Date;updatedAt:Date;order:{reference:string}};

@Injectable()
export class ShipmentQueryService {
  constructor(private readonly db:Database){}

  private actions(status:string):{allowedActions:ShipmentAllowedAction[];blockers:string[]}{
    if(status==="planned")return{allowedActions:[],blockers:["awaiting_fulfilment_handover"]};
    if(status==="at_node")return{allowedActions:["depart","reroute","checkpoint"],blockers:[]};
    if(status==="in_transit")return{allowedActions:["arrive","checkpoint"],blockers:[]};
    if(status==="final_mile_ready")return{allowedActions:["checkpoint"],blockers:["dispatch_controls_final_mile"]};
    if(status==="ready_for_pickup")return{allowedActions:["checkpoint"],blockers:["awaiting_customer_pickup"]};
    if(status==="final_mile")return{allowedActions:["checkpoint"],blockers:["dispatch_controls_final_mile"]};
    return{allowedActions:[],blockers:["shipment_completed"]};
  }

  private listItem(row:ProjectionInput):ShipmentListItem{
    const actions=this.actions(row.status);
    return shipmentListItemSchema.parse({
      id:row.id,orderId:row.orderId,orderReference:row.order.reference,sequence:row.sequence,
      workflowVersionId:row.workflowVersionId,routeRuleId:row.routeRuleId,routeRevision:row.routeRevision,status:row.status,
      originNodeId:row.originNodeId,destinationKind:row.destinationKind,finalPickupNodeId:row.finalPickupNodeId,
      currentNodeId:row.currentNodeId,currentLegId:row.currentLegId,custody:row.custody,
      activatedAt:row.activatedAt?.toISOString()??null,completedAt:row.completedAt?.toISOString()??null,version:row.version,
      createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),...actions,
    });
  }

  async list(raw:unknown){
    const parsed=querySchema.safeParse(raw);
    if(!parsed.success)throw new ApiProblem(400,"VALIDATION_FAILED","Shipment list query is invalid.",parsed.error.issues.map(issue=>({path:issue.path.map(String).join("."),message:issue.message})));
    const {page,perPage,status}=parsed.data;
    const where={sequence:1,...(status?{status}:{})} as any;
    const [total,rows]=await this.db.$transaction([
      this.db.shipment.count({where}),
      this.db.shipment.findMany({where,include:{order:{select:{reference:true}}},orderBy:[{updatedAt:"desc"},{id:"desc"}],skip:(page-1)*perPage,take:perPage}),
    ]);
    return{items:rows.map(row=>this.listItem(row as ProjectionInput)),page,perPage,total};
  }

  async get(shipmentId:string):Promise<ShipmentDetailView>{
    const row=await this.db.shipment.findUnique({where:{id:shipmentId},include:{
      order:{select:{reference:true}},
      stops:{orderBy:[{routeRevision:"asc"},{position:"asc"}]},
      legs:{orderBy:[{routeRevision:"asc"},{position:"asc"}]},
      events:{orderBy:[{occurredAt:"asc"},{createdAt:"asc"}]},
    }});
    if(!row)throw new ApiProblem(404,"NOT_FOUND","Shipment not found.");
    const base=this.listItem(row as ProjectionInput);
    return shipmentDetailViewSchema.parse({
      ...base,destinationAddress:row.destinationAddress??null,
      stops:row.stops.map(({shipmentId:_shipmentId,...stop})=>({...stop,plannedArrivalAt:stop.plannedArrivalAt?.toISOString()??null,plannedDepartureAt:stop.plannedDepartureAt?.toISOString()??null})),
      legs:row.legs.map(({shipmentId:_shipmentId,...leg})=>({...leg,departedAt:leg.departedAt?.toISOString()??null,arrivedAt:leg.arrivedAt?.toISOString()??null,slaDeadline:leg.slaDeadline?.toISOString()??null})),
      events:row.events.map(({shipmentId:_shipmentId,...event})=>({...event,occurredAt:event.occurredAt.toISOString(),createdAt:event.createdAt.toISOString(),safeMetadata:event.safeMetadata&&typeof event.safeMetadata==="object"&&!Array.isArray(event.safeMetadata)?event.safeMetadata:{}})),
    });
  }
}
