import {test} from "node:test";
import assert from "node:assert/strict";
import {previewTransferDiscrepancy,type DiscrepancyLot,type DiscrepancyProposal} from "../src/transfers/transfer-discrepancy-preview";
const hq={id:"hq",role:"admin",locationIds:[]};
const lot:DiscrepancyLot={id:"lot-1",variantId:"rice",unit:"piece",lotNumber:"BATCH-1",expiryDate:null,dispatchedQuantity:"100",dispatchedValueMinor:"250000",unitCostMinor:2500,previouslyAcceptedQuantity:"98",previouslyAcceptedValueMinor:"245000",previouslyResolvedQuantity:"0",previouslyResolvedValueMinor:"0"};
const proposal:DiscrepancyProposal={dispatchLotId:"lot-1",quantity:"2",disposition:"confirmed_loss",reportId:"report-1",reportedBy:"receiver",reason:"Count verified short",evidenceReference:"COUNT-1"};
test("head-office loss proposal conserves original value but does not post or close",()=>{
 const p=previewTransferDiscrepancy(hq,[lot],[proposal]);
 assert.equal(p.confirmedLossValueMinor,"5000");
 assert.equal(p.outstandingValueMinorAfterProposal,"0");
 assert.equal(p.proposedCoverageComplete,true);
 assert.equal(p.inventoryPosted,false);
 assert.equal(p.financialPostingCreated,false);
 assert.equal(p.canClose,false);
});
test("quarantine and source return have distinct carrying-value destinations",()=>{
 const p=previewTransferDiscrepancy(hq,[lot,{...lot,id:"lot-2"}],[{...proposal,quantity:"1",disposition:"destination_quarantine"},{...proposal,dispatchLotId:"lot-2",reportId:"report-2",disposition:"return_to_source"}]);
 assert.equal(p.destinationQuarantineValueMinor,"2500");
 assert.equal(p.returnToSourceValueMinor,"5000");
 assert.equal(p.confirmedLossValueMinor,"0");
 assert.equal(p.outstandingValueMinorAfterProposal,"2500");
 assert.equal(p.proposedCoverageComplete,false);
});
test("branch staff, self-reviewed reports and undocumented resolutions are rejected",()=>{
 assert.throws(()=>previewTransferDiscrepancy({id:"branch",role:"inventory_manager",locationIds:["a","b"]},[lot],[proposal]));
 for(const p of [{...proposal,reportedBy:"hq"},{...proposal,reason:" "},{...proposal,evidenceReference:""},{...proposal,reportId:""}]){
  assert.throws(()=>previewTransferDiscrepancy(hq,[lot],[p]));
 }
});
test("over-resolution, unknown lots, duplicate report and fractional piece quantity are rejected",()=>{
 for(const lines of [[{...proposal,quantity:"3"}],[{...proposal,quantity:"0.5"}],[{...proposal,quantity:"0"}],[{...proposal,dispatchLotId:"missing"}],[proposal,proposal]]){
  assert.throws(()=>previewTransferDiscrepancy(hq,[lot],lines));
 }
});
test("previously posted resolution reduces remaining coverage; inconsistent evidence fails closed",()=>{
 const prior={...lot,previouslyResolvedQuantity:"1",previouslyResolvedValueMinor:"2500"};
 assert.equal(previewTransferDiscrepancy(hq,[prior],[{...proposal,quantity:"1"}]).proposedResolutionValueMinor,"2500");
 assert.throws(()=>previewTransferDiscrepancy(hq,[prior],[proposal]));
 assert.throws(()=>previewTransferDiscrepancy(hq,[{...prior,previouslyResolvedValueMinor:"2499"}],[{...proposal,quantity:"1"}]));
});
test("zero-cost outstanding quantity still prevents complete coverage",()=>{
 const zero={...lot,dispatchedValueMinor:"0",unitCostMinor:0,previouslyAcceptedValueMinor:"0"};
 const p=previewTransferDiscrepancy(hq,[zero],[{...proposal,quantity:"1"}]);
 assert.equal(p.outstandingValueMinorAfterProposal,"0");
 assert.equal(p.proposedCoverageComplete,false);
 assert.equal(p.items[0].outstandingQuantityAfterProposal,"1");
});
test("fractional resolutions allocate the exact remaining carrying value",()=>{
 const fractional={...lot,unit:"kg",dispatchedQuantity:"0.005",dispatchedValueMinor:"2",unitCostMinor:333,previouslyAcceptedQuantity:"0.002",previouslyAcceptedValueMinor:"1",previouslyResolvedQuantity:"0.001",previouslyResolvedValueMinor:"0"};
 const p=previewTransferDiscrepancy(hq,[fractional],[{...proposal,quantity:"0.002"}]);
 assert.equal(p.proposedResolutionValueMinor,"1");
 assert.equal(p.outstandingValueMinorAfterProposal,"0");
});
