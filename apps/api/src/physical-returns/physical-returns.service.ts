import { Inject, Injectable } from "@nestjs/common";
import { API_CONFIG, type ApiConfig } from "../config";
import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  physicalReturnViewSchema, physicalReturnListSchema,
  type PhysicalReturnReceive, type PhysicalReturnInspect,
  type PhysicalReturnView,
} from "@variety/contracts";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

type Tx=Prisma.TransactionClient;
const dec=(value:string|Prisma.Decimal)=>new Prisma.Decimal(value);
const digest=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");

@Injectable()
export class PhysicalReturnsService {
  constructor(private readonly db:Database,@Inject(API_CONFIG) private readonly config:ApiConfig){}
  private ensureEnabled(){
    if(!this.config.physicalReturnsEnabled)
      throw new ApiProblem(503,"PHYSICAL_RETURNS_DISABLED",
        "Physical return intake has not been activated for this environment.");
  }

  private async view(tx:Tx,id:string):Promise<PhysicalReturnView>{
    const row=await tx.physicalReturnReceipt.findUnique({
      where:{id},include:{order:{select:{reference:true}},items:{
        include:{orderLine:{select:{productName:true,variantName:true,unit:true}}},
        orderBy:{orderLineId:"asc"},
      }},
    });
    if(!row)throw new ApiProblem(404,"NOT_FOUND","Physical return receipt not found.");
    return physicalReturnViewSchema.parse({
      id:row.id,reference:row.reference,orderId:row.orderId,
      orderReference:row.order.reference,locationId:row.locationId,
      status:row.status,reason:row.reason,evidenceNote:row.evidenceNote,
      receivedAt:row.receivedAt.toISOString(),inspectedAt:row.inspectedAt?.toISOString()??null,
      inspectionSummary:row.inspectionSummary,
      lines:row.items.map(item=>({
        id:item.id,orderLineId:item.orderLineId,variantId:item.variantId,
        productName:item.orderLine.productName,variantName:item.orderLine.variantName,
        unit:item.orderLine.unit,quantity:item.quantity.toString(),
        condition:item.condition,disposition:item.disposition,
        inspectionNote:item.inspectionNote,inspectedAt:item.inspectedAt?.toISOString()??null,
      })),
    });
  }
  async detail(id:string){return this.view(this.db as Tx,id);}
  async list(query:{orderId?:string;page:number;perPage:number}){
    const where=query.orderId?{orderId:query.orderId}:{};
    const [rows,total]=await this.db.$transaction([
      this.db.physicalReturnReceipt.findMany({
        where,select:{id:true},orderBy:[{receivedAt:"desc"},{id:"desc"}],
        skip:(query.page-1)*query.perPage,take:query.perPage,
      }),
      this.db.physicalReturnReceipt.count({where}),
    ]);
    const items=await Promise.all(rows.map(row=>this.detail(row.id)));
    return physicalReturnListSchema.parse({
      items,page:query.page,perPage:query.perPage,total,
      enabled:this.config.physicalReturnsEnabled,
    });
  }
  async receive(actorId:string,key:string,requestId:string,input:PhysicalReturnReceive){
    this.ensureEnabled();
    const operation="physical-return.receive";
    const lines=[...input.lines].sort((a,b)=>a.orderLineId.localeCompare(b.orderLineId))
      .map(line=>({...line,quantity:dec(line.quantity).toString()}));
    const hash=digest({...input,lines});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId,operation,key])},0))`;
      const previous=await tx.idempotency.findUnique({where:{actorId_operation_key:{actorId,operation,key}}});
      if(previous){
        if(previous.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT",
          "Receipt idempotency key was already used for different evidence.");
        return physicalReturnViewSchema.parse(previous.outcome);
      }
      // One source-order lock for receipts from all API instances, preventing
      // different concurrent returned cases from exceeding depleted quantity.
      const locked=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Order" WHERE id=${input.orderId} FOR UPDATE`;
      if(!locked.length)throw new ApiProblem(404,"NOT_FOUND","Order not found.");
      const order=await tx.order.findUniqueOrThrow({where:{id:input.orderId},
        include:{lines:true}});
      const source=await tx.stockDepletion.findUnique({
        where:{claimType_claimId:{claimType:"order",claimId:input.orderId}},
        include:{lines:true},
      });
      const location=source?await tx.location.findUnique({where:{id:source.locationId}}):null;
      if(!location?.active || !source ||
        !order.stockConsumedAt || !["delivered","collected"].includes(order.fulfilmentStatus))
        throw new ApiProblem(422,"PHYSICAL_RETURN_INELIGIBLE",
          "Physical receipt requires completed delivery or collection and verified stock handover at the original location.");
      for(const line of lines){
        const original=order.lines.find(o=>o.id===line.orderLineId);
        if(!original)throw new ApiProblem(422,"PHYSICAL_RETURN_LINE_INVALID",
          "An item does not belong to this order.");
        const quantity=dec(line.quantity);
        const depleted=source.lines.filter(x=>x.claimLineId===line.orderLineId&&x.variantId===original.variantId)
          .reduce((sum,x)=>sum.plus(x.quantity),new Prisma.Decimal(0));
        const old=await tx.physicalReturnItem.aggregate({where:{
          orderLineId:line.orderLineId,receipt:{orderId:input.orderId},
        },_sum:{quantity:true}});
        const returned=old._sum.quantity??new Prisma.Decimal(0);
        if(depleted.lte(0)||quantity.plus(returned).gt(depleted)||
          quantity.gt(original.quantity))
          throw new ApiProblem(409,"PHYSICAL_RETURN_OVER_QUANTITY",
            "Returned quantity exceeds physically handed-over units, including earlier receipts.");
        if(!["kg","litre"].includes(original.unit)&&!quantity.isInteger())
          throw new ApiProblem(400,"VALIDATION_FAILED",
            "Packaged items require whole-unit return quantities.");
      }
      const ref=`VGR-${randomUUID().replaceAll("-","").slice(0,12).toUpperCase()}`;
      const receipt=await tx.physicalReturnReceipt.create({data:{
        reference:ref,orderId:input.orderId,locationId:source.locationId,
        reason:input.reason,evidenceNote:input.evidenceNote,receivedBy:actorId,
      }});
      for(const line of lines){
        const original=order.lines.find(o=>o.id===line.orderLineId)!;
        await tx.physicalReturnItem.create({data:{
          receiptId:receipt.id,orderLineId:original.id,variantId:original.variantId,
          quantity:line.quantity,condition:line.condition,
          disposition:"awaiting_inspection",
        }});
      }
      const result=await this.view(tx,receipt.id);
      await tx.auditEvent.create({data:{actorId,action:"physical_return.received",
        entityId:receipt.id,requestId,
        details:{orderId:input.orderId,locationId:source.locationId,lineCount:lines.length}}});
      await tx.outboxEvent.create({data:{type:"physical_return.received",
        aggregateId:receipt.id,payload:{receiptId:receipt.id,orderId:input.orderId}}});
      await tx.idempotency.create({data:{actorId,operation,key,requestHash:hash,outcome:result}});
      return result;
    },{timeout:15000});
  }
  async inspect(actorId:string,receiptId:string,key:string,requestId:string,input:PhysicalReturnInspect){
    this.ensureEnabled();
    const operation=`physical-return.inspect:${receiptId}`;
    const hash=digest({receiptId,...input,lines:[...input.lines].sort((a,b)=>a.itemId.localeCompare(b.itemId))});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId,operation,key])},0))`;
      const previous=await tx.idempotency.findUnique({where:{actorId_operation_key:{actorId,operation,key}}});
      if(previous){
        if(previous.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT",
          "Inspection key was already used for different evidence.");
        return physicalReturnViewSchema.parse(previous.outcome);
      }
      await tx.$queryRaw`SELECT id FROM "PhysicalReturnReceipt" WHERE id=${receiptId} FOR UPDATE`;
      const receipt=await tx.physicalReturnReceipt.findUnique({where:{id:receiptId},
        include:{items:true}});
      if(!receipt)throw new ApiProblem(404,"NOT_FOUND","Physical return not found.");
      if(receipt.status!=="received")throw new ApiProblem(409,"RETURN_ALREADY_INSPECTED",
        "This return has already received a final inspection disposition.");
      if(receipt.items.length!==input.lines.length||
        input.lines.some(line=>!receipt.items.some(x=>x.id===line.itemId)))
        throw new ApiProblem(422,"PHYSICAL_RETURN_LINES_INCOMPLETE",
          "Inspection must explicitly record the condition decision for every received item.");
      const time=new Date();
      for(const line of input.lines){
        await tx.physicalReturnItem.update({where:{id:line.itemId},data:{
          disposition:line.disposition,inspectionNote:line.note,
          inspectedBy:actorId,inspectedAt:time,
        }});
      }
      await tx.physicalReturnReceipt.update({where:{id:receiptId},data:{
        status:"inspected",inspectedBy:actorId,inspectedAt:time,inspectionSummary:input.summary,
      }});
      const result=await this.view(tx,receiptId);
      await tx.auditEvent.create({data:{actorId,action:"physical_return.inspected",
        entityId:receiptId,requestId,
        details:{orderId:receipt.orderId,dispositions:input.lines.map(l=>({
          itemId:l.itemId,disposition:l.disposition,
        }))}}});
      await tx.outboxEvent.create({data:{type:"physical_return.inspected",
        aggregateId:receiptId,payload:{receiptId,orderId:receipt.orderId}}});
      await tx.idempotency.create({data:{actorId,operation,key,requestHash:hash,outcome:result}});
      return result;
    },{timeout:15000});
  }
}
