import { Inject, Injectable } from "@nestjs/common";
import { API_CONFIG, type ApiConfig } from "../config";
import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  physicalReturnViewSchema, physicalReturnListSchema, physicalReturnCustodyViewSchema,
  physicalReturnResaleReviewViewSchema,
  type PhysicalReturnResalePropose,type PhysicalReturnResaleDecision,
  type PhysicalReturnQuarantineRequest,
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
        include:{
          orderLine:{select:{productName:true,variantName:true,unit:true}},
          custody:{include:{
            sourceLot:{select:{lotNumber:true,expiryDate:true}},
            quarantineLot:{select:{lotNumber:true}},
          }},
          resaleReview:true,
        },
        orderBy:{orderLineId:"asc"},
      }},
    });
    if(!row)throw new ApiProblem(404,"NOT_FOUND","Physical return receipt not found.");
    return physicalReturnViewSchema.parse({
      id:row.id,reference:row.reference,orderId:row.orderId,
      orderReference:row.order.reference,customerClaimId:row.customerClaimId,
      locationId:row.locationId,
      status:row.status,reason:row.reason,evidenceNote:row.evidenceNote,
      receivedAt:row.receivedAt.toISOString(),inspectedAt:row.inspectedAt?.toISOString()??null,
      inspectionSummary:row.inspectionSummary,
      lines:row.items.map(item=>({
        id:item.id,orderLineId:item.orderLineId,variantId:item.variantId,
        productName:item.orderLine.productName,variantName:item.orderLine.variantName,
        unit:item.orderLine.unit,quantity:item.quantity.toString(),
        condition:item.condition,disposition:item.disposition,
        inspectionNote:item.inspectionNote,inspectedAt:item.inspectedAt?.toISOString()??null,
        resaleReview:item.resaleReview?this.resaleReviewView(item.resaleReview):null,
        resaleEligible:this.config.physicalReturnResaleEnabled
          &&this.config.physicalReturnResaleAllowedVariants.includes(item.variantId)
          &&item.condition==="sealed"&&item.disposition==="quarantine"
          &&item.orderLine.unit==="piece"&&!!item.custody
          &&!!item.custody.sourceLot.expiryDate
          &&item.custody.sourceLot.expiryDate.getTime()>=Date.now()+30*86400000,
        custody:item.custody?{
          itemId:item.id,sourceLotId:item.custody.sourceLotId,
          sourceLotNumber:item.custody.sourceLot.lotNumber,
          quarantineLotId:item.custody.quarantineLotId,
          quarantineLotNumber:item.custody.quarantineLot.lotNumber,
          quantity:item.custody.quantity.toString(),
          recordedAt:item.custody.recordedAt.toISOString(),
          custodyNote:item.custody.custodyNote,status:"quarantined" as const,
        }:null,
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
      claimLinkEnabled:this.config.physicalReturnClaimLinkEnabled,
      custodyEnabled:this.config.physicalReturnCustodyEnabled,
      resaleEnabled:this.config.physicalReturnResaleEnabled,
    });
  }
  private ensureResale(){
    this.ensureEnabled();
    if(!this.config.physicalReturnCustodyEnabled||!this.config.physicalReturnResaleEnabled)
      throw new ApiProblem(503,"RETURN_RESALE_DISABLED",
        "Returned-goods resale approval has not been activated for this environment.");
  }
  private resaleReviewView(review:{
    itemId:string;status:string;evidenceNote:string;proposedBy:string;proposedAt:Date;
    decidedBy:string|null;decidedAt:Date|null;decisionNote:string|null;
    saleableLotId:string|null;transferReceiptId:string|null;
  }){
    return physicalReturnResaleReviewViewSchema.parse({
      itemId:review.itemId,status:review.status,
      evidenceNote:review.evidenceNote,proposedBy:review.proposedBy,
      proposedAt:review.proposedAt.toISOString(),decidedBy:review.decidedBy,
      decidedAt:review.decidedAt?.toISOString()??null,decisionNote:review.decisionNote,
      saleableLotId:review.saleableLotId,transferReceiptId:review.transferReceiptId,
    });
  }
  private async checkedNonFoodItem(tx:Tx,itemId:string){
    const item=await tx.physicalReturnItem.findUnique({where:{id:itemId},
      include:{
        receipt:true,
        orderLine:true,
        custody:{include:{sourceLot:true,quarantineLot:true}},
        resaleReview:true,
      }});
    if(!item)throw new ApiProblem(404,"NOT_FOUND","Returned item not found.");
    if(!item.custody||item.disposition!=="quarantine"||
      item.receipt.status!=="inspected"||item.condition!=="sealed"||
      !item.inspectedAt||item.orderLine.unit!=="piece")
      throw new ApiProblem(422,"RETURN_RESALE_INELIGIBLE",
        "Only fully inspected, factory-sealed, piece-counted quarantined goods are reviewable.");
    if(!this.config.physicalReturnResaleAllowedVariants.includes(item.variantId))
      throw new ApiProblem(422,"RETURN_RESALE_NOT_ALLOWLISTED",
        "This product variant has no independently configured non-food resale authorization.");
    const variant=await tx.variant.findUnique({where:{id:item.variantId},
      include:{product:{include:{category:true}}}});
    if(!variant?.active||!variant.product.published||
      !["non-food","household","household-essentials","cleaning-supplies"]
        .includes(variant.product.category.slug))
      throw new ApiProblem(422,"RETURN_RESALE_UNSAFE_CATEGORY",
        "Only approved non-food household and cleaning categories may be considered.");
    if(item.custody.quarantineLot.kind!=="physical_return_quarantine"||
      !item.custody.quarantineLot.quarantined||
      !item.custody.quarantineLot.quantity.eq(item.custody.quantity))
      throw new ApiProblem(422,"RETURN_RESALE_CUSTODY_CONFLICT",
        "The original returned goods are no longer fully held in quarantine.");
    const expiry=item.custody.sourceLot.expiryDate;
    const minShelfDate=new Date(Date.now()+30*86400000);
    if(!expiry||expiry.getTime()<minShelfDate.getTime()||
      !item.custody.quarantineLot.expiryDate||
      item.custody.quarantineLot.expiryDate.getTime()!==expiry.getTime())
      throw new ApiProblem(422,"RETURN_RESALE_EXPIRY_UNVERIFIED",
        "Traceable original expiry with at least 30 days remaining is required.");
    const location=await tx.location.findUnique({where:{id:item.receipt.locationId}});
    if(!location?.active)
      throw new ApiProblem(422,"RETURN_RESALE_LOCATION_INACTIVE",
        "The original physically verified return location is unavailable.");
    return item;
  }

  /** One immutable proposed review: no saleable stock is changed here. */
  async proposeResale(actorId:string,itemId:string,key:string,requestId:string,input:PhysicalReturnResalePropose){
    this.ensureResale();
    const operation=`physical-return.resale-propose:${itemId}`;
    const hash=digest({itemId,...input});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId,operation,key])},0))`;
      const previous=await tx.idempotency.findUnique({where:{actorId_operation_key:{actorId,operation,key}}});
      if(previous){
        if(previous.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT",
          "Resale proposal replay key was used with different evidence.");
        return physicalReturnResaleReviewViewSchema.parse(previous.outcome);
      }
      const locked=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "PhysicalReturnItem" WHERE id=${itemId} FOR UPDATE`;
      if(!locked.length)throw new ApiProblem(404,"NOT_FOUND","Returned item not found.");
      const item=await this.checkedNonFoodItem(tx,itemId);
      if(item.resaleReview)throw new ApiProblem(409,"RETURN_RESALE_REVIEW_EXISTS",
        "This returned item already has a finalizable or completed resale review.");
      const review=await tx.physicalReturnResaleReview.create({data:{
        itemId,status:"pending",proposedBy:actorId,
        evidenceNote:input.evidenceNote,
        safetyClassification:input.safetyClassification,
        factorySealIntact:input.factorySealIntact,
        tamperAndContaminationAbsent:input.tamperAndContaminationAbsent,
        sourceTraceabilityVerified:input.sourceTraceabilityVerified,
        expiryAndStorageVerified:input.expiryAndStorageVerified,
      }});
      const outcome=this.resaleReviewView(review);
      await tx.auditEvent.create({data:{actorId,action:"physical_return.resale_proposed",
        entityId:itemId,requestId,
        details:{returnId:item.receiptId,variantId:item.variantId,
          sourceLotId:item.custody!.sourceLotId,quantity:item.quantity.toString(),
          classification:input.safetyClassification}}});
      await tx.outboxEvent.create({data:{type:"physical_return.resale_proposed",
        aggregateId:item.receiptId,payload:{itemId,returnId:item.receiptId}}});
      await tx.idempotency.create({data:{actorId,operation,key,requestHash:hash,outcome}});
      return outcome;
    },{timeout:15000});
  }

  /** Second, independent staff decision; approval is one atomic stock transfer. */
  async decideResale(actorId:string,itemId:string,key:string,requestId:string,input:PhysicalReturnResaleDecision){
    this.ensureResale();
    const operation=`physical-return.resale-decision:${itemId}`;
    const hash=digest({itemId,...input});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId,operation,key])},0))`;
      const previous=await tx.idempotency.findUnique({where:{actorId_operation_key:{actorId,operation,key}}});
      if(previous){
        if(previous.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT",
          "Resale decision replay key was used with different evidence.");
        return physicalReturnResaleReviewViewSchema.parse(previous.outcome);
      }
      const locked=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "PhysicalReturnItem" WHERE id=${itemId} FOR UPDATE`;
      if(!locked.length)throw new ApiProblem(404,"NOT_FOUND","Returned item not found.");
      // After release the quarantine lot correctly contains zero. Report the
      // immutable terminal review conflict BEFORE rechecking pre-release
      // eligibility, so a duplicate alternative key cannot masquerade as a
      // stock provenance failure.
      const current=await tx.physicalReturnResaleReview.findUnique({where:{itemId}});
      if(!current||current.status!=="pending")
        throw new ApiProblem(409,"RETURN_RESALE_NOT_PENDING",
          "No pending independent resale review exists for this returned item.");
      const item=await this.checkedNonFoodItem(tx,itemId);
      const review=item.resaleReview!;
      if([review.proposedBy,item.inspectedBy,item.receipt.receivedBy,item.custody!.recordedBy]
        .includes(actorId))
        throw new ApiProblem(403,"RETURN_RESALE_INDEPENDENT_APPROVAL_REQUIRED",
          "A different administrator must decide; the proposer, inspector, receiver and custodian cannot approve.");
      const now=new Date();
      if(input.decision==="reject"){
        const rejected=await tx.physicalReturnResaleReview.update({where:{itemId},
          data:{status:"rejected",decidedBy:actorId,decidedAt:now,decisionNote:input.decisionNote}});
        const outcome=this.resaleReviewView(rejected);
        await tx.auditEvent.create({data:{actorId,action:"physical_return.resale_rejected",
          entityId:itemId,requestId,details:{returnId:item.receiptId}}});
        await tx.outboxEvent.create({data:{type:"physical_return.resale_rejected",
          aggregateId:item.receiptId,payload:{itemId,returnId:item.receiptId}}});
        await tx.idempotency.create({data:{actorId,operation,key,requestHash:hash,outcome}});
        return outcome;
      }
      const custody=item.custody!;
      const original=custody.quarantineLot;
      const receipt=await tx.stockReceipt.create({data:{
        receivedBy:actorId,
        poRef:`NONFOOD_RETURN_RESALE:${itemId}`,
        note:`Independent approved non-food factory-sealed resale transfer: ${item.receipt.reference}`,
      }});
      const saleable=await tx.stockLot.create({data:{
        positionId:original.positionId,receiptId:receipt.id,
        lotNumber:`RET-RESALE-${itemId.slice(0,16)}-${randomUUID().slice(0,8)}`,
        kind:"regular",quarantined:false,quantity:custody.quantity,
        expiryDate:custody.sourceLot.expiryDate,
        unitCostMinor:custody.sourceLot.unitCostMinor,
      }});
      await tx.stockMovement.create({data:{
        lotId:saleable.id,receiptId:receipt.id,
        delta:custody.quantity,resultingQty:custody.quantity,
        actorId,reason:"physical_return_resale_transfer_in",
      }});
      const approved=await tx.physicalReturnResaleReview.update({where:{itemId},
        data:{status:"approved",decidedBy:actorId,decidedAt:now,
          decisionNote:input.decisionNote,saleableLotId:saleable.id,
          transferReceiptId:receipt.id}});
      await tx.stockLot.update({where:{id:original.id},data:{quantity:"0"}});
      await tx.stockMovement.create({data:{
        lotId:original.id,receiptId:receipt.id,
        delta:custody.quantity.negated(),resultingQty:"0",
        actorId,reason:"physical_return_resale_transfer_out",
      }});
      const outcome=this.resaleReviewView(approved);
      await tx.auditEvent.create({data:{actorId,action:"physical_return.resale_approved",
        entityId:itemId,requestId,
        details:{returnId:item.receiptId,sourceLotId:original.id,
          saleableLotId:saleable.id,quantity:custody.quantity.toString(),
          transferReceiptId:receipt.id,proposedBy:review.proposedBy}}});
      await tx.outboxEvent.create({data:{type:"physical_return.resale_approved",
        aggregateId:item.receiptId,payload:{itemId,returnId:item.receiptId,
          saleableLotId:saleable.id}}});
      await tx.idempotency.create({data:{actorId,operation,key,requestHash:hash,outcome}});
      return outcome;
    },{timeout:20000});
  }

  /** One-way, off-sale receipt of an already-inspected return item.
   * This never changes the original depleted lot or creates a refund.
   * Restrict to a single original source lot until per-lot returns are built.
   */
  async quarantine(actorId:string,itemId:string,key:string,requestId:string,input:PhysicalReturnQuarantineRequest){
    this.ensureEnabled();
    if(!this.config.physicalReturnCustodyEnabled)
      throw new ApiProblem(503,"PHYSICAL_RETURN_CUSTODY_DISABLED",
        "Quarantined return inventory custody is not enabled for this environment.");
    const operation=`physical-return.quarantine:${itemId}`;
    const hash=digest({itemId,...input});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId,operation,key])},0))`;
      const where={actorId_operation_key:{actorId,operation,key}};
      const previous=await tx.idempotency.findUnique({where});
      if(previous){
        if(previous.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT",
          "Custody replay key has already been used for different evidence.");
        return physicalReturnCustodyViewSchema.parse(previous.outcome);
      }
      const locked=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "PhysicalReturnItem" WHERE id=${itemId} FOR UPDATE`;
      if(!locked.length)throw new ApiProblem(404,"NOT_FOUND","Physical return item not found.");
      const item=await tx.physicalReturnItem.findUniqueOrThrow({where:{id:itemId},
        include:{receipt:true,custody:true}});
      if(item.receipt.status!=="inspected"||!item.inspectedAt||item.disposition!=="quarantine")
        throw new ApiProblem(422,"RETURN_NOT_READY_FOR_QUARANTINE",
          "Only a fully inspected and quarantined return item can enter stock custody.");
      if(item.custody)throw new ApiProblem(409,"RETURN_ALREADY_IN_STOCK_CUSTODY",
        "This physically returned item has already been recorded in quarantine inventory.");
      const depleted=await tx.stockDepletion.findUnique({where:{
        claimType_claimId:{claimType:"order",claimId:item.receipt.orderId},
      },include:{lines:true}});
      const matches=depleted?.lines.filter(line=>
        line.claimLineId===item.orderLineId&&line.variantId===item.variantId)??[];
      const sourceIds=[...new Set(matches.map(line=>line.lotId))];
      if(!depleted||depleted.locationId!==item.receipt.locationId||sourceIds.length!==1||
        matches.reduce((sum,line)=>sum.plus(line.quantity),new Prisma.Decimal(0)).lt(item.quantity))
        throw new ApiProblem(422,"RETURN_LOT_PROVENANCE_UNVERIFIED",
          "Cannot establish one immutable original stock lot for these returned goods.");
      const sourceLot=await tx.stockLot.findUnique({where:{id:sourceIds[0]},
        include:{position:true}});
      if(!sourceLot||sourceLot.position.variantId!==item.variantId||
        sourceLot.position.locationId!==item.receipt.locationId)
        throw new ApiProblem(422,"RETURN_LOT_PROVENANCE_UNVERIFIED",
          "The original stock lot does not match the depleted order line and location.");
      const receipt=await tx.stockReceipt.create({data:{
        receivedBy:actorId,
        note:`Physical return ${item.receipt.reference}: quarantined stock, NOT saleable or refunded`,
        poRef:`PHYSICAL_RETURN:${item.id}`,
      }});
      const quarantineLot=await tx.stockLot.create({data:{
        positionId:sourceLot.positionId,receiptId:receipt.id,
        lotNumber:`RET-${item.receipt.reference}-${item.id.slice(0,8)}`,
        quantity:item.quantity,expiryDate:sourceLot.expiryDate,
        unitCostMinor:sourceLot.unitCostMinor,
        kind:"physical_return_quarantine",quarantined:true,
      }});
      await tx.stockMovement.create({data:{
        lotId:quarantineLot.id,receiptId:receipt.id,
        delta:item.quantity,resultingQty:item.quantity,
        actorId,reason:"physical_return_quarantine",
      }});
      const custody=await tx.physicalReturnCustody.create({data:{
        itemId,sourceLotId:sourceLot.id,quarantineLotId:quarantineLot.id,
        stockReceiptId:receipt.id,quantity:item.quantity,
        custodyNote:input.custodyNote,recordedBy:actorId,
      }});
      const result=physicalReturnCustodyViewSchema.parse({
        itemId,sourceLotId:sourceLot.id,sourceLotNumber:sourceLot.lotNumber,
        quarantineLotId:quarantineLot.id,quarantineLotNumber:quarantineLot.lotNumber,
        quantity:item.quantity.toString(),recordedAt:custody.recordedAt.toISOString(),
        custodyNote:custody.custodyNote,status:"quarantined",
      });
      await tx.auditEvent.create({data:{actorId,action:"physical_return.quarantine_recorded",
        entityId:itemId,requestId,
        details:{returnId:item.receiptId,orderId:item.receipt.orderId,stockReceiptId:receipt.id,
          sourceLotId:sourceLot.id,quarantineLotId:quarantineLot.id,quantity:item.quantity.toString()}}});
      await tx.outboxEvent.create({data:{type:"physical_return.quarantine_recorded",
        aggregateId:item.receiptId,payload:{returnId:item.receiptId,itemId,
          quarantineLotId:quarantineLot.id}}});
      await tx.idempotency.create({data:{actorId,operation,key,requestHash:hash,outcome:result}});
      return result;
    },{timeout:15000});
  }

  async receive(actorId:string,key:string,requestId:string,input:PhysicalReturnReceive){
    this.ensureEnabled();
    if(input.customerClaimId&&!this.config.physicalReturnClaimLinkEnabled)
      throw new ApiProblem(503,"RETURN_CLAIM_LINK_DISABLED",
        "Physical intake against approved customer claims is not activated.");
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
      const claim=input.customerClaimId?await tx.customerReturnClaim.findUnique({
        where:{id:input.customerClaimId},include:{lines:true},
      }):null;
      if(input.customerClaimId&&(!claim||claim.orderId!==order.id||claim.status!=="accepted"))
        throw new ApiProblem(422,"RETURN_CLAIM_NOT_ACCEPTED",
          "This receipt requires an accepted request for the exact original order.");
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
        if(claim){
          const requested=claim.lines.find(x=>x.orderLineId===line.orderLineId);
          const received=await tx.physicalReturnItem.aggregate({
            where:{orderLineId:line.orderLineId,receipt:{customerClaimId:claim.id}},
            _sum:{quantity:true},
          });
          if(!requested||quantity.plus(received._sum.quantity??0).gt(requested.quantity))
            throw new ApiProblem(409,"RETURN_CLAIM_RECEIPT_OVER_QUANTITY",
              "Physical quantities exceed the approved request or include another item.");
        }
      }
      const ref=`VGR-${randomUUID().replaceAll("-","").slice(0,12).toUpperCase()}`;
      const receipt=await tx.physicalReturnReceipt.create({data:{
        reference:ref,orderId:input.orderId,locationId:source.locationId,
        customerClaimId:input.customerClaimId??null,
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
        details:{orderId:input.orderId,locationId:source.locationId,
          customerClaimId:input.customerClaimId??null,lineCount:lines.length}}});
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
