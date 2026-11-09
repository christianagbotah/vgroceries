import {Inject,Injectable} from "@nestjs/common";
import {Prisma} from "@prisma/client";
import {randomUUID,createHash} from "node:crypto";
import {
  customerReturnClaimViewSchema,customerReturnClaimsListSchema,
  customerReturnClaimEligibilitySchema,
  type CustomerReturnClaimRequest,type CustomerReturnClaimDecision,
} from "@variety/contracts";
import {API_CONFIG,type ApiConfig} from "../config";
import {Database} from "../database/database";
import {ApiProblem} from "../http/errors";

type Tx=Prisma.TransactionClient;
const dec=(x:string|Prisma.Decimal)=>new Prisma.Decimal(x);
const digest=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");

/** R3a request authority. This service NEVER writes stock lots, payment
 * attempts, Refunds or physical-return receipts. No promise of a refund.
 */
@Injectable()
export class CustomerReturnClaimsService {
  constructor(private readonly db:Database,@Inject(API_CONFIG)private readonly config:ApiConfig){}
  private ensureOn(){
    if(!this.config.customerReturnClaimsEnabled)
      throw new ApiProblem(503,"RETURN_CLAIMS_DISABLED",
        "Customer return requests have not been enabled for this environment.");
  }
  private async view(tx:Tx,id:string) {
    const r=await tx.customerReturnClaim.findUnique({where:{id},
      include:{order:{select:{reference:true}},lines:{
        orderBy:{orderLineId:"asc"},
        include:{orderLine:{select:{productName:true,variantName:true,unit:true}}},
      }}});
    if(!r)throw new ApiProblem(404,"NOT_FOUND","Return request not found.");
    return customerReturnClaimViewSchema.parse({
      id:r.id,reference:r.reference,orderId:r.orderId,orderReference:r.order.reference,
      status:r.status,reason:r.reason,evidenceNote:r.evidenceNote,
      createdAt:r.createdAt.toISOString(),reviewedAt:r.reviewedAt?.toISOString()??null,
      reviewNote:r.reviewNote,cancelledAt:r.cancelledAt?.toISOString()??null,
      lines:r.lines.map(line=>({
        orderLineId:line.orderLineId,productName:line.orderLine.productName,
        variantName:line.orderLine.variantName,unit:line.orderLine.unit,
        quantity:line.quantity.toString(),reason:line.reason,
      })),
    });
  }
  private async ownedOrder(tx:Tx,orderId:string,customerId:string){
    const order=await tx.order.findUnique({where:{id:orderId},
      include:{lines:true}});
    if(!order||order.customerUserId!==customerId)
      throw new ApiProblem(404,"NOT_FOUND","Order not found.");
    return order;
  }
  private async available(tx:Tx,orderId:string,orderLines:{
    id:string;variantId:string;quantity:Prisma.Decimal;unit:string;
    productName:string;variantName:string;
  }[]){
    const depletion=await tx.stockDepletion.findUnique({
      where:{claimType_claimId:{claimType:"order",claimId:orderId}},
      include:{lines:true},
    });
    const active=await tx.customerReturnClaimLine.findMany({where:{
      claim:{orderId,status:{in:["requested","accepted"]}},
    },select:{orderLineId:true,quantity:true}});
    // Claim-linked physical receipts are already reserved by their accepted
    // claim. Counting them again would double-debit the customer's balance.
    const physicallyReturned=await tx.physicalReturnItem.findMany({where:{
      receipt:{orderId,customerClaimId:null},
    },select:{orderLineId:true,quantity:true}});
    return orderLines.map(line=>{
      const originallyDepleted=depletion?.lines.filter(x=>
        x.claimLineId===line.id&&x.variantId===line.variantId)
        .reduce((sum,x)=>sum.plus(x.quantity),new Prisma.Decimal(0))??new Prisma.Decimal(0);
      const reserved=active.filter(x=>x.orderLineId===line.id)
        .reduce((sum,x)=>sum.plus(x.quantity),new Prisma.Decimal(0));
      const physically=physicallyReturned.filter(x=>x.orderLineId===line.id)
        .reduce((sum,x)=>sum.plus(x.quantity),new Prisma.Decimal(0));
      const left=Prisma.Decimal.max(0,Prisma.Decimal.min(line.quantity,originallyDepleted)
        .minus(reserved).minus(physically));
      return {
        orderLineId:line.id,productName:line.productName,
        variantName:line.variantName,unit:line.unit,
        orderedQuantity:line.quantity.toString(),availableQuantity:left.toString(),
      };
    });
  }
  async eligibility(customerId:string,orderId:string){
    const order=await this.ownedOrder(this.db as Tx,orderId,customerId);
    const completed=!!order.stockConsumedAt&&["delivered","collected"].includes(order.fulfilmentStatus);
    const lines=completed?await this.available(this.db as Tx,orderId,order.lines):
      order.lines.map(line=>({
        orderLineId:line.id,productName:line.productName,
        variantName:line.variantName,unit:line.unit,
        orderedQuantity:line.quantity.toString(),availableQuantity:"0",
      }));
    return customerReturnClaimEligibilitySchema.parse({
      enabled:this.config.customerReturnClaimsEnabled,orderId,lines,
    });
  }
  async list(customerId:string|undefined,page:number,perPage:number){
    const where=customerId?{customerUserId:customerId}:{};
    const [items,total]=await this.db.$transaction([
      this.db.customerReturnClaim.findMany({
        where,select:{id:true},orderBy:[{createdAt:"desc"},{id:"desc"}],
        skip:(page-1)*perPage,take:perPage,
      }),this.db.customerReturnClaim.count({where}),
    ]);
    return customerReturnClaimsListSchema.parse({
      enabled:this.config.customerReturnClaimsEnabled,page,perPage,total,
      items:await Promise.all(items.map(row=>this.view(this.db as Tx,row.id))),
    });
  }
  async detail(customerId:string|undefined,id:string){
    const row=await this.db.customerReturnClaim.findUnique({
      where:{id},select:{customerUserId:true}});
    if(!row||(customerId&&row.customerUserId!==customerId))
      throw new ApiProblem(404,"NOT_FOUND","Return request not found.");
    return this.view(this.db as Tx,id);
  }
  async create(customerId:string,key:string,requestId:string,input:CustomerReturnClaimRequest){
    this.ensureOn();
    const sorted=[...input.lines].sort((a,b)=>a.orderLineId.localeCompare(b.orderLineId))
      .map(line=>({...line,quantity:dec(line.quantity).toString()}));
    const hash=digest({...input,lines:sorted});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([customerId,"customer-return-claim.create",key])},0))`;
      const replay=await tx.idempotency.findUnique({where:{
        actorId_operation_key:{actorId:customerId,operation:"customer-return-claim.create",key},
      }});
      if(replay){
        if(replay.requestHash!==hash)
          throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","This request key already represents different returned goods.");
        return customerReturnClaimViewSchema.parse(replay.outcome);
      }
      const locked=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Order" WHERE id=${input.orderId} FOR UPDATE`;
      if(!locked.length)throw new ApiProblem(404,"NOT_FOUND","Order not found.");
      const order=await this.ownedOrder(tx,input.orderId,customerId);
      if(!order.stockConsumedAt||!["delivered","collected"].includes(order.fulfilmentStatus))
        throw new ApiProblem(422,"RETURN_ORDER_INCOMPLETE",
          "A return request requires completed delivery or customer collection.");
      const possible=await this.available(tx,input.orderId,order.lines);
      for(const line of sorted){
        const original=order.lines.find(x=>x.id===line.orderLineId);
        const allowed=possible.find(x=>x.orderLineId===line.orderLineId);
        const requested=dec(line.quantity);
        if(!original||!allowed||requested.gt(allowed.availableQuantity))
          throw new ApiProblem(409,"RETURN_QUANTITY_EXCEEDED",
            "Requested units exceed the original, unclaimed physical delivery balance.");
        if(!["kg","litre"].includes(original.unit)&&!requested.isInteger())
          throw new ApiProblem(400,"VALIDATION_FAILED",
            "Piece-counted goods require whole-unit returns.");
      }
      const reference="VGRQ-"+randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
      const row=await tx.customerReturnClaim.create({data:{
        reference,orderId:order.id,customerUserId:customerId,
        status:"requested",reason:input.reason,evidenceNote:input.evidenceNote??null,
        lines:{create:sorted.map(line=>({
          orderLineId:line.orderLineId,quantity:line.quantity,reason:line.reason,
        }))},
      }});
      const outcome=await this.view(tx,row.id);
      await tx.auditEvent.create({data:{
        actorId:customerId,action:"customer_return_claim.requested",
        entityId:row.id,requestId,details:{
          orderId:order.id,reference,lineCount:sorted.length,
          quantities:sorted.map(x=>({orderLineId:x.orderLineId,quantity:x.quantity})),
        },
      }});
      await tx.outboxEvent.create({data:{
        type:"customer_return_claim.requested",aggregateId:row.id,
        payload:{claimId:row.id,orderId:order.id},
      }});
      await tx.idempotency.create({data:{
        actorId:customerId,operation:"customer-return-claim.create",
        key,requestHash:hash,outcome,
      }});
      return outcome;
    },{timeout:15000});
  }
  async cancel(customerId:string,claimId:string,key:string,requestId:string){
    this.ensureOn();
    const operation=`customer-return-claim.cancel:${claimId}`;
    const hash=digest({claimId});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([customerId,operation,key])},0))`;
      const where={actorId_operation_key:{actorId:customerId,operation,key}};
      const replay=await tx.idempotency.findUnique({where});
      if(replay){
        if(replay.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","Cancellation key mismatch.");
        return customerReturnClaimViewSchema.parse(replay.outcome);
      }
      const locked=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "CustomerReturnClaim" WHERE id=${claimId} FOR UPDATE`;
      if(!locked.length)throw new ApiProblem(404,"NOT_FOUND","Return request not found.");
      const claim=await tx.customerReturnClaim.findUniqueOrThrow({where:{id:claimId}});
      if(claim.customerUserId!==customerId)
        throw new ApiProblem(404,"NOT_FOUND","Return request not found.");
      if(claim.status!=="requested")
        throw new ApiProblem(409,"RETURN_CLAIM_ALREADY_DECIDED",
          "Only a pending return request can be cancelled.");
      await tx.customerReturnClaim.update({where:{id:claimId},
        data:{status:"cancelled",cancelledAt:new Date()}});
      const outcome=await this.view(tx,claimId);
      await tx.auditEvent.create({data:{actorId:customerId,action:"customer_return_claim.cancelled",
        entityId:claimId,requestId,details:{orderId:claim.orderId}}});
      await tx.outboxEvent.create({data:{type:"customer_return_claim.cancelled",
        aggregateId:claimId,payload:{claimId,orderId:claim.orderId}}});
      await tx.idempotency.create({data:{actorId:customerId,operation,key,requestHash:hash,outcome}});
      return outcome;
    },{timeout:15000});
  }
  async decide(adminId:string,claimId:string,key:string,requestId:string,input:CustomerReturnClaimDecision){
    this.ensureOn();
    const operation=`customer-return-claim.decide:${claimId}`;
    const hash=digest({claimId,...input});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([adminId,operation,key])},0))`;
      const replay=await tx.idempotency.findUnique({where:{
        actorId_operation_key:{actorId:adminId,operation,key},
      }});
      if(replay){
        if(replay.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT",
          "Decision key has been used for different evidence.");
        return customerReturnClaimViewSchema.parse(replay.outcome);
      }
      const locked=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "CustomerReturnClaim" WHERE id=${claimId} FOR UPDATE`;
      if(!locked.length)throw new ApiProblem(404,"NOT_FOUND","Return request not found.");
      const claim=await tx.customerReturnClaim.findUniqueOrThrow({where:{id:claimId}});
      if(claim.status!=="requested")
        throw new ApiProblem(409,"RETURN_CLAIM_ALREADY_DECIDED",
          "Only pending return requests can receive a decision.");
      if(claim.customerUserId===adminId)
        throw new ApiProblem(403,"INDEPENDENT_REVIEW_REQUIRED",
          "The customer requesting a return cannot approve it.");
      await tx.customerReturnClaim.update({where:{id:claimId},
        data:{status:input.decision==="accept"?"accepted":"rejected",
          reviewedAt:new Date(),reviewedBy:adminId,reviewNote:input.reviewNote}});
      const outcome=await this.view(tx,claimId);
      await tx.auditEvent.create({data:{actorId:adminId,
        action:`customer_return_claim.${outcome.status}`,
        entityId:claimId,requestId,details:{orderId:claim.orderId,returnRequestOnly:true}}});
      await tx.outboxEvent.create({data:{
        type:`customer_return_claim.${outcome.status}`,aggregateId:claimId,
        payload:{claimId,orderId:claim.orderId},
      }});
      await tx.idempotency.create({data:{
        actorId:adminId,operation,key,requestHash:hash,outcome,
      }});
      return outcome;
    },{timeout:15000});
  }
}
