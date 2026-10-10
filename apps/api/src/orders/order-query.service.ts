import { Injectable } from "@nestjs/common";
import type { AccountOrderRow, PublicOrder } from "@variety/contracts";
import type { CheckoutPrincipal } from "../commerce-identity/checkout-principal.service";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { tokenHash } from "../identity/crypto";
import { OrderProjectionService } from "./order-projection.service";
import { TrackingThrottleService } from "./tracking-throttle.service";
import { VerificationCodeService } from "./verification-code.service";
const forbidden=()=>new ApiProblem(403,"FORBIDDEN","Order tracking details could not be verified.");
const money=(n:number)=>`₵${(n/100).toFixed(2)}`;
@Injectable()
export class OrderQueryService {
 constructor(private readonly db:Database,private readonly projection:OrderProjectionService,private readonly throttle:TrackingThrottleService,private readonly verification:VerificationCodeService){}
 async status(principal:CheckoutPrincipal,orderId:string):Promise<PublicOrder>{const o=await this.db.order.findUnique({where:{id:orderId},select:{id:true,customerUserId:true,guestSessionId:true}});const owned=!!o&&(principal.kind==="customer"?o.customerUserId===principal.userId:o.guestSessionId===principal.guestSessionId);if(!owned)throw new ApiProblem(404,"NOT_FOUND","Order not found.");return this.projection.publicOrder(orderId);}
 async listCustomer(userId:string,page:number,perPage:number):Promise<AccountOrderRow[]>{const rows=await this.db.order.findMany({where:{customerUserId:userId},orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*perPage,take:perPage,include:{_count:{select:{lines:true}}}});return rows.map(o=>({id:o.id,reference:o.reference,totalLabel:money(o.totalMinor),fulfilmentStatus:o.fulfilmentStatus,paymentStatus:o.paymentStatus,fulfilment:o.fulfilment,createdAtLabel:o.createdAt.toISOString(),lineCount:o._count.lines}));}
 async track(reference:string,code:string,clientKey:string,requestId:string):Promise<PublicOrder>{const normalized=reference.trim().toUpperCase();const o=await this.db.order.findUnique({where:{reference:normalized}});if(o&&this.verification.verify(o.id,code,o.verificationKeyVersion,o.verificationCodeHash))return this.projection.publicOrder(o.id);const referenceHash=tokenHash(normalized),clientHash=tokenHash(clientKey);try{await this.throttle.registerFailure(clientKey,normalized);}catch(error){if(error instanceof ApiProblem&&error.getStatus()===429)await this.db.auditEvent.create({data:{actorId:"public-tracking",action:"security.order_track_failed",entityId:referenceHash,requestId,details:{referenceHash,clientHash,outcome:"rate_limited"}}});throw error;}await this.db.auditEvent.create({data:{actorId:"public-tracking",action:"security.order_track_failed",entityId:referenceHash,requestId,details:{referenceHash,clientHash,outcome:"denied"}}});throw forbidden();}
}