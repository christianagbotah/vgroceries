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

test("dispatch value is the difference in rounded source lot carrying amounts",async()=>{
 const {dispatchCarryingValue}=await import("../src/transfers/transfer-valuation");
 assert.equal(dispatchCarryingValue("100","2",2500),245000n);
 assert.equal(dispatchCarryingValue("0.005","0.004",333)+dispatchCarryingValue("0.004","0",333),2n);
 assert.throws(()=>dispatchCarryingValue("1","1",2500));
 assert.throws(()=>dispatchCarryingValue("1","0",null));
});

test("receipt allocations conserve the exact dispatched carrying value",async()=>{
 const {receiptCarryingValue}=await import("../src/transfers/transfer-valuation");
 const first=receiptCarryingValue("100","0","98",250000n,2500);
 assert.equal(first.valueMinor,245000n);
 assert.equal(first.outstandingValueMinor,5000n);
 assert.equal(first.roundingMinor,0n);
 const second=receiptCarryingValue("100","98","2",250000n,2500);
 assert.equal(second.valueMinor,5000n);
 assert.equal(second.outstandingValueMinor,0n);
});
test("fractional receipts preserve dispatch value even when nominal lot rounding differs",async()=>{
 const {receiptCarryingValue}=await import("../src/transfers/transfer-valuation");
 let total=0n,rounding=0n;
 for(const prior of ["0","0.001","0.002","0.003","0.004"]){
  const receipt=receiptCarryingValue("0.005",prior,"0.001",2n,333);
  total+=receipt.valueMinor;
  rounding+=receipt.roundingMinor;
  assert.equal(total+receipt.outstandingValueMinor,2n);
 }
 assert.equal(total,2n);
 assert.equal(rounding,2n);
 const exact=receiptCarryingValue("0.001","0","0.001",1n,333);
 assert.equal(exact.valueMinor,1n);
 assert.equal(exact.roundingMinor,1n);
 assert.equal(exact.outstandingValueMinor,0n);
});
test("receipt calculation rejects zero, overreceipt, invalid cost and precision",async()=>{
 const {receiptCarryingValue}=await import("../src/transfers/transfer-valuation");
 assert.throws(()=>receiptCarryingValue("1","0.5","0.6",2500n,2500));
 assert.throws(()=>receiptCarryingValue("1","0","0",2500n,2500));
 assert.throws(()=>receiptCarryingValue("1","0","1",-1n,2500));
 assert.throws(()=>receiptCarryingValue("1","0","1",2500n,-1));
 assert.throws(()=>receiptCarryingValue("1","0","0.0001",2500n,2500));
});
