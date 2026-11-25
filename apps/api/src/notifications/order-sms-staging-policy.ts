import {canStageCustomerDelivery} from "./customer-delivery-eligibility";
import {customerDestinationFingerprint} from "./customer-message-crypto";
import {customerMessage} from "./customer-channel-policy";

/** Pure planning step, not a sender or a database writer. Limit the initial
 * rollout to order-owned events; payment/refund and courier events need
 * their own durable outcome and identity checks before inclusion. */
export const orderSmsStageEvents = ["order.created","fulfilment.confirmed","fulfilment.packed","order.cancelled"] as const;
type EventType=typeof orderSmsStageEvents[number];
type Consent={orderId:string;recipientFingerprint:string;policyVersion:string;recordedAt:Date;revokedAt:Date|null};
export function planOrderSms(input:{
 event:{id:string;type:string;aggregateId:string;createdAt:Date};
 order:{id:string;reference:string;customerPhone:string;smsConsent:Consent|null};
 enabled:boolean;evaluatedAt:Date;
}){
 const {event,order,enabled,evaluatedAt}=input;
 const consent=order.smsConsent;
 if(!consent||consent.orderId!==order.id||event.aggregateId!==order.id||consent.policyVersion!=="order-sms-v1")return null;
 if(!orderSmsStageEvents.includes(event.type as EventType))return null;
 if(!/^\+233[0-9]{9}$/.test(order.customerPhone))return null;
 const fingerprint=customerDestinationFingerprint(order.customerPhone);
 if(fingerprint!==consent.recipientFingerprint)return null;
 if(!canStageCustomerDelivery({eventCreatedAt:event.createdAt,consentRecordedAt:consent.recordedAt,consentRevokedAt:consent.revokedAt,channelEnabled:enabled,evaluatedAt}))return null;
 try{customerMessage(event.type as EventType,order.reference);}catch{return null;}
 // Do not include the phone, message body or verification secrets in this plan.
 return {sourceEventId:event.id,channel:"sms" as const,recipientFingerprint:fingerprint,templateKey:event.type as EventType,consentRecordedAt:consent.recordedAt};
}
