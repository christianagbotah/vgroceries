import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { normalizeGhanaPhone } from "@variety/contracts";
import { z } from "zod";
import { Database } from "../database/database";
import { tokenHash } from "../identity/crypto";
import { ApiProblem } from "../http/errors";

export const supportCreateSchema=z.strictObject({
  name:z.string().trim().min(2).max(120),
  phone:z.string().trim().min(9).max(20),
  email:z.union([z.email().max(254),z.literal("")]).optional(),
  subject:z.enum(["order","delivery","payment","return","product","other"]),
  message:z.string().trim().min(12).max(2000),
  orderReference:z.string().trim().max(80).optional(),
  preferredContact:z.enum(["phone","email"]).default("phone"),
  consent:z.literal(true),
}).refine(v=>v.preferredContact!=="email"||Boolean(v.email),"An email is required for email contact.");
export const supportActionSchema=z.strictObject({
  status:z.enum(["open","acknowledged","in_progress","resolved","closed"]),
  note:z.string().trim().min(5).max(1000),
});
type NewCase=z.infer<typeof supportCreateSchema>;
type ChangeCase=z.infer<typeof supportActionSchema>;
@Injectable()
export class SupportService {
 constructor(private readonly db:Database) {}
 private async limit(ip:string) {
   const key=tokenHash("customer-support:"+ip);
   const rows=await this.db.$queryRaw<{attempts:number}[]>`
     INSERT INTO "LoginThrottle"(key,"windowStart",attempts)
     VALUES(${key},now(),1)
     ON CONFLICT(key) DO UPDATE SET
       attempts=CASE WHEN "LoginThrottle"."windowStart"<=now()-interval '15 minutes'
         THEN 1 ELSE "LoginThrottle".attempts+1 END,
       "windowStart"=CASE WHEN "LoginThrottle"."windowStart"<=now()-interval '15 minutes'
         THEN now() ELSE "LoginThrottle"."windowStart" END
     RETURNING attempts`;
   if(rows[0]?.attempts>4)throw new ApiProblem(429,"RATE_LIMITED","Too many support requests. Please try again later.");
 }
 async create(body:NewCase,ip:string,requestId:string){
   await this.limit(ip);
   const phone=normalizeGhanaPhone(body.phone);
   if(!phone)throw new ApiProblem(400,"VALIDATION_FAILED","Enter a valid Ghana contact phone number.");
   const reference="VGHELP-"+randomBytes(7).toString("hex").toUpperCase();
   const row=await this.db.$transaction(async tx=>{
     const record=await tx.customerSupportCase.create({
       data:{reference,name:body.name,phone,email:body.email||null,
         subject:body.subject,message:body.message,
         orderReference:body.orderReference||null,preferredContact:body.preferredContact},
       select:{id:true,reference:true,createdAt:true,status:true},
     });
     await tx.customerSupportActivity.create({data:{caseId:record.id,action:"requested"}});
     await tx.auditEvent.create({
       data:{actorId:"public_guest",action:"support.case_submitted",entityId:record.id,requestId,
         details:{subject:body.subject,preferredContact:body.preferredContact,consentRecorded:true}},
     });
     return record;
   },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});
   return {reference:row.reference,status:row.status,createdAt:row.createdAt.toISOString(),
     note:"Request recorded. This does not mean a call or message has been sent."};
 }
 async list(status?:string){
   if(status&&!["open","acknowledged","in_progress","resolved","closed"].includes(status))
     throw new ApiProblem(400,"VALIDATION_FAILED","Unsupported support status.");
   const rows=await this.db.customerSupportCase.findMany({
     where:status?{status}:undefined,
     orderBy:[{createdAt:"desc"},{id:"desc"}],take:101,
     select:{id:true,reference:true,name:true,phone:true,email:true,subject:true,
       message:true,orderReference:true,preferredContact:true,status:true,
       createdAt:true,updatedAt:true,
       activities:{orderBy:{createdAt:"asc"},take:30,select:{action:true,privateNote:true,createdAt:true,actorId:true}}},
   });
   return {items:rows.slice(0,100),capped:rows.length>100};
 }
 async action(caseId:string,actorId:string,requestId:string,body:ChangeCase){
   return this.db.$transaction(async tx=>{
     const current=await tx.customerSupportCase.findUnique({where:{id:caseId},select:{id:true,status:true,reference:true}});
     if(!current)throw new ApiProblem(404,"NOT_FOUND","Support case not found.");
     if(current.status==="closed"&&body.status!=="closed")
       throw new ApiProblem(409,"CASE_CLOSED","A closed case requires a new support request.");
     if(current.status===body.status && body.note.length<10)
       throw new ApiProblem(400,"VALIDATION_FAILED","Explain the follow-up action.");
     await tx.customerSupportCase.update({where:{id:caseId},data:{status:body.status}});
     await tx.customerSupportActivity.create({
       data:{caseId,actorId,action:"staff_status_"+body.status,privateNote:body.note},
     });
     await tx.auditEvent.create({
       data:{actorId,action:"support.case_updated",entityId:caseId,requestId,
         details:{from:current.status,to:body.status}},
     });
     return {reference:current.reference,status:body.status};
   });
 }
}
