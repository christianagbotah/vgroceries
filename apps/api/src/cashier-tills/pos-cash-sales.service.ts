import {Inject,Injectable} from "@nestjs/common";
import {createHash,randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {
  posCashSaleListSchema,posCashSaleViewSchema,
  type PosCashSaleComplete,
} from "@variety/contracts";
import {API_CONFIG,type ApiConfig} from "../config";
import {Database} from "../database/database";
import {ApiProblem} from "../http/errors";
import {StockDepletionService} from "../inventory/stock-depletion.service";
import {renderPosCashReceiptHtml} from "./pos-receipt-html";

type Tx=Prisma.TransactionClient;
const hash=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const keyName=(actor:string,op:string,key:string)=>JSON.stringify([actor,op,key]);
const maxCash=100000000;

/** Cash only, counted and attested by staff. No electronic payment,
 * online Order, tax invoice, discount, return or refund authority.
 */
@Injectable()
export class PosCashSalesService {
  constructor(
    private readonly db:Database,
    @Inject(API_CONFIG) private readonly cfg:ApiConfig,
    private readonly depletion:StockDepletionService,
  ){}
  private ensureOn(){
    if(!this.cfg.posCashSalesEnabled)
      throw new ApiProblem(503,"POS_CASH_SALES_DISABLED",
        "Physical cash sales are not activated in this environment.");
    if(!this.cfg.commerce)
      throw new ApiProblem(503,"UNAVAILABLE",
        "Commerce inventory configuration is unavailable.");
  }
  private async view(tx:Tx,id:string){
    const row=await tx.posCashSale.findUnique({
      where:{id},
      include:{hold:{include:{lines:{orderBy:[{variantId:"asc"},{id:"asc"}]}}}},
    });
    if(!row)throw new ApiProblem(404,"NOT_FOUND","Counter cash sale not found.");
    return posCashSaleViewSchema.parse({
      id:row.id,reference:row.reference,holdId:row.holdId,
      tillSessionId:row.tillSessionId,locationId:row.locationId,
      soldByUserId:row.soldByUserId,stockDepletionId:row.stockDepletionId,
      customerMode:row.customerMode,customerUserId:row.customerUserId,
      customerName:row.customerName,
      subtotalMinor:row.subtotalMinor,cashReceivedMinor:row.cashReceivedMinor,
      changeGivenMinor:row.changeGivenMinor,paymentMethod:"cash",
      cashCountConfirmed:row.cashCountConfirmed,
      goodsHandedOver:row.goodsHandedOver,handoverNote:row.handoverNote,
      createdAt:row.createdAt.toISOString(),
      taxInvoiceIssued:false,electronicPaymentVerified:false,
      lines:row.hold.lines.map(l=>({
        variantId:l.variantId,quantity:l.quantity.toString(),
        unitPriceMinor:l.unitPriceMinor,lineTotalMinor:l.lineTotalMinor,
      })),
    });
  }
  async detail(id:string){this.ensureOn();return this.view(this.db as Tx,id);}
  async printReceipt(id:string){
    this.ensureOn();
    const row=await this.db.posCashSale.findUnique({
      where:{id},include:{
        till:{select:{tillCode:true}},
        receiptLines:{orderBy:[{variantId:"asc"},{id:"asc"}]},
      },
    });
    if(!row)throw new ApiProblem(404,"NOT_FOUND","Counter cash sale not found.");
    if(row.receiptLines.length===0)
      throw new ApiProblem(409,"POS_RECEIPT_SNAPSHOT_UNAVAILABLE",
        "This historical sale predates immutable product descriptions; do not print an inaccurate receipt.");
    return renderPosCashReceiptHtml({
      reference:row.reference,tillCode:row.till.tillCode,
      customerName:row.customerName,
      createdAt:row.createdAt,subtotalMinor:row.subtotalMinor,
      cashReceivedMinor:row.cashReceivedMinor,
      changeGivenMinor:row.changeGivenMinor,
      lines:row.receiptLines.map(l=>({
        productName:l.productName,variantName:l.variantName,unit:l.unit,
        quantity:l.quantity.toString(),unitPriceMinor:l.unitPriceMinor,
        lineTotalMinor:l.lineTotalMinor,
      })),
    });
  }
  async list(){
    this.ensureOn();
    const rows=await this.db.posCashSale.findMany({
      orderBy:[{createdAt:"desc"},{id:"desc"}],
      take:50,select:{id:true},
    });
    return posCashSaleListSchema.parse({
      enabled:true,sales:await Promise.all(rows.map(x=>this.view(this.db as Tx,x.id))),
    });
  }
  async complete(actorId:string,key:string,requestId:string,input:PosCashSaleComplete){
    this.ensureOn();
    if(input.cashCountConfirmed!==true||input.goodsHandedOver!==true||
      !Number.isSafeInteger(input.cashReceivedMinor)||
      input.cashReceivedMinor<0||input.cashReceivedMinor>maxCash||
      input.handoverNote.trim().length<10||
      input.handoverNote.trim().length>400)
      throw new ApiProblem(400,"VALIDATION_FAILED",
        "Full cash counting, physical handover and recorded evidence are required.");
    const operation="pos-cash-sale.complete";
    const canonical={
      ...input,handoverNote:input.handoverNote.trim(),
      ...(input.customerName ? { customerName: input.customerName.trim() } : {}),
    };
    const requestHash=hash(canonical);
    return this.db.$transaction(async tx=>{
      // One source hold belongs to one till. Lock till first to serialize
      // its closure, cash drops, other sales and hold release.
      const source=await tx.posStockHold.findUnique({
        where:{id:input.holdId},select:{tillSessionId:true},
      });
      if(!source)throw new ApiProblem(404,"NOT_FOUND","Counter cart not found.");
      const [till]=await tx.$queryRaw<Array<{
        id:string;locationId:string;status:string;openingFloatMinor:number;
      }>>`SELECT id,"locationId",status,"openingFloatMinor"
        FROM "CashierTillSession" WHERE id=${source.tillSessionId} FOR UPDATE`;
      if(!till)throw new ApiProblem(404,"NOT_FOUND","Counter till not found.");
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(
        hashtextextended(${keyName(actorId,operation,key)},0))`;
      const prior=await tx.idempotency.findUnique({where:{
        actorId_operation_key:{actorId,operation,key},
      }});
      if(prior){
        if(prior.requestHash!==requestHash)
          throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT",
            "A different counter sale already used this request key.");
        const outcome=prior.outcome as {saleId:string};
        return this.view(tx,outcome.saleId);
      }
      if(till.status!=="open")
        throw new ApiProblem(409,"TILL_CLOSED","The till has already closed.");
      if(till.locationId!==this.cfg.commerce!.locationId)
        throw new ApiProblem(422,"POS_LOCATION_NOT_SUPPORTED",
          "Counter cash sales require the configured inventory location.");
      const [locked]=await tx.$queryRaw<Array<{
        id:string;status:string;locationId:string;
        expiresAt:Date;subtotalMinor:number;tillSessionId:string;
      }>>`SELECT id,status,"locationId","expiresAt","subtotalMinor","tillSessionId"
        FROM "PosStockHold" WHERE id=${input.holdId} FOR UPDATE`;
      if(!locked)throw new ApiProblem(404,"NOT_FOUND","Counter cart not found.");
      if(locked.status!=="held"||locked.expiresAt.getTime()<=Date.now())
        throw new ApiProblem(409,"POS_HOLD_NOT_ACTIVE",
          "This counter cart has expired, been released or already sold.");
      if(locked.locationId!==till.locationId||
        locked.tillSessionId!==till.id)
        throw new ApiProblem(409,"POS_HOLD_SOURCE_MISMATCH",
          "Counter cart and till do not share the same location.");
      const lines=await tx.posStockHoldLine.findMany({
        where:{holdId:input.holdId},orderBy:[{variantId:"asc"},{id:"asc"}],
      });
      if(!lines.length||lines.length>100)
        throw new ApiProblem(409,"POS_HOLD_LINES_INVALID",
          "Counter cart requires original reserved stock lines.");
      // Freeze catalog prices through commit. If price or publication
      // changed after the quote, require new consent and a new cart.
      type CatalogRow={
        id:string;priceMinor:number;variantActive:boolean;
        productPublished:boolean;categoryActive:boolean;
        productName:string;variantName:string;unit:string;
      };
      const current=new Map<string,CatalogRow>();
      for(const line of lines){
        const [row]=await tx.$queryRaw<CatalogRow[]>`SELECT
          v.id,v."priceMinor",v.name AS "variantName",v.unit,
          p.name AS "productName",v.active AS "variantActive",
          p.published AS "productPublished",c.active AS "categoryActive"
          FROM "Variant" v JOIN "Product" p ON p.id=v."productId"
          JOIN "Category" c ON c.id=p."categoryId"
          WHERE v.id=${line.variantId} FOR SHARE OF v,p,c`;
        if(row)current.set(row.id,row);
      }
      for(const line of lines){
        const item=current.get(line.variantId);
        if(!item||!item.variantActive||!item.productPublished||
          !item.categoryActive||item.priceMinor!==line.unitPriceMinor)
          throw new ApiProblem(409,"POS_PRICE_CHANGED",
            "Product price or selling eligibility changed. Release the cart and re-quote.");
      }
      const amount=lines.reduce((n,l)=>n+l.lineTotalMinor,0);
      if(amount<=0||amount>maxCash||amount!==locked.subtotalMinor)
        throw new ApiProblem(409,"POS_TOTAL_CHANGED",
          "The original server-priced cart total is inconsistent.");
      if(input.cashReceivedMinor<amount)
        throw new ApiProblem(422,"POS_CASH_INSUFFICIENT",
          "Counted customer cash must cover the full sale amount.");
      const change=input.cashReceivedMinor-amount;
      if(change<0||change>maxCash)
        throw new ApiProblem(422,"POS_CHANGE_INVALID",
          "Customer change calculation is out of range.");
      // Resolve registered customer from current database authority; never
      // accept client-supplied names to impersonate an existing account.
      // Anonymous/name-only walk-ins do not create User rows.
      const customerMode = input.customerMode ?? "walk_in";
      let customerUserId: string | null = null;
      let customerName = "Walk-in Customer";
      let customerPhone: string | null = null;
      if (customerMode === "existing") {
        const selected = await tx.user.findUnique({
          where: { id: input.customerUserId! },
          select: { id: true, name: true, phone: true, active: true, role: true },
        });
        if (!selected || !selected.active || selected.role !== "customer")
          throw new ApiProblem(422, "POS_CUSTOMER_NOT_FOUND",
            "Select an active registered customer or switch to Walk-in Customer.");
        customerUserId = selected.id;
        customerName = selected.name;
        customerPhone = selected.phone || null;
      } else if (customerMode === "named") {
        customerName = input.customerName?.trim() ?? "";
        if (customerName.length < 2 || customerName.length > 120)
          throw new ApiProblem(422, "VALIDATION_FAILED",
            "Enter a customer name of 2 to 120 characters.");
      }

      // Stock consumption, cash-sale receipt, till total and source state
      // must all commit together. Any failure rolls back physical depletion.
      const depleted=await this.depletion.consumeClaim(tx,{
        claimType:"pos_draft",claimId:locked.id,
        locationId:locked.locationId,kind:"pos_handover",
        actorId,requestId,
        lines:lines.map(l=>({
          claimLineId:l.id,variantId:l.variantId,
          quantity:l.quantity.toString(),
        })),
      });
      if(depleted.replayed)throw new ApiProblem(409,"POS_ALREADY_SOLD",
        "This counter cart was already handed over.");
      const sale=await tx.posCashSale.create({data:{
        reference:`VG-POS-${randomUUID().replaceAll("-","").slice(0,12).toUpperCase()}`,
        holdId:locked.id,tillSessionId:till.id,locationId:locked.locationId,
        soldByUserId:actorId,stockDepletionId:depleted.depletionId,
        customerMode,customerUserId,customerName,customerPhone,
        subtotalMinor:amount,cashReceivedMinor:input.cashReceivedMinor,
        changeGivenMinor:change,
        cashCountConfirmed:true,goodsHandedOver:true,
        handoverNote:canonical.handoverNote,
      }});
      // Immutable product labels live in the same transaction as the sale.
      // Reprints never look up product names from a subsequently changed catalog.
      await tx.posCashReceiptLine.createMany({data:lines.map(l=>{
        const catalog=current.get(l.variantId)!;
        return {
          saleId:sale.id,holdLineId:l.id,variantId:l.variantId,
          productName:catalog.productName,variantName:catalog.variantName,
          unit:catalog.unit,quantity:l.quantity,
          unitPriceMinor:l.unitPriceMinor,lineTotalMinor:l.lineTotalMinor,
        };
      })});
      await tx.posStockHold.update({where:{id:locked.id},data:{
        status:"consumed",
      }});
      await tx.auditEvent.create({data:{
        actorId,action:"pos_cash_sale.completed",
        entityId:sale.id,requestId,
        details:{holdId:locked.id,tillSessionId:till.id,locationId:till.locationId,
          subtotalMinor:amount,cashReceivedMinor:input.cashReceivedMinor,
          changeGivenMinor:change,stockDepletionId:depleted.depletionId,
          handoverConfirmed:true,method:"cash",taxInvoiceIssued:false,
          customerMode,customerUserId},
      }});
      await tx.outboxEvent.create({data:{
        type:"pos.cash_sale.completed",aggregateId:sale.id,
        payload:{saleId:sale.id,reference:sale.reference,
          tillSessionId:till.id,locationId:till.locationId,
          amountMinor:amount,method:"cash"},
      }});
      await tx.idempotency.create({data:{
        actorId,operation,key,requestHash,outcome:{saleId:sale.id},
      }});
      return this.view(tx,sale.id);
    },{timeout:20000});
  }
}
