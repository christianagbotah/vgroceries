import {Injectable} from "@nestjs/common";
import {Prisma} from "@prisma/client";
import {Database} from "../database/database";
import {ApiProblem} from "../http/errors";
import type {AuthRequest} from "../identity/identity.service";
import {tokenHash} from "../identity/crypto";
import {StockDepletionService} from "../inventory/stock-depletion.service";
import {dispatchCarryingValue} from "./transfer-valuation";
import {AllocationService} from "../inventory/allocation.service";
import {normalizeAllocationQuantity} from "../inventory/allocation.values";
import {mayActOnTransfer,type TransferActor} from "./transfer-policy";
import {previewTransferReceipt} from "./transfer-receipt-preview";
import type {TransferRequestInput,TransferDecisionInput,TransferReceiptInput} from "./transfer-requisition.schemas";

const include={lines:{orderBy:{variantId:"asc" as const}},dispatch:{include:{lots:{include:{depletionLine:true},orderBy:{id:"asc" as const}}}}};
const deny=()=>new ApiProblem(403,"FORBIDDEN","Transfer location or action not permitted.");
const conflict=()=>new ApiProblem(409,"CONFLICT","Transfer request changed or conflicts with an earlier request.");
const missing=()=>new ApiProblem(404,"NOT_FOUND","Transfer request not found.");
type TransferRow=Prisma.InternalTransferRequestGetPayload<{include:typeof include}>;
const project=(r:TransferRow,covered=false,now=new Date())=>({
 id:r.id,destinationId:r.destinationId,sourceId:r.sourceId,status:r.status,version:r.version,
 requestedBy:r.requestedBy,note:r.note,decidedBy:r.decidedBy,decisionNote:r.decisionNote,
 createdAt:r.createdAt.toISOString(),decidedAt:r.decidedAt?.toISOString()??null,
 lines:r.lines.map(l=>({id:l.id,variantId:l.variantId,quantity:l.quantity.toString()})),
 reservedBy:r.reservedBy,reservedAt:r.reservedAt?.toISOString()??null,
 reservationExpiresAt:r.reservationExpiresAt?.toISOString()??null,
 cancelledBy:r.cancelledBy,cancelledAt:r.cancelledAt?.toISOString()??null,cancellationNote:r.cancellationNote,
 dispatch:r.dispatch?{id:r.dispatch.id,dispatchedAt:r.dispatch.dispatchedAt.toISOString(),dispatchedBy:r.dispatch.dispatchedBy,handoverReference:r.dispatch.handoverReference,currency:r.dispatch.currency,totalValueMinor:r.dispatch.totalValueMinor.toString(),lots:r.dispatch.lots.map(l=>({id:l.id,lotId:l.depletionLine.lotId,variantId:l.depletionLine.variantId,quantity:l.depletionLine.quantity.toString(),lotNumber:l.lotNumber,expiryDate:l.expiryDate?.toISOString().slice(0,10)??null,unitCostMinor:l.unitCostMinor,valueMinor:l.valueMinor.toString()}))}:null,
 reservationStatus:r.status==="in_transit"?"consumed":r.status==="cancelled"?"released":r.status!=="reserved"?"none":!r.reservationExpiresAt||r.reservationExpiresAt<=now?"expired":covered?"active":"inconsistent",
 stockReserved:r.status==="reserved"&&covered&&!!r.reservationExpiresAt&&r.reservationExpiresAt>now,stockMoved:r.status==="in_transit"&&!!r.dispatch,financialPostingCreated:false,
});
@Injectable()
export class TransferRequisitionService{
 constructor(private readonly db:Database,private readonly allocation:AllocationService,private readonly depletion:StockDepletionService){}
 private async views(tx:Prisma.TransactionClient,rows:TransferRow[]){
  const now=new Date();
  const ids=rows.filter(r=>r.status==="reserved"&&r.reservationExpiresAt&&r.reservationExpiresAt>now).map(r=>r.id);
  const holds=ids.length?await tx.reservation.findMany({where:{claimType:"internal_transfer",claimId:{in:ids},state:"active",expiresAt:{gt:now}},select:{claimId:true,claimLineId:true,quantity:true,expiresAt:true,position:{select:{locationId:true,variantId:true}}}}):[];
  return rows.map(row=>{
   const matching=holds.filter(h=>h.claimId===row.id);
   const valid=row.lines.length>0&&matching.every(h=>h.position.locationId===row.sourceId&&h.expiresAt.getTime()===row.reservationExpiresAt?.getTime()&&row.lines.some(l=>l.id===h.claimLineId&&l.variantId===h.position.variantId))&&row.lines.every(l=>matching.filter(h=>h.claimLineId===l.id).reduce((sum,h)=>sum.plus(h.quantity),new Prisma.Decimal(0)).eq(l.quantity));
   return project(row,valid,now);
  });
 }
 // The same user-row lock as staff reassignment serializes grant changes.
 private async actor(tx:Prisma.TransactionClient,req:AuthRequest):Promise<TransferActor>{
  if(process.env.INTERNAL_TRANSFERS_ENABLED!=="true")throw new ApiProblem(503,"FEATURE_DISABLED","Branch transfers are not enabled.");
  await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "User" WHERE id=${req.actor.id} FOR UPDATE`;
  const user=await tx.user.findUnique({where:{id:req.actor.id},select:{id:true,role:true,active:true,locations:{where:{location:{active:true}},select:{locationId:true}}}});
  const session=await tx.session.findUnique({where:{id:req.sessionId},select:{userId:true,revokedAt:true,expiresAt:true,accessExpiresAt:true}});
  const now=new Date();
  if(!user?.active||!session||session.userId!==user.id||session.revokedAt||session.expiresAt<=now||(req.channel==="native"&&(!session.accessExpiresAt||session.accessExpiresAt<=now))||!["admin","inventory_manager"].includes(user.role))throw deny();
  return {id:user.id,role:user.role,locationIds:user.locations.map(l=>l.locationId)};
 }
 async list(req:AuthRequest){
  return this.db.$transaction(async tx=>{
   const actor=await this.actor(tx,req);
   const where:Prisma.InternalTransferRequestWhereInput=actor.role==="admin"?{}:{OR:[{destinationId:{in:[...actor.locationIds]}},{sourceId:{in:[...actor.locationIds]}}]};
   const rows=await tx.internalTransferRequest.findMany({where,include,orderBy:[{createdAt:"desc"},{id:"desc"}],take:101});
   return {items:await this.views(tx,rows.slice(0,100)),capped:rows.length>100};
  });
 }
 async options(req:AuthRequest,q:string){
  return this.db.$transaction(async tx=>{
   const actor=await this.actor(tx,req);
   const [locations,variants]=await Promise.all([
    tx.location.findMany({where:{active:true,...(actor.role==="admin"?{}:{id:{in:[...actor.locationIds]}})},select:{id:true,name:true},orderBy:[{name:"asc"},{id:"asc"}],take:101}),
    tx.variant.findMany({where:{active:true,...(q?{OR:[{name:{contains:q,mode:"insensitive"}},{sku:{contains:q,mode:"insensitive"}},{product:{name:{contains:q,mode:"insensitive"}}}]}:{})},select:{id:true,name:true,sku:true,unit:true,product:{select:{name:true}}},orderBy:[{name:"asc"},{id:"asc"}],take:101}),
   ]);
   return {role:actor.role,locations:locations.slice(0,100),locationsCapped:locations.length>100,variants:variants.slice(0,100).map(v=>({id:v.id,name:v.name,sku:v.sku,unit:v.unit,productName:v.product.name})),variantsCapped:variants.length>100};
  });
 }
 async request(req:AuthRequest,input:TransferRequestInput,key:string){
  return this.db.$transaction(async tx=>{
   const actor=await this.actor(tx,req);
   const destination=await tx.location.findUnique({where:{id:input.destinationId},select:{active:true}});
   if(!mayActOnTransfer(actor,"request",{state:null,destinationId:input.destinationId,destinationActive:destination?.active===true,sourceId:null,sourceActive:false,authorizedBy:null,dispatchedBy:null,requestedBy:null}))throw deny();
   const lines=input.lines.map(l=>({variantId:l.variantId,quantity:new Prisma.Decimal(l.quantity).toString()})).sort((a,b)=>a.variantId.localeCompare(b.variantId));
   const requestHash=tokenHash(JSON.stringify({destinationId:input.destinationId,note:input.note,lines}));
   const old=await tx.internalTransferRequest.findUnique({where:{requestedBy_requestKey:{requestedBy:actor.id,requestKey:key}},include});
   if(old){if(old.requestHash!==requestHash)throw conflict();return (await this.views(tx,[old]))[0];}
   const variants=await tx.variant.findMany({where:{id:{in:lines.map(l=>l.variantId)},active:true},select:{id:true,unit:true}});
   for(const line of lines){
    const variant=variants.find(v=>v.id===line.variantId);
    if(!variant)throw new ApiProblem(400,"VALIDATION_FAILED","Select active product variants.");
    normalizeAllocationQuantity(line.quantity,variant.unit);
   }
   const row=await tx.internalTransferRequest.create({data:{destinationId:input.destinationId,requestedBy:actor.id,requestKey:key,requestHash,note:input.note,lines:{create:lines}},include});
   await tx.auditEvent.create({data:{actorId:actor.id,requestId:req.requestId,action:"transfer.requested",entityId:row.id,details:{destinationId:row.destinationId,lineCount:lines.length}}});
   return project(row);
  });
 }
 async decide(req:AuthRequest,id:string,input:TransferDecisionInput){
  return this.db.$transaction(async tx=>{
   const actor=await this.actor(tx,req);
   if(actor.role!=="admin")throw deny();
   await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "InternalTransferRequest" WHERE id=${id} FOR UPDATE`;
   const row=await tx.internalTransferRequest.findUnique({where:{id},include});
   if(!row)throw missing();
   const sourceId=input.action==="authorize"?input.sourceId:null;
   const next=input.action==="authorize"?"authorized":"rejected";
   if(row.status===next&&row.decidedBy===actor.id&&row.sourceId===sourceId&&row.decisionNote===input.note)return project(row);
   if(row.version!==input.version||row.status!=="requested")throw conflict();
   const destination=await tx.location.findUnique({where:{id:row.destinationId},select:{active:true}});
   const source=sourceId?await tx.location.findUnique({where:{id:sourceId},select:{active:true}}):null;
   if(!mayActOnTransfer(actor,input.action,{state:"requested",destinationId:row.destinationId,destinationActive:destination?.active===true,sourceId,sourceActive:source?.active===true,authorizedBy:null,dispatchedBy:null,requestedBy:row.requestedBy}))throw conflict();
   const updated=await tx.internalTransferRequest.update({where:{id},data:{status:next,sourceId,decidedBy:actor.id,decisionNote:input.note,decidedAt:new Date(),version:{increment:1}},include});
   await tx.auditEvent.create({data:{actorId:actor.id,requestId:req.requestId,action:"transfer."+next,entityId:id,details:{destinationId:row.destinationId,sourceId,version:updated.version}}});
   return project(updated);
  });
 }
 async reserve(req:AuthRequest,id:string){
  return this.db.$transaction(async tx=>{
   const actor=await this.actor(tx,req);
   await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "InternalTransferRequest" WHERE id=${id} FOR UPDATE`;
   const row=await tx.internalTransferRequest.findUnique({where:{id},include});
   if(!row||!row.sourceId||!row.decidedBy)throw missing();
   if(actor.role!=="admin"&&!actor.locationIds.includes(row.sourceId))throw missing();
   const [source,destination]=await Promise.all([tx.location.findUnique({where:{id:row.sourceId}}),tx.location.findUnique({where:{id:row.destinationId}})]);
   if(!source?.active||!destination?.active)throw conflict();
   if(row.status==="reserved"){
    const view=(await this.views(tx,[row]))[0];
    if(!view.stockReserved)throw new ApiProblem(409,"RESERVATION_LOST","Transfer hold expired or is incomplete. Head office must cancel and issue a new requisition.");
    return view;
   }
   if(row.version!==2||row.status!=="authorized"||!mayActOnTransfer(actor,"reserve",{state:"authorized",destinationId:row.destinationId,sourceId:row.sourceId,destinationActive:true,sourceActive:true,authorizedBy:row.decidedBy,dispatchedBy:null,requestedBy:row.requestedBy}))throw conflict();
   const now=new Date(),expiresAt=new Date(now.getTime()+24*60*60*1000);
   // State and allocation commit together. Failed allocation rolls back both.
   const updated=await tx.internalTransferRequest.update({where:{id},data:{status:"reserved",version:3,reservedBy:actor.id,reservedAt:now,reservationExpiresAt:expiresAt},include});
   const allocations=await this.allocation.create(tx,{claimType:"internal_transfer",claimId:id,locationId:row.sourceId,expiresAt,actorId:actor.id,requestId:req.requestId,lines:row.lines.map(l=>({claimLineId:l.id,variantId:l.variantId,quantity:l.quantity.toString()}))});
   await tx.auditEvent.create({data:{actorId:actor.id,requestId:req.requestId,action:"transfer.reserved",entityId:id,details:{sourceId:row.sourceId,expiresAt:expiresAt.toISOString(),reservationIds:allocations.map(a=>a.reservationId)}}});
   return (await this.views(tx,[updated]))[0];
  });
 }
 async cancelReservation(req:AuthRequest,id:string,note:string){
  return this.db.$transaction(async tx=>{
   const actor=await this.actor(tx,req);
   if(actor.role!=="admin")throw deny();
   await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "InternalTransferRequest" WHERE id=${id} FOR UPDATE`;
   const row=await tx.internalTransferRequest.findUnique({where:{id},include});
   if(!row)throw missing();
   if(row.status==="cancelled"&&row.cancelledBy===actor.id&&row.cancellationNote===note)return project(row);
   if(row.status!=="reserved"||row.version!==3)throw conflict();
   const released=await this.allocation.release(tx,"internal_transfer",id,{actorId:actor.id,requestId:req.requestId});
   const updated=await tx.internalTransferRequest.update({where:{id},data:{status:"cancelled",version:4,cancelledBy:actor.id,cancelledAt:new Date(),cancellationNote:note},include});
   await tx.auditEvent.create({data:{actorId:actor.id,requestId:req.requestId,action:"transfer.cancelled",entityId:id,details:{releasedReservations:released,note}}});
   return project(updated);
  });
 }

 async dispatch(req:AuthRequest,id:string,handoverReference:string){
  return this.db.$transaction(async tx=>{
   const actor=await this.actor(tx,req);
   await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "InternalTransferRequest" WHERE id=${id} FOR UPDATE`;
   const row=await tx.internalTransferRequest.findUnique({where:{id},include});
   if(!row||!row.sourceId||!row.decidedBy)throw missing();
   if(actor.role!=="admin"&&!actor.locationIds.includes(row.sourceId))throw missing();
   if(row.status==="in_transit"&&row.dispatch?.handoverReference===handoverReference)return project(row);
   if(row.status!=="reserved"||row.version!==3||!row.reservationExpiresAt||row.reservationExpiresAt<=new Date())throw conflict();
   const [source,destination]=await Promise.all([tx.location.findUnique({where:{id:row.sourceId}}),tx.location.findUnique({where:{id:row.destinationId}})]);
   if(!mayActOnTransfer(actor,"dispatch",{state:"reserved",destinationId:row.destinationId,sourceId:row.sourceId,destinationActive:destination?.active===true,sourceActive:source?.active===true,authorizedBy:row.decidedBy,dispatchedBy:null,requestedBy:row.requestedBy}))throw conflict();
   const result=await this.depletion.consumeClaim(tx,{claimType:"internal_transfer",claimId:id,locationId:row.sourceId,kind:"transfer_dispatch",actorId:actor.id,requestId:req.requestId,lines:row.lines.map(l=>({claimLineId:l.id,variantId:l.variantId,quantity:l.quantity.toString()}))});
   const lines=await tx.stockDepletionLine.findMany({where:{depletionId:result.depletionId},include:{lot:true},orderBy:{id:"asc"}});
   if(!lines.length||result.replayed)throw conflict();
   const lots=lines.map(l=>{
    if(l.lot.unitCostMinor===null||l.lot.unitCostMinor<0)throw new ApiProblem(409,"CONFLICT","Original lot cost must be known before dispatch.");
    return {depletionLineId:l.id,lotNumber:l.lot.lotNumber,expiryDate:l.lot.expiryDate,unitCostMinor:l.lot.unitCostMinor,valueMinor:dispatchCarryingValue(l.lotQuantityBefore.toString(),l.lotQuantityAfter.toString(),l.lot.unitCostMinor)};
   });
   const totalValueMinor=lots.reduce((sum,l)=>sum+l.valueMinor,0n);
   if(totalValueMinor>9223372036854775807n)throw new ApiProblem(409,"CONFLICT","Transfer value exceeds ledger capacity.");
   await tx.internalTransferDispatch.create({data:{transferId:id,depletionId:result.depletionId,dispatchedBy:actor.id,handoverReference,totalValueMinor,lots:{create:lots}}});
   const updated=await tx.internalTransferRequest.update({where:{id},data:{status:"in_transit",version:4},include});
   await tx.auditEvent.create({data:{actorId:actor.id,requestId:req.requestId,action:"transfer.dispatched",entityId:id,details:{sourceId:row.sourceId,destinationId:row.destinationId,depletionId:result.depletionId,totalValueMinor:totalValueMinor.toString(),currency:"GHS"}}});
   return project(updated);
  });
 }


 /** Accept inspected, unexpired goods at the authorized destination. The
  * transfer remains in_transit until the independent close workflow exists. */
 async receive(req:AuthRequest,id:string,input:TransferReceiptInput,key:string){
  if(process.env.INTERNAL_TRANSFER_RECEIPTS_ENABLED!=="true")throw new ApiProblem(503,"FEATURE_DISABLED","Transfer receipts are not enabled.");
  return this.db.$transaction(async tx=>{
   const actor=await this.actor(tx,req);
   await tx.$queryRaw`SELECT id FROM "InternalTransferRequest" WHERE id=${id} FOR UPDATE`;
   const row=await tx.internalTransferRequest.findUnique({where:{id},include});
   if(!row||!row.dispatch||!row.sourceId||!row.decidedBy)throw missing();
   if(actor.role!=="admin"&&!actor.locationIds.includes(row.destinationId))throw missing();
   const [source,destination]=await Promise.all([tx.location.findUnique({where:{id:row.sourceId}}),tx.location.findUnique({where:{id:row.destinationId}})]);
   if(!mayActOnTransfer(actor,"receive",{state:row.status==="in_transit"?"in_transit":null,destinationId:row.destinationId,sourceId:row.sourceId,destinationActive:destination?.active===true,sourceActive:source?.active===true,authorizedBy:row.decidedBy,dispatchedBy:row.dispatch.dispatchedBy,requestedBy:row.requestedBy}))throw conflict();
   const lines=input.lines.map(l=>({dispatchLotId:l.dispatchLotId,quantity:new Prisma.Decimal(l.quantity).toString()})).sort((a,b)=>a.dispatchLotId.localeCompare(b.dispatchLotId));
   const requestHash=tokenHash(JSON.stringify({receiptReference:input.receiptReference,lines}));
   const projectReceipt=(r:{id:string;receiptReference:string;receivedBy:string;createdAt:Date;lines:Array<{dispatchLotId:string;destinationLotId:string;quantity:Prisma.Decimal;valueMinor:bigint;roundingMinor:bigint}>})=>({
    id:r.id,transferId:id,receiptReference:r.receiptReference,receivedBy:r.receivedBy,createdAt:r.createdAt.toISOString(),lines:r.lines.map(l=>({dispatchLotId:l.dispatchLotId,destinationLotId:l.destinationLotId,quantity:l.quantity.toString(),valueMinor:l.valueMinor.toString(),roundingMinor:l.roundingMinor.toString()})),financialPostingCreated:false,
   });
   const old=await tx.internalTransferReceipt.findUnique({where:{transferId_requestKey:{transferId:id,requestKey:key}},include:{lines:{orderBy:{dispatchLotId:"asc"}}}});
   if(old){if(old.requestHash!==requestHash||old.receivedBy!==actor.id)throw conflict();return projectReceipt(old);}
   const variantIds=[...new Set(row.dispatch.lots.map(l=>l.depletionLine.variantId))].sort();
   const variants=await tx.variant.findMany({where:{id:{in:variantIds}},select:{id:true,unit:true,active:true}});
   const prior=await tx.internalTransferReceiptLine.groupBy({by:["dispatchLotId"],where:{dispatchLotId:{in:row.dispatch.lots.map(l=>l.id)}},_sum:{quantity:true,valueMinor:true}});
   const facts=row.dispatch.lots.map(l=>{
    const v=variants.find(v=>v.id===l.depletionLine.variantId);
    if(!v)throw conflict();
    const p=prior.find(p=>p.dispatchLotId===l.id);
    return {id:l.id,variantId:v.id,unit:v.unit,lotNumber:l.lotNumber,expiryDate:l.expiryDate?.toISOString().slice(0,10)??null,dispatchedQuantity:l.depletionLine.quantity.toString(),dispatchedValueMinor:l.valueMinor.toString(),unitCostMinor:l.unitCostMinor,previouslyAcceptedQuantity:p?._sum.quantity?.toString()??"0",previouslyAcceptedValueMinor:p?._sum.valueMinor?.toString()??"0"};
   });
   let preview;
   try{preview=previewTransferReceipt(facts,lines,new Date().toISOString().slice(0,10));}catch{throw new ApiProblem(409,"CONFLICT","Receipt quantities or original valuation do not reconcile.");}
   const accepted=preview.items.filter(l=>l.receiptQuantity!=="0");
   if(accepted.some(l=>l.requiresExpiryQuarantine||!variants.find(v=>v.id===l.variantId)?.active))throw new ApiProblem(409,"CONFLICT","Expired or inactive goods require a separate quarantine or discrepancy workflow.");
   // Stable destination position lock order, compatible with allocation.
   const positions=new Map<string,string>();
   for(const variantId of [...new Set(accepted.map(l=>l.variantId))].sort()){
    const p=await tx.stockPosition.upsert({where:{variantId_locationId:{variantId,locationId:row.destinationId}},update:{},create:{variantId,locationId:row.destinationId}});
    await tx.$queryRaw`SELECT id FROM "StockPosition" WHERE id=${p.id} FOR UPDATE`;
    positions.set(variantId,p.id);
   }
   const stockReceipt=await tx.stockReceipt.create({data:{receivedBy:actor.id,note:"Internal transfer receipt; not supplier purchase."}});
   const receipt=await tx.internalTransferReceipt.create({data:{transferId:id,stockReceiptId:stockReceipt.id,receivedBy:actor.id,requestKey:key,requestHash,receiptReference:input.receiptReference}});
   for(const l of accepted){
    const lot=await tx.stockLot.create({data:{positionId:positions.get(l.variantId)!,receiptId:stockReceipt.id,lotNumber:l.lotNumber,expiryDate:l.expiryDate?new Date(l.expiryDate+"T00:00:00.000Z"):null,quantity:l.receiptQuantity,unitCostMinor:l.unitCostMinor,kind:"regular",quarantined:false}});
    await tx.stockMovement.create({data:{lotId:lot.id,receiptId:stockReceipt.id,delta:l.receiptQuantity,resultingQty:l.receiptQuantity,actorId:actor.id,reason:"internal_transfer_receipt"}});
    await tx.internalTransferReceiptLine.create({data:{receiptId:receipt.id,dispatchLotId:l.dispatchLotId,destinationLotId:lot.id,quantity:l.receiptQuantity,valueMinor:BigInt(l.receiptValueMinor),roundingMinor:BigInt(l.roundingMinor)}});
   }
   await tx.auditEvent.create({data:{actorId:actor.id,requestId:req.requestId,action:"transfer.received",entityId:id,details:{receiptId:receipt.id,receiptValueMinor:preview.receiptValueMinor,outstandingValueMinor:preview.outstandingValueMinor}}});
   const saved=await tx.internalTransferReceipt.findUniqueOrThrow({where:{id:receipt.id},include:{lines:{orderBy:{dispatchLotId:"asc"}}}});
   return projectReceipt(saved);
  },{timeout:20000});
 }
}
