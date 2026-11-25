import {test} from "node:test";
import assert from "node:assert/strict";
import {mayActOnTransfer,type TransferFacts,type TransferActor} from "../src/transfers/transfer-policy";
import {transferLotValuation,quantityMilli} from "../src/transfers/transfer-valuation";
const admin:TransferActor={id:"hq",role:"admin",locationIds:[]};
const a:TransferActor={id:"a-user",role:"inventory_manager",locationIds:["a"]};
const b:TransferActor={id:"b-user",role:"inventory_manager",locationIds:["b"]};
const both:TransferActor={id:"both",role:"inventory_manager",locationIds:["a","b"]};
const base:TransferFacts={state:"requested",destinationId:"a",sourceId:"b",destinationActive:true,sourceActive:true,authorizedBy:null,dispatchedBy:null,requestedBy:a.id};
test("head office exclusively authorizes the source, even for staff assigned to both branches",()=>{
 assert.equal(mayActOnTransfer(a,"request",{...base,state:null,sourceId:null,requestedBy:null}),true);
 assert.equal(mayActOnTransfer(b,"request",{...base,state:null,sourceId:null,requestedBy:null}),false);
 assert.equal(mayActOnTransfer(both,"authorize",base),false);
 assert.equal(mayActOnTransfer(admin,"authorize",base),true);
 assert.equal(mayActOnTransfer(admin,"authorize",{...base,sourceId:"a"}),false);
 assert.equal(mayActOnTransfer(admin,"authorize",{...base,sourceActive:false}),false);
 assert.equal(mayActOnTransfer(admin,"dispatch",base),false);
});
test("only authorized source can dispatch and authorized destination can receive",()=>{
 const reserved:TransferFacts={...base,state:"reserved",authorizedBy:admin.id};
 assert.equal(mayActOnTransfer(b,"dispatch",reserved),true);
 assert.equal(mayActOnTransfer(a,"dispatch",reserved),false);
 assert.equal(mayActOnTransfer(b,"dispatch",{...reserved,authorizedBy:null}),false);
 assert.equal(mayActOnTransfer(a,"receive",reserved),false);
 const transit:TransferFacts={...reserved,state:"in_transit",dispatchedBy:b.id};
 assert.equal(mayActOnTransfer(a,"receive",transit),true);
 assert.equal(mayActOnTransfer(b,"receive",transit),false);
 assert.equal(mayActOnTransfer(a,"receive",{...transit,destinationActive:false}),false);
 assert.equal(mayActOnTransfer({...a,role:"cashier"},"receive",transit),false);
 assert.equal(mayActOnTransfer(both,"close",transit),false);
 assert.equal(mayActOnTransfer(admin,"cancel",transit),false);
 assert.equal(mayActOnTransfer(admin,"reconcile",transit),true);
});
test("100 cartons at 25 cedis, 98 accepted: two remain in transit at original cost",()=>{
 const v=transferLotValuation({dispatchedQuantity:"100",acceptedQuantityBefore:"0",acceptedQuantityAfter:"98",unitCostMinor:2500});
 assert.equal(v.dispatchedValueMinor,"250000");
 assert.equal(v.receiptValueMinor,"245000");
 assert.equal(v.outstandingValueMinor,"5000");
 assert.equal(v.outstandingQuantityMilli,"2000");
 assert.equal(v.fullyReceived,false);
 const final=transferLotValuation({dispatchedQuantity:"100",acceptedQuantityBefore:"98",acceptedQuantityAfter:"100",unitCostMinor:2500});
 assert.equal(final.receiptValueMinor,"5000");
 assert.equal(final.outstandingValueMinor,"0");
 assert.equal(final.fullyReceived,true);
});
test("fractional units use cumulative rounding without creating money",()=>{
 let prior="0",sum=0n;
 for(const next of ["0.001","0.002","0.003","0.004","0.005"]){
  const v=transferLotValuation({dispatchedQuantity:"0.005",acceptedQuantityBefore:prior,acceptedQuantityAfter:next,unitCostMinor:333});
  sum+=BigInt(v.receiptValueMinor);
  assert.equal(sum+BigInt(v.outstandingValueMinor),BigInt(v.dispatchedValueMinor));
  prior=next;
 }
 assert.equal(sum,2n);
});
test("unknown costs, overreceipt, negative/reversed quantities and excess precision fail closed",()=>{
 const good={dispatchedQuantity:"10",acceptedQuantityBefore:"0",acceptedQuantityAfter:"5",unitCostMinor:100};
 for(const patch of [{unitCostMinor:null},{unitCostMinor:-1},{unitCostMinor:1.5},{acceptedQuantityAfter:"11"},{acceptedQuantityBefore:"6"},{dispatchedQuantity:"0"},{acceptedQuantityAfter:"-1"},{acceptedQuantityAfter:"0.0001"}]){
  assert.throws(()=>transferLotValuation({...good,...patch}));
 }
 assert.throws(()=>quantityMilli("1000000000000"));
 assert.equal(quantityMilli("999999999999.999"),999999999999999n);
});
