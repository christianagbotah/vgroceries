import {test} from "node:test";
import assert from "node:assert/strict";
import {previewTransferReceipt,type ReceiptPreviewLot} from "../src/transfers/transfer-receipt-preview";
const lot:ReceiptPreviewLot={id:"lot-a",variantId:"rice",unit:"piece",lotNumber:"BATCH-1",expiryDate:null,dispatchedQuantity:"100",dispatchedValueMinor:"250000",unitCostMinor:2500,previouslyAcceptedQuantity:"0",previouslyAcceptedValueMinor:"0"};
const today="2026-11-25";
test("partial acceptance leaves omitted lots and quantities outstanding at original carrying value",()=>{
 const p=previewTransferReceipt([lot,{...lot,id:"lot-b",dispatchedQuantity:"4",dispatchedValueMinor:"10000"}],[{dispatchLotId:"lot-a",quantity:"98"}],today);
 assert.equal(p.proposedStatus,"partially_received");
 assert.equal(p.dispatchedValueMinor,"260000");
 assert.equal(p.receiptValueMinor,"245000");
 assert.equal(p.outstandingValueMinor,"15000");
 assert.equal(p.items[0].outstandingQuantity,"2");
 assert.equal(p.items[1].outstandingQuantity,"4");
 assert.equal(p.items[1].receiptQuantity,"0");
});
test("last receipt enters reconciliation rather than automatically closing transfer",()=>{
 const p=previewTransferReceipt([{...lot,previouslyAcceptedQuantity:"98",previouslyAcceptedValueMinor:"245000"}],[{dispatchLotId:"lot-a",quantity:"2"}],today);
 assert.equal(p.proposedStatus,"reconciliation");
 assert.equal(p.outstandingValueMinor,"0");
 assert.equal(p.receiptValueMinor,"5000");
 assert.equal(p.items[0].lotNumber,"BATCH-1");
});
test("reject unknown lot, duplicate lot, overreceipt, zero and inconsistent prior valuation",()=>{
 for(const lines of [[{dispatchLotId:"other",quantity:"1"}],[{dispatchLotId:"lot-a",quantity:"1"},{dispatchLotId:"lot-a",quantity:"1"}],[{dispatchLotId:"lot-a",quantity:"101"}],[{dispatchLotId:"lot-a",quantity:"0"}]]){
  assert.throws(()=>previewTransferReceipt([lot],lines,today));
 }
 assert.throws(()=>previewTransferReceipt([{...lot,previouslyAcceptedQuantity:"1",previouslyAcceptedValueMinor:"1"}],[{dispatchLotId:"lot-a",quantity:"1"}],today));
 assert.throws(()=>previewTransferReceipt([lot],[{dispatchLotId:"lot-a",quantity:"0.5"}],today));
});
test("fractional base units preserve source carrying value and explicitly report rounding",()=>{
 const p=previewTransferReceipt([{...lot,unit:"kg",dispatchedQuantity:"0.005",dispatchedValueMinor:"2",unitCostMinor:333,previouslyAcceptedQuantity:"0.004",previouslyAcceptedValueMinor:"2"}],[{dispatchLotId:"lot-a",quantity:"0.001"}],today);
 assert.equal(p.receiptValueMinor,"0");
 assert.equal(p.outstandingValueMinor,"0");
 assert.equal(p.proposedStatus,"reconciliation");
 const q=previewTransferReceipt([{...lot,unit:"kg",dispatchedQuantity:"0.001",dispatchedValueMinor:"1",unitCostMinor:333}],[{dispatchLotId:"lot-a",quantity:"0.001"}],today);
 assert.equal(q.roundingMinor,"1");
});
test("expired and same-day expiry batches require quarantine; valid future expiry does not",()=>{
 for(const expiryDate of ["2026-11-24",today,"2026-11-26"]){
  const p=previewTransferReceipt([{...lot,expiryDate}],[{dispatchLotId:"lot-a",quantity:"1"}],today);
  assert.equal(p.items[0].requiresExpiryQuarantine,expiryDate<=today);
 }
 assert.throws(()=>previewTransferReceipt([{...lot,expiryDate:"2026-02-30"}],[{dispatchLotId:"lot-a",quantity:"1"}],today));
});
