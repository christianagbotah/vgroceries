import {Inject,Injectable} from "@nestjs/common";
import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {API_CONFIG,type ApiConfig} from "../config";
import {Database} from "../database/database";
import {ApiProblem} from "../http/errors";
import {
  cashierTillSessionViewSchema,cashierTillListSchema,
  type CashierTillOpen,type CashierTillMove,type CashierTillClose,
} from "@variety/contracts";

type Tx=Prisma.TransactionClient;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const LIMIT=100000000;
const operationKey=(who:string,op:string,key:string)=>JSON.stringify([who,op,key]);

@Injectable()
export class CashierTillsService {
  constructor(private readonly db:Database,@Inject(API_CONFIG) private readonly cfg:ApiConfig){}
  private ensureOn(){
    if(!this.cfg.posTillFoundationEnabled)throw new ApiProblem(503,"POS_TILL_DISABLED",
      "Cashier till foundation has not been activated for this environment.");
  }
  private async expected(tx:Tx,sessionId:string,opening:number){
    const entries=await tx.cashierTillMovement.groupBy({
      by:["kind"],where:{sessionId},_sum:{amountMinor:true},
    });
    return entries.reduce((sum,x)=>sum+(x.kind==="cash_in"?1:-1)*(x._sum.amountMinor??0),opening);
  }
  private async view(tx:Tx,id:string){
    const row=await tx.cashierTillSession.findUnique({
      where:{id},include:{movements:{orderBy:[{createdAt:"asc"},{id:"asc"}]}},
    });
    if(!row)throw new ApiProblem(404,"NOT_FOUND","Till session not found.");
    const expected=await this.expected(tx,id,row.openingFloatMinor);
    return cashierTillSessionViewSchema.parse({
      id:row.id,locationId:row.locationId,tillCode:row.tillCode,
      openedByUserId:row.openedByUserId,status:row.status,
      openingFloatMinor:row.openingFloatMinor,openedAt:row.openedAt.toISOString(),
      closedAt:row.closedAt?.toISOString()??null,
      closedByUserId:row.closedByUserId,closingCountedMinor:row.closingCountedMinor,
      closingExpectedMinor:row.closingExpectedMinor,
      closingDifferenceMinor:row.closingDifferenceMinor,closeNote:row.closeNote,
      expectedDrawerOnlyMinor:expected,includesSales:false,
      movements:row.movements.map(x=>({
        id:x.id,kind:x.kind,amountMinor:x.amountMinor,note:x.note,
        actorUserId:x.actorUserId,createdAt:x.createdAt.toISOString(),
      })),
    });
  }
  async list(){
    const rows=await this.db.cashierTillSession.findMany({
      orderBy:[{openedAt:"desc"},{id:"desc"}],take:50,select:{id:true},
    });
    return cashierTillListSchema.parse({
      enabled:this.cfg.posTillFoundationEnabled,includesSales:false,
      sessions:await Promise.all(rows.map(r=>this.view(this.db as Tx,r.id))),
    });
  }
  async detail(id:string){return this.view(this.db as Tx,id);}
  private async replay(tx:Tx,actorId:string,operation:string,key:string,hash:string){
    const prev=await tx.idempotency.findUnique({where:{
      actorId_operation_key:{actorId,operation,key},
    }});
    if(!prev)return null;
    if(prev.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT",
      "A different till operation already uses that request key.");
    return cashierTillSessionViewSchema.parse(prev.outcome);
  }
  private async remember(tx:Tx,actorId:string,operation:string,key:string,hash:string,outcome:unknown){
    await tx.idempotency.create({data:{
      actorId,operation,key,requestHash:hash,outcome:outcome as Prisma.InputJsonValue,
    }});
  }
  async open(actorId:string,key:string,requestId:string,input:CashierTillOpen){
    this.ensureOn();
    const operation="pos-till.open",hash=digest(input);
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${operationKey("till",input.locationId,input.tillCode)},0))`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${operationKey(actorId,operation,key)},0))`;
      const prev=await this.replay(tx,actorId,operation,key,hash);
      if(prev)return prev;
      const location=await tx.location.findUnique({where:{id:input.locationId}});
      if(!location?.active)throw new ApiProblem(422,"POS_LOCATION_INVALID","Till location must be active.");
      const present=await tx.cashierTillSession.findFirst({
        where:{locationId:input.locationId,tillCode:input.tillCode,status:"open"},select:{id:true},
      });
      if(present)throw new ApiProblem(409,"TILL_ALREADY_OPEN","This till already has an open session.");
      const row=await tx.cashierTillSession.create({data:{
        locationId:input.locationId,tillCode:input.tillCode,
        openedByUserId:actorId,openingFloatMinor:input.openingFloatMinor,
      }});
      const outcome=await this.view(tx,row.id);
      await tx.auditEvent.create({data:{
        actorId,action:"pos_till.opened",entityId:row.id,requestId,
        details:{locationId:input.locationId,tillCode:input.tillCode,
          openingFloatMinor:input.openingFloatMinor,includesSales:false},
      }});
      await this.remember(tx,actorId,operation,key,hash,outcome);
      return outcome;
    },{timeout:15000});
  }
  async move(actorId:string,id:string,key:string,requestId:string,input:CashierTillMove){
    this.ensureOn();
    const operation=`pos-till.movement:${id}`,hash=digest({id,...input});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "CashierTillSession" WHERE id=${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${operationKey(actorId,operation,key)},0))`;
      const prev=await this.replay(tx,actorId,operation,key,hash);if(prev)return prev;
      const row=await tx.cashierTillSession.findUnique({where:{id}});
      if(!row)throw new ApiProblem(404,"NOT_FOUND","Till session not found.");
      if(row.status!=="open")throw new ApiProblem(409,"TILL_CLOSED","This till is already closed.");
      const previous=await this.expected(tx,id,row.openingFloatMinor);
      const next=previous+(input.kind==="cash_in"?input.amountMinor:-input.amountMinor);
      if(next<0||next>LIMIT)throw new ApiProblem(409,"TILL_BALANCE_INVALID",
        "Cash movements cannot overdraw or exceed the permitted drawer limit.");
      await tx.cashierTillMovement.create({data:{
        sessionId:id,kind:input.kind,amountMinor:input.amountMinor,
        note:input.note,actorUserId:actorId,
      }});
      const outcome=await this.view(tx,id);
      await tx.auditEvent.create({data:{
        actorId,action:"pos_till.movement",entityId:id,requestId,
        details:{kind:input.kind,amountMinor:input.amountMinor,
          note:input.note,expectedDrawerOnlyMinor:next,includesSales:false},
      }});
      await this.remember(tx,actorId,operation,key,hash,outcome);
      return outcome;
    },{timeout:15000});
  }
  async close(actorId:string,id:string,key:string,requestId:string,input:CashierTillClose){
    this.ensureOn();
    const operation=`pos-till.close:${id}`,hash=digest({id,...input});
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "CashierTillSession" WHERE id=${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${operationKey(actorId,operation,key)},0))`;
      const prev=await this.replay(tx,actorId,operation,key,hash);if(prev)return prev;
      const row=await tx.cashierTillSession.findUnique({where:{id}});
      if(!row)throw new ApiProblem(404,"NOT_FOUND","Till session not found.");
      if(row.status!=="open")throw new ApiProblem(409,"TILL_CLOSED","Till session is already closed.");
      const expected=await this.expected(tx,id,row.openingFloatMinor);
      await tx.cashierTillSession.update({where:{id},data:{
        status:"closed",closedAt:new Date(),closedByUserId:actorId,
        closingCountedMinor:input.countedCashMinor,closingExpectedMinor:expected,
        closingDifferenceMinor:input.countedCashMinor-expected,closeNote:input.note,
      }});
      const outcome=await this.view(tx,id);
      await tx.auditEvent.create({data:{
        actorId,action:"pos_till.drawer_closed",entityId:id,requestId,
        details:{countedCashMinor:input.countedCashMinor,expectedDrawerOnlyMinor:expected,
          drawerDifferenceMinor:input.countedCashMinor-expected,
          includesSales:false,notBusinessReconciliation:true},
      }});
      await this.remember(tx,actorId,operation,key,hash,outcome);
      return outcome;
    },{timeout:15000});
  }
}
