import {Inject,Injectable} from "@nestjs/common";
import {createHash,randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {
  posHoldViewSchema,posHoldListSchema,
  type PosHoldCreate,type PosHoldRelease,
} from "@variety/contracts";
import {API_CONFIG,type ApiConfig} from "../config";
import {Database} from "../database/database";
import {ApiProblem} from "../http/errors";
import {AllocationService} from "../inventory/allocation.service";
import {roundLineTotalMinor,validateCheckoutLines} from "../orders/checkout.values";

type Tx=Prisma.TransactionClient;
const hash=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const lock=(actor:string,operation:string,key:string)=>JSON.stringify([actor,operation,key]);
const limit=100000000;

/** P0b2: one stock-reserved, nonfinancial cart per open till.
 * No physical handover, stock depletion, payment or order creation authority.
 */
@Injectable()
export class PosHoldsService {
  constructor(
    private readonly db:Database,
    @Inject(API_CONFIG) private readonly cfg:ApiConfig,
    private readonly allocation:AllocationService,
  ){}
  private enabled(){
    if(!this.cfg.posStockHoldsEnabled)
      throw new ApiProblem(503,"POS_HOLDS_DISABLED",
        "POS stock reservations are not activated in this environment.");
    if(!this.cfg.commerce)
      throw new ApiProblem(503,"UNAVAILABLE",
        "Commerce inventory configuration is unavailable.");
  }
  private async view(tx:Tx,id:string){
    const row=await tx.posStockHold.findUnique({where:{id},
      include:{
        cashSale:{select:{id:true}},
        lines:{orderBy:[{variantId:"asc"},{id:"asc"}]},
      }});
    if(!row)throw new ApiProblem(404,"NOT_FOUND","Reserved counter cart not found.");
    const currentlyHeld=row.status==="held"&&row.expiresAt.getTime()>Date.now();
    return posHoldViewSchema.parse({
      id:row.id,tillSessionId:row.tillSessionId,
      locationId:row.locationId,createdByUserId:row.createdByUserId,
      status:currentlyHeld?"held":row.status==="held"?"expired":row.status,
      subtotalMinor:row.subtotalMinor,
      createdAt:row.createdAt.toISOString(),expiresAt:row.expiresAt.toISOString(),
      releasedAt:row.releasedAt?.toISOString()??null,
      releaseNote:row.releaseNote,
      stockReserved:currentlyHeld,
      orderCreated:false,paymentVerified:false,
      cashSaleRecorded:row.status==="consumed"&&row.cashSale!==null,
      goodsHandedOver:row.status==="consumed"&&row.cashSale!==null,
      lines:row.lines.map(x=>({
        id:x.id,variantId:x.variantId,quantity:x.quantity.toString(),
        unitPriceMinor:x.unitPriceMinor,lineTotalMinor:x.lineTotalMinor,
      })),
    });
  }
  async detail(id:string){
    this.enabled();
    return this.view(this.db as Tx,id);
  }
  async list(){
    this.enabled();
    const rows=await this.db.posStockHold.findMany({
      orderBy:[{createdAt:"desc"},{id:"desc"}],take:50,select:{id:true},
    });
    return posHoldListSchema.parse({
      enabled:true,holds:await Promise.all(rows.map(x=>this.view(this.db as Tx,x.id))),
    });
  }
  private async replay(tx:Tx,actorId:string,operation:string,key:string,requestHash:string){
    const old=await tx.idempotency.findUnique({where:{
      actorId_operation_key:{actorId,operation,key},
    }});
    if(!old)return null;
    if(old.requestHash!==requestHash)
      throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT",
        "This key has already been used for another POS reservation.");
    const outcome=old.outcome as {holdId:string};
    return this.view(tx,outcome.holdId);
  }
  private async remember(tx:Tx,actorId:string,operation:string,key:string,requestHash:string,id:string){
    await tx.idempotency.create({data:{
      actorId,operation,key,requestHash,outcome:{holdId:id},
    }});
  }
  private async lockTill(tx:Tx,id:string){
    const [row]=await tx.$queryRaw<Array<{
      id:string;locationId:string;status:string;
    }>>`SELECT id,"locationId",status FROM "CashierTillSession"
      WHERE id=${id} FOR UPDATE`;
    if(!row)throw new ApiProblem(404,"NOT_FOUND","Cashier till not found.");
    if(row.status!=="open")throw new ApiProblem(409,"TILL_CLOSED",
      "The cashier till is closed.");
    if(row.locationId!==this.cfg.commerce!.locationId)
      throw new ApiProblem(422,"POS_LOCATION_NOT_SUPPORTED",
        "A counter hold cannot reserve another location's inventory.");
    return row;
  }
  private async expirePrevious(tx:Tx,tillId:string,actorId:string,requestId:string){
    const old=await tx.posStockHold.findFirst({
      where:{tillSessionId:tillId,status:"held"},select:{id:true,expiresAt:true},
    });
    if(!old)return;
    if(old.expiresAt.getTime()>Date.now())
      throw new ApiProblem(409,"TILL_HOLD_EXISTS",
        "Release the existing counter cart or let its reservation expire first.");
    const expired=await tx.reservation.updateMany({where:{
      claimType:"pos_draft",claimId:old.id,state:"active",
    },data:{state:"expired"}});
    await tx.posStockHold.update({where:{id:old.id},data:{
      status:"expired",releasedAt:new Date(),
      releaseNote:"Reservation reached its automatic expiry time",
    }});
    await tx.auditEvent.create({data:{
      actorId,action:"pos_hold.expired",entityId:old.id,requestId,
      details:{reservationCount:expired.count,reason:"automatic_expiry"},
    }});
    await tx.outboxEvent.create({data:{
      type:"inventory.expired",aggregateId:old.id,
      payload:{claimType:"pos_draft",claimId:old.id,reason:"automatic_expiry"},
    }});
  }
  async create(actorId:string,key:string,requestId:string,input:PosHoldCreate){
    this.enabled();
    const operation="pos-hold.create";
    const canonical={tillSessionId:input.tillSessionId,
      lines:input.lines.map(l=>({variantId:l.variantId,
        quantity:new Prisma.Decimal(l.quantity).toString()}))};
    const requestHash=hash(canonical);
    return this.db.$transaction(async tx=>{
      // Replays must resolve before we reject a till that later closed.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(
        hashtextextended(${lock(actorId,operation,key)},0))`;
      const prev=await this.replay(tx,actorId,operation,key,requestHash);
      if(prev)return prev;
      const till=await this.lockTill(tx,input.tillSessionId);
      await this.expirePrevious(tx,till.id,actorId,requestId);
      const ids=[...new Set(input.lines.map(x=>x.variantId))];
      const variants=await tx.variant.findMany({where:{
        id:{in:ids},active:true,product:{published:true,category:{active:true}},
      },include:{product:true}});
      if(variants.length!==ids.length)
        throw new ApiProblem(404,"NOT_FOUND",
          "One or more counter products are not available for sale.");
      const byId=new Map(variants.map(v=>[v.id,v]));
      validateCheckoutLines(input.lines,
        new Map(variants.map(v=>[v.id,v.unit])));
      const lines=input.lines.map(l=>{
        const v=byId.get(l.variantId)!;
        return {id:randomUUID(),variantId:v.id,
          quantity:new Prisma.Decimal(l.quantity).toString(),
          unitPriceMinor:v.priceMinor,
          lineTotalMinor:roundLineTotalMinor(v.priceMinor,l.quantity)};
      });
      const subtotal=lines.reduce((n,l)=>n+l.lineTotalMinor,0);
      if(subtotal<0||subtotal>limit)throw new ApiProblem(400,
        "VALIDATION_FAILED","Counter cart amount exceeds allowed total.");
      const now=new Date(),expiresAt=new Date(
        now.getTime()+this.cfg.posStockHoldTtlSeconds*1000);
      const holdId=randomUUID();
      // Atomic with AllocationService.create: any last-item race rolls
      // everything back; no invented payment or handover state survives.
      await tx.posStockHold.create({data:{
        id:holdId,tillSessionId:till.id,locationId:till.locationId,
        createdByUserId:actorId,subtotalMinor:subtotal,
        createdAt:now,expiresAt,
        lines:{create:lines.map(l=>({
          id:l.id,variantId:l.variantId,quantity:l.quantity,
          unitPriceMinor:l.unitPriceMinor,lineTotalMinor:l.lineTotalMinor,
        }))},
      }});
      const allocations=await this.allocation.create(tx,{
        claimType:"pos_draft",claimId:holdId,locationId:till.locationId,
        expiresAt,actorId,requestId,
        lines:lines.map(l=>({claimLineId:l.id,
          variantId:l.variantId,quantity:l.quantity})),
      });
      await tx.auditEvent.create({data:{
        actorId,action:"pos_hold.created",entityId:holdId,requestId,
        details:{tillSessionId:till.id,locationId:till.locationId,
          subtotalMinor:subtotal,expiresAt:expiresAt.toISOString(),
          allocationCount:allocations.length,noPaymentAuthority:true},
      }});
      await this.remember(tx,actorId,operation,key,requestHash,holdId);
      return this.view(tx,holdId);
    },{timeout:20000});
  }
  async release(actorId:string,id:string,key:string,requestId:string,input:PosHoldRelease){
    this.enabled();
    const operation=`pos-hold.release:${id}`,requestHash=hash({id,note:input.note});
    return this.db.$transaction(async tx=>{
      const entry=await tx.posStockHold.findUnique({
        where:{id},select:{tillSessionId:true}});
      if(!entry)throw new ApiProblem(404,"NOT_FOUND","Reserved counter cart not found.");
      // Serialise closing the till, replacing its expired hold, and releasing it.
      await tx.$queryRaw`SELECT id FROM "CashierTillSession"
        WHERE id=${entry.tillSessionId} FOR UPDATE`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(
        hashtextextended(${lock(actorId,operation,key)},0))`;
      const prev=await this.replay(tx,actorId,operation,key,requestHash);
      if(prev)return prev;
      const [locked]=await tx.$queryRaw<Array<{id:string;status:string;
        expiresAt:Date}>>`SELECT id,status,"expiresAt" FROM "PosStockHold"
        WHERE id=${id} FOR UPDATE`;
      if(!locked)throw new ApiProblem(404,"NOT_FOUND","Reserved counter cart not found.");
      if(locked.status==="consumed")
        throw new ApiProblem(409,"POS_SALE_COMPLETED",
          "This cart has already been sold and handed over; it cannot be released.");
      if(locked.status==="held"){
        const expired=locked.expiresAt.getTime()<=Date.now();
        if(expired){
          await tx.reservation.updateMany({where:{
            claimType:"pos_draft",claimId:id,state:"active",
          },data:{state:"expired"}});
        }else{
          await this.allocation.release(tx,"pos_draft",id,{actorId,requestId});
        }
        await tx.posStockHold.update({where:{id},data:{
          status:expired?"expired":"released",
          releasedAt:new Date(),releaseNote:input.note,
        }});
        await tx.auditEvent.create({data:{
          actorId,action:expired?"pos_hold.expired":"pos_hold.released",
          entityId:id,requestId,details:{note:input.note,noPaymentAuthority:true},
        }});
      }
      await this.remember(tx,actorId,operation,key,requestHash,id);
      return this.view(tx,id);
    },{timeout:20000});
  }
}
