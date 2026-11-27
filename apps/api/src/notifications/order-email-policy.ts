import { customerDestinationFingerprint } from "./customer-message-crypto";
import { canStageCustomerDelivery } from "./customer-delivery-eligibility";
import { customerMessage, type CustomerMessageEvent } from "./customer-channel-policy";
import { orderCreatedPaymentInstruction } from "./order-sms-recipient-policy";
import { smsStageEvents } from "./order-sms-staging-policy";
import { paymentStatusTemplates } from "./order-sms-payment-evidence";

export const emailStageEvents = smsStageEvents;
const templates = new Set<string>(["order.created","payment.succeeded",...paymentStatusTemplates,"fulfilment.confirmed","fulfilment.picking_started","fulfilment.packed","fulfilment.handed_over","refund.succeeded","delivery.out_for_delivery","delivery.delivered","delivery.failed","order.cancelled"]);
type Consent={orderId:string;recipientFingerprint:string;policyVersion:string;recordedAt:Date;verifiedAt:Date|null;revokedAt:Date|null};
export const orderEmailMaxAgeMs=24*60*60*1000;

export function normalizeOrderEmail(value:string|null|undefined):string|null {
 if(typeof value!=="string")return null;
 const email=value.trim().toLowerCase();
 if(email.length>254||! /^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,63}$/.test(email)||email.includes(".."))return null;
 return email;
}
export function planOrderEmail(input:{
 event:{id:string;type:string;aggregateId:string;createdAt:Date};
 order:{id:string;reference:string;customerEmail:string|null;emailConsent:Consent|null};
 enabled:boolean;evaluatedAt:Date;paymentConfirmed?:boolean;deliveryConfirmed?:boolean;refundAmountMinor?:number;
}){
 const {event,order,enabled,evaluatedAt}=input, consent=order.emailConsent;
 const email=normalizeOrderEmail(order.customerEmail);
 if(!email||!consent||consent.orderId!==order.id||event.aggregateId!==order.id||consent.policyVersion!=="order-email-v1")return null;
 if(!templates.has(event.type)||event.type.startsWith("payment.")&&input.paymentConfirmed!==true||event.type.startsWith("delivery.")&&input.deliveryConfirmed!==true)return null;
 if(event.type==="refund.succeeded"&&(!Number.isSafeInteger(input.refundAmountMinor)||(input.refundAmountMinor??0)<=0))return null;
 const fingerprint=customerDestinationFingerprint(email);
 if(fingerprint!==consent.recipientFingerprint||!canStageCustomerDelivery({eventCreatedAt:event.createdAt,consentRecordedAt:consent.recordedAt,consentRevokedAt:consent.revokedAt,channelEnabled:enabled,evaluatedAt}))return null;
 try{customerMessage(event.type as CustomerMessageEvent,order.reference);}catch{return null;}
 return {sourceEventId:event.id,channel:"email" as const,recipientFingerprint:fingerprint,templateKey:event.type as CustomerMessageEvent,consentRecordedAt:consent.recordedAt};
}
export function hasOrderEmailProof(consent:Consent,now:Date):boolean {
 const v=consent.verifiedAt?.getTime(), r=consent.recordedAt.getTime(), n=now.getTime();
 return v!==undefined&&Number.isFinite(v)&&Number.isFinite(r)&&Number.isFinite(n)&&v>=r&&v<=n&&(!consent.revokedAt||consent.revokedAt.getTime()>n);
}
export function orderEmailCopy(event:CustomerMessageEvent,order:{reference:string;totalMinor:number;paymentStatus:string;paymentMethod:string;fulfilmentStatus?:string},refundAmountMinor?:number){
 const base=customerMessage(event,order.reference,undefined,order.fulfilmentStatus);
 let body=base.body;
 if(event==="payment.succeeded"){
  if(!Number.isSafeInteger(order.totalMinor)||order.totalMinor<=0)throw Error("Invalid verified amount.");
  body+=" Amount received: ₵"+(order.totalMinor/100).toFixed(2)+".";
 }
 if(event==="refund.succeeded"){
  if(!Number.isSafeInteger(refundAmountMinor)||(refundAmountMinor??0)<=0)throw Error("Invalid verified refund amount.");
  body+=" Amount refunded: ₵"+(refundAmountMinor!/100).toFixed(2)+".";
 }
 if(event==="order.created")body+=orderCreatedPaymentInstruction(order.paymentMethod,order.paymentStatus);
 return {subject:base.subject,body};
}
