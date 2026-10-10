import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { CompleteOrderRequest, CompleteOrderResponse, GuestAddressInput } from "@variety/contracts";
import { API_CONFIG, ApiConfig } from "../config";
import { Database } from "../database/database";
import { AllocationService } from "../inventory/allocation.service";
import { DeliveryConfigService } from "../delivery-config/delivery-config.service";
import { ApiProblem, ApiRequest } from "../http/errors";
import { checkoutRequestHash, roundLineTotalMinor, validateCheckoutContact, validateCheckoutLines } from "./checkout.values";
import { VerificationCodeService } from "./verification-code.service";
import type { CheckoutPrincipal } from "./checkout-principal.service";

const electronic = new Set(["mobile_money","card_hosted","bank_transfer"]);
@Injectable()
export class CheckoutCommandService {
  constructor(private readonly db:Database,@Inject(API_CONFIG) private readonly config:ApiConfig,private readonly allocation:AllocationService,private readonly delivery:DeliveryConfigService,private readonly verification:VerificationCodeService) {}
  private commerce(){ if(!this.config.commerce) throw new ApiProblem(503,"UNAVAILABLE","Commerce is not configured."); return this.config.commerce; }
  private async replay(tx:Prisma.TransactionClient,actorScope:string,key:string,hash:string):Promise<CompleteOrderResponse|null>{
    const row=await tx.idempotency.findUnique({where:{actorId_operation_key:{actorId:actorScope,operation:"checkout.complete",key}}});
    if(!row)return null; if(row.requestHash!==hash)throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","Idempotency key was already used with different checkout input.");
    const o=row.outcome as {orderId:string;reference:string;paymentRequired:boolean;verificationKeyVersion:number};
    return {orderId:o.orderId,reference:o.reference,paymentRequired:o.paymentRequired,verificationCode:this.verification.codeFor(o.orderId,o.verificationKeyVersion)};
  }
  async complete(req:ApiRequest,principal:CheckoutPrincipal,input:CompleteOrderRequest,key:string):Promise<CompleteOrderResponse>{
    const commerce=this.commerce(); validateCheckoutContact(input);
    if(principal.kind==="customer" && input.customerId && input.customerId!==principal.userId) throw new ApiProblem(403,"FORBIDDEN","Customer ownership does not match authenticated identity.");
    if(principal.kind==="guest" && input.customerId) throw new ApiProblem(403,"FORBIDDEN","Guest checkout cannot claim a customer identity.");
    const hash=checkoutRequestHash(input);
    return this.db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([principal.actorScope,"checkout.complete",key])},0))`;
      const replay=await this.replay(tx,principal.actorScope,key,hash); if(replay)return replay;
      const location=await tx.location.findUnique({where:{id:commerce.locationId},select:{active:true}});
      if(!location?.active) throw new ApiProblem(503,"UNAVAILABLE","Commerce stock location is unavailable.");
      const ids=[...new Set(input.lines.map(x=>x.variantId))];
      const variants=await tx.variant.findMany({where:{id:{in:ids},active:true,product:{published:true,category:{active:true}}},include:{product:true}});
      if(variants.length!==ids.length)throw new ApiProblem(404,"NOT_FOUND","One or more products are unavailable.");
      const byId=new Map(variants.map(v=>[v.id,v])); validateCheckoutLines(input.lines,new Map(variants.map(v=>[v.id,v.unit])));
      let zone:null|Awaited<ReturnType<DeliveryConfigService["requireZone"]>>=null; let address:GuestAddressInput|null=null;
      if(input.fulfilment==="collection"){
        if(input.zoneId||input.slotId||input.addressId||input.guestAddress)throw new ApiProblem(400,"VALIDATION_FAILED","Collection checkout cannot include delivery configuration.");
        if(input.paymentMethod==="cash_on_delivery")throw new ApiProblem(400,"VALIDATION_FAILED","Cash on delivery requires delivery fulfilment.");
      }else{
        if(!input.zoneId)throw new ApiProblem(400,"VALIDATION_FAILED","Delivery zone is required."); zone=await this.delivery.requireZone(tx,input.zoneId);
        if(input.paymentMethod==="cash_counter")throw new ApiProblem(400,"VALIDATION_FAILED","Cash counter payment requires collection.");
        if(input.paymentMethod==="cash_on_delivery"&&!zone.codEnabled)throw new ApiProblem(400,"VALIDATION_FAILED","Cash on delivery is unavailable for this zone.");
        if(zone.slotPolicy==="required"&&!input.slotId)throw new ApiProblem(400,"VALIDATION_FAILED","A delivery slot is required for this zone.");
        if(zone.slotPolicy==="none"&&input.slotId)throw new ApiProblem(400,"VALIDATION_FAILED","This zone does not accept delivery slots.");
        if(Boolean(input.addressId)===Boolean(input.guestAddress))throw new ApiProblem(400,"VALIDATION_FAILED","Exactly one delivery address source is required.");
        if(input.addressId){
          if(principal.kind!=="customer")throw new ApiProblem(403,"FORBIDDEN","Guest checkout cannot use a saved customer address.");
          const saved=await tx.customerAddress.findUnique({where:{id:input.addressId}}); if(!saved)throw new ApiProblem(404,"NOT_FOUND","Delivery address not found."); if(saved.userId!==principal.userId)throw new ApiProblem(403,"FORBIDDEN","Delivery address belongs to another customer.");
          address={label:saved.label,recipientName:saved.recipientName,phone:saved.phone,locality:saved.locality,street:saved.street,landmark:saved.landmark??undefined,ghanaPostGps:saved.ghanaPostGps??undefined};
        }else address=input.guestAddress!;
      }
      const lines=input.lines.map(line=>{const v=byId.get(line.variantId)!;return {id:randomUUID(),variantId:v.id,productId:v.productId,productName:v.product.name,variantName:v.name,unit:v.unit,quantity:new Prisma.Decimal(line.quantity).toString(),unitPriceMinor:v.priceMinor,lineTotalMinor:roundLineTotalMinor(v.priceMinor,line.quantity)};});
      const subtotalMinor=lines.reduce((n,l)=>n+l.lineTotalMinor,0); const deliveryFeeMinor=zone?.feeMinor??0;
      if(zone&&subtotalMinor<zone.minimumOrderMinor)throw new ApiProblem(422,"RULE_VIOLATION","Delivery minimum order has not been met.",{minimumOrderMinor:zone.minimumOrderMinor,subtotalMinor});
      const orderId=randomUUID(); const reference=`VG-${randomUUID().replaceAll("-","").slice(0,12).toUpperCase()}`; const keyVersion=commerce.verificationActiveKeyVersion; const code=this.verification.codeFor(orderId,keyVersion); const codeHash=this.verification.digestFor(orderId,code,keyVersion); const paymentRequired=electronic.has(input.paymentMethod); const expiryMinutes=paymentRequired?commerce.paymentHoldMinutes:commerce.offlineHoldMinutes; const expiresAt=new Date(Date.now()+expiryMinutes*60000);
      await tx.order.create({data:{id:orderId,reference,customerUserId:principal.kind==="customer"?principal.userId:null,guestSessionId:principal.kind==="guest"?principal.guestSessionId:null,customerName:input.customerName.trim(),customerPhone:input.customerPhone.replace(/[\s-]/g,""),customerEmail:input.customerEmail?.trim().toLowerCase(),fulfilment:input.fulfilment,zoneId:zone?.id,slotId:input.slotId,paymentMethod:input.paymentMethod,paymentStatus:paymentRequired?"pending":"unpaid",fulfilmentStatus:"awaiting_confirmation",deliveryStatus:"unassigned",subtotalMinor,discountMinor:0,deliveryFeeMinor,totalMinor:subtotalMinor+deliveryFeeMinor,verificationKeyVersion:keyVersion,verificationCodeHash:codeHash,note:input.note?.trim()||null,lines:{create:lines.map(l=>({...l,id:l.id}))}}});
      if(address)await tx.orderDeliveryAddress.create({data:{orderId,label:address.label?.trim()||"Delivery",recipientName:address.recipientName.trim(),phone:address.phone.replace(/[\s-]/g,""),locality:address.locality.trim(),street:address.street.trim(),landmark:address.landmark?.trim()||null,ghanaPostGps:address.ghanaPostGps?.trim().toUpperCase()||null}});
      await this.allocation.create(tx,{claimType:"order",claimId:orderId,locationId:commerce.locationId,expiresAt,actorId:principal.actorId,requestId:req.requestId,lines:lines.map(l=>({claimLineId:l.id,variantId:l.variantId,quantity:l.quantity}))});
      if(input.slotId)await this.delivery.lockAndBookSlot(tx,{orderId,zoneId:zone!.id,slotId:input.slotId,now:new Date()},{actorId:principal.actorId,requestId:req.requestId});
      await tx.orderEvent.create({data:{orderId,actorKind:principal.kind,actorId:principal.actorId,action:"order.created",toStatus:"awaiting_confirmation",note:input.note?.trim()||null,customerSafe:true}});
      await tx.auditEvent.create({data:{actorId:principal.actorId,action:"order.created",entityId:orderId,requestId:req.requestId,details:{reference,fulfilment:input.fulfilment,paymentMethod:input.paymentMethod,variantIds:lines.map(l=>l.variantId)}}});
      await tx.outboxEvent.create({data:{type:"order.created",aggregateId:orderId,payload:{orderId,reference,fulfilment:input.fulfilment,paymentMethod:input.paymentMethod}}});
      await tx.idempotency.create({data:{actorId:principal.actorScope,operation:"checkout.complete",key,requestHash:hash,outcome:{orderId,reference,paymentRequired,verificationKeyVersion:keyVersion}}});
      return {orderId,reference,verificationCode:code,paymentRequired};
    },{timeout:15000});
  }
}
