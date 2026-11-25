import {Injectable} from "@nestjs/common";
import {Prisma} from "@prisma/client";
import {Database} from "../database/database";
import {ApiProblem} from "../http/errors";
import type {AuthRequest} from "../identity/identity.service";
import {tokenHash} from "../identity/crypto";
import {normalizeAllocationQuantity} from "../inventory/allocation.values";
import {mayActOnTransfer,type TransferActor} from "./transfer-policy";
import type {TransferRequestInput,TransferDecisionInput} from "./transfer-requisition.schemas";

const include={lines:{orderBy:{variantId:"asc" as const}}};
const deny=()=>new ApiProblem(403,"FORBIDDEN","Transfer location or action not permitted.");
const conflict=()=>new ApiProblem(409,"CONFLICT","Transfer request changed or conflicts with an earlier request.");
const missing=()=>new ApiProblem(404,"NOT_FOUND","Transfer request not found.");
const project=(r:Prisma.InternalTransferRequestGetPayload<{include:typeof include}>)=>({
 id:r.id,destinationId:r.destinationId,sourceId:r.sourceId,status:r.status,version:r.version,
 requestedBy:r.requestedBy,note:r.note,decidedBy:r.decidedBy,decisionNote:r.decisionNote,
 createdAt:r.createdAt.toISOString(),decidedAt:r.decidedAt?.toISOString()??null,
 lines:r.lines.map(l=>({id:l.id,variantId:l.variantId,quantity:l.quantity.toString()})),
 stockReserved:false,stockMoved:false,financialPostingCreated:false,
});
@Injectable()
export class TransferRequisitionService{
 constructor(private readonly db:Database){}
 // The same user-row lock as staff reassignment serializes grant changes.
 private async actor(tx:Prisma.TransactionClient,req:AuthRequest):Promise<TransferActor>{
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
   return {items:rows.slice(0,100).map(project),capped:rows.length>100};
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
   if(old){if(old.requestHash!==requestHash)throw conflict();return project(old);}
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
}
