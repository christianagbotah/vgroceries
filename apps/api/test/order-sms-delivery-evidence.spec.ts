import {test} from "node:test";
import assert from "node:assert/strict";
import {confirmedSmsDelivery} from "../src/notifications/order-sms-delivery-evidence";
const time=new Date("2026-11-25T10:00:00Z");
const now=new Date("2026-11-25T10:01:00Z");
const source={type:"delivery.out_for_delivery",aggregateId:"order",payload:{deliveryJobId:"job",requestId:"request",toStatus:"out_for_delivery"},createdAt:time};
const job={id:"job",orderId:"order",status:"out_for_delivery",custodyState:"rider",assignmentKind:"in_house",outForDeliveryAt:time,deliveredAt:null,proof:null};
const order={id:"order",fulfilment:"delivery",fulfilmentStatus:"dispatched",deliveryStatus:"out_for_delivery",cancelledAt:null};
const transition={deliveryJobId:"job",orderId:"order",action:"out_for_delivery",toStatus:"out_for_delivery",requestId:"request",createdAt:time};
test("out-for-delivery requires matching current job, custody and recorded transition",()=>{
 assert.equal(confirmedSmsDelivery(source,job,order,transition,now),"delivery.out_for_delivery");
 for(const patch of [{status:"failed"},{custodyState:"dispatch"},{orderId:"wrong"},{outForDeliveryAt:null}])assert.equal(confirmedSmsDelivery(source,{...job,...patch},order,transition,now),null);
 assert.equal(confirmedSmsDelivery(source,job,order,{...transition,requestId:"other"},now),null);
});
test("manual courier delivery requires recorded proof and maps to canonical template",()=>{
 const event={...source,type:"delivery.provider_delivered",payload:{...source.payload,toStatus:"delivered"}};
 const delivered={...job,assignmentKind:"manual_provider",status:"delivered",custodyState:"customer",deliveredAt:time,proof:{method:"signature",reference:"fixture-proof",recordedAt:time}};
 const complete={...order,fulfilmentStatus:"delivered",deliveryStatus:"delivered"};
 const recorded={...transition,action:"provider_delivered",toStatus:"delivered"};
 assert.equal(confirmedSmsDelivery(event,delivered,complete,recorded,now),"delivery.delivered");
 assert.equal(confirmedSmsDelivery(event,{...delivered,proof:null},complete,recorded,now),null);
 assert.equal(confirmedSmsDelivery(event,delivered,{...complete,cancelledAt:now},recorded,now),null);
 assert.equal(confirmedSmsDelivery(event,{...delivered,assignmentKind:"in_house"},complete,recorded,now),null);
});


test("failed delivery requires matching committed failure and current job state, for rider and courier",()=>{
 for(const manual of [false,true]){
  const action=manual?"provider_failed":"failed";
  const event={...source,type:"delivery."+action,payload:{...source.payload,toStatus:"failed"}};
  const failed={...job,assignmentKind:manual?"manual_provider":"in_house",status:"failed",failedAt:time,failureReasonCode:"customer_unavailable"};
  const current={...order,deliveryStatus:"failed"};
  const recorded={...transition,action,toStatus:"failed"};
  assert.equal(confirmedSmsDelivery(event,failed,current,recorded,now),"delivery.failed");
  assert.equal(confirmedSmsDelivery(event,{...failed,failedAt:null},current,recorded,now),null);
  assert.equal(confirmedSmsDelivery(event,{...failed,status:"rescheduled"},current,recorded,now),null);
  assert.equal(confirmedSmsDelivery(event,failed,{...current,deliveryStatus:"delivered"},recorded,now),null);
  assert.equal(confirmedSmsDelivery(event,failed,current,{...recorded,requestId:"other"},now),null);
 }
});
