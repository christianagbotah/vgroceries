import {canStageCustomerDelivery} from "./customer-delivery-eligibility";
import {customerDestinationFingerprint} from "./customer-message-crypto";
import {deliverySmsEvents} from "./order-sms-delivery-evidence";
import {customerMessage} from "./customer-channel-policy";
import {paymentStatusSmsEvents,paymentStatusTemplates} from "./order-sms-payment-evidence";

/** Pure planning step, not a sender or a database writer. Order-owned events and separately resolved payment evidence only;
 * refund and courier events require independent outcome checks. */
export const orderSmsStageEvents = ["order.created","fulfilment.confirmed","fulfilment.picking_started","fulfilment.packed","fulfilment.handed_over","order.cancelled"] as const;
export const smsStageEvents = [...orderSmsStageEvents,"order.cancelled_with_refund","payment.succeeded",...paymentStatusSmsEvents,"refund.succeeded",...deliverySmsEvents] as const;
const smsTemplateEvents=[...orderSmsStageEvents,"payment.succeeded",...paymentStatusTemplates,"refund.succeeded","delivery.delivered","delivery.out_for_delivery","delivery.failed"] as const;
type EventType=typeof smsTemplateEvents[number];
type Consent={orderId:string;recipientFingerprint:string;policyVersion:string;recordedAt:Date;revokedAt:Date|null};
export function planOrderSms(input:{
 event:{id:string;type:string;aggregateId:string;createdAt:Date};
 order:{id:string;reference:string;customerPhone:string;smsConsent:Consent|null};
 enabled:boolean;evaluatedAt:Date;
 paymentConfirmed?:boolean;deliveryConfirmed?:boolean;refundAmountMinor?:number;
}){
 const {event,order,enabled,evaluatedAt}=input;
 const consent=order.smsConsent;
 if(!consent||consent.orderId!==order.id||event.aggregateId!==order.id||consent.policyVersion!=="order-sms-v1")return null;
 if(!smsTemplateEvents.includes(event.type as EventType))return null;
 if(event.type.startsWith("payment.")&&input.paymentConfirmed!==true)return null;
 if(event.type==="refund.succeeded"&&(!Number.isSafeInteger(input.refundAmountMinor)||(input.refundAmountMinor??0)<=0))return null;
 if(event.type.startsWith("delivery.")&&input.deliveryConfirmed!==true)return null;
 if(!/^\+233[0-9]{9}$/.test(order.customerPhone))return null;
 const fingerprint=customerDestinationFingerprint(order.customerPhone);
 if(fingerprint!==consent.recipientFingerprint)return null;
 if(!canStageCustomerDelivery({eventCreatedAt:event.createdAt,consentRecordedAt:consent.recordedAt,consentRevokedAt:consent.revokedAt,channelEnabled:enabled,evaluatedAt}))return null;
 try{customerMessage(event.type as EventType,order.reference);}catch{return null;}
 // Do not include the phone, message body or verification secrets in this plan.
 return {sourceEventId:event.id,channel:"sms" as const,recipientFingerprint:fingerprint,templateKey:event.type as EventType,consentRecordedAt:consent.recordedAt};
}
