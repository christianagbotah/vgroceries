import {test} from "node:test";
import assert from "node:assert/strict";
import {outForDeliveryCopy} from "../src/notifications/out-for-delivery-copy";
const input={reference:"VG-TEST12345678",contact:{kind:"rider" as const,name:"Daniel Mensah",phone:"+233241111111"},paymentMethod:"cash_on_delivery",paymentStatus:"unpaid",totalMinor:118550};
test("unpaid COD includes actual assigned work contact and exact amount",()=>{
 const text=outForDeliveryCopy(input);
 assert.match(text,/Delivery rider: Daniel Mensah/);
 assert.match(text,/Contact: \+233241111111/);
 assert.match(text,/GHS 1,185\.50/);
 assert.match(text,/exact cash amount ready/);
 assert.match(text,/may not have sufficient change/);
 assert.match(text,/Track: https:/);
});
test("paid orders never request cash and uncertain payments do not claim to be paid",()=>{
 const paid=outForDeliveryCopy({...input,paymentStatus:"succeeded"});
 assert.match(paid,/No payment is required upon delivery/);
 assert.doesNotMatch(paid,/exact cash|Amount payable/);
 for(const status of ["pending","requires_review"]){
  const text=outForDeliveryCopy({...input,paymentStatus:status});
  assert.doesNotMatch(text,/Amount payable|Fully paid/);
 }
 assert.doesNotMatch(outForDeliveryCopy({...input,paymentMethod:"mobile_money"}),/Amount payable/);
});
test("external partner is distinguished from an individual rider and missing contact is not invented",()=>{
 assert.match(outForDeliveryCopy({...input,contact:{kind:"courier",name:"Fixture Courier",phone:"024 222 2222"}}),/Delivery partner: Fixture Courier\.\nContact: 0242222222/);
 assert.doesNotMatch(outForDeliveryCopy({...input,contact:{kind:"courier",name:"Fixture Courier",phone:"invalid"}}),/Contact:/);
 assert.doesNotMatch(outForDeliveryCopy({...input,contact:null}),/Delivery rider:|Delivery partner:|Contact:/);
});
