import {quantityMilli,receiptCarryingValue} from "./transfer-valuation";
import type {TransferActor} from "./transfer-policy";
import type {ReceiptPreviewLot} from "./transfer-receipt-preview";

/** Pure preview only. Actor, route, quantities and previous resolutions must
 * be loaded from authenticated/persisted evidence by a future service.
 * It does not authorize a write-off, change stock or post a journal. */
export type Disposition="destination_quarantine"|"return_to_source"|"confirmed_loss";
export type DiscrepancyLot=ReceiptPreviewLot & {
 previouslyResolvedQuantity:string;
 previouslyResolvedValueMinor:string;
};
export type DiscrepancyProposal={
 dispatchLotId:string; quantity:string; disposition:Disposition;
 reportId:string; reportedBy:string; reason:string; evidenceReference:string;
};
const max=9223372036854775807n;
function minor(s:string){
 if(!/^\d{1,19}$/.test(s)||BigInt(s)>max)throw new Error("Invalid carrying value");
 return BigInt(s);
}
function decimal(q:bigint){
 return (q/1000n).toString()+(q%1000n?"."+(q%1000n).toString().padStart(3,"0").replace(/0+$/,""):"");
}
function evidence(s:string,maxLength:number){
 return typeof s==="string"&&s.trim().length>0&&s.length<=maxLength&&!/[\u0000-\u001f\u007f]/.test(s);
}
export function previewTransferDiscrepancy(actor:TransferActor,lots:readonly DiscrepancyLot[],proposals:readonly DiscrepancyProposal[]){
 if(actor.role!=="admin"||!actor.id)throw new Error("Head-office review required");
 if(!lots.length||!proposals.length||proposals.length>100)throw new Error("Invalid discrepancy proposal count");
 const indexed=new Map<string,DiscrepancyLot>();
 for(const l of lots){
  if(!l.id||!l.variantId||!l.unit||indexed.has(l.id))throw new Error("Invalid dispatch evidence");
  indexed.set(l.id,l);
 }
 const selected=new Map<string,DiscrepancyProposal>();
 const reports=new Set<string>();
 for(const p of proposals){
  if(!indexed.has(p.dispatchLotId)||selected.has(p.dispatchLotId)||reports.has(p.reportId))throw new Error("Unknown or repeated discrepancy evidence");
  if(!["destination_quarantine","return_to_source","confirmed_loss"].includes(p.disposition))throw new Error("Unsupported discrepancy disposition");
  if(!evidence(p.reportId,128)||!evidence(p.reportedBy,128)||p.reportedBy===actor.id||!evidence(p.reason,500)||!evidence(p.evidenceReference,128))throw new Error("Independent documented discrepancy report required");
  if(quantityMilli(p.quantity)<=0n)throw new Error("Positive resolution quantity required");
  selected.set(p.dispatchLotId,p);reports.add(p.reportId);
 }
 let total=0n,acceptedTotal=0n,resolvedTotal=0n,proposedTotal=0n,outstandingTotal=0n;
 const allocations={destination_quarantine:0n,return_to_source:0n,confirmed_loss:0n};
 const items=lots.map(l=>{
  const sent=quantityMilli(l.dispatchedQuantity),accepted=quantityMilli(l.previouslyAcceptedQuantity),resolved=quantityMilli(l.previouslyResolvedQuantity);
  const p=selected.get(l.id),delta=quantityMilli(p?.quantity??"0"),before=accepted+resolved,after=before+delta;
  const value=minor(l.dispatchedValueMinor),acceptedValue=minor(l.previouslyAcceptedValueMinor),resolvedValue=minor(l.previouslyResolvedValueMinor);
  if(sent<=0n||before>sent||after>sent)throw new Error("Resolution exceeds outstanding dispatch");
  if(!["kg","litre"].includes(l.unit)&&[sent,accepted,resolved,delta].some(q=>q%1000n!==0n))throw new Error("Whole base units required");
  if(!Number.isInteger(l.unitCostMinor)||l.unitCostMinor<0||l.unitCostMinor>2147483647)throw new Error("Known original cost required");
  const cumulative=(q:bigint)=>(2n*q*value+sent)/(2n*sent);
  // For this staged workflow normal receipts precede discrepancy resolution.
  // Future receipt services must share this combined coverage before allowing
  // receipts to continue after a posted resolution.
  if(acceptedValue!==cumulative(accepted)||acceptedValue+resolvedValue!==cumulative(before))throw new Error("Prior receipt or resolution value does not reconcile");
  const incremental=delta?receiptCarryingValue(l.dispatchedQuantity,decimal(before),p!.quantity,value,l.unitCostMinor).valueMinor:0n;
  const remaining=value-acceptedValue-resolvedValue-incremental;
  if(p)allocations[p.disposition]+=incremental;
  total+=value;acceptedTotal+=acceptedValue;resolvedTotal+=resolvedValue;proposedTotal+=incremental;outstandingTotal+=remaining;
  return {dispatchLotId:l.id,variantId:l.variantId,reportId:p?.reportId??null,disposition:p?.disposition??null,
   proposedQuantity:decimal(delta),proposedValueMinor:incremental.toString(),
   outstandingQuantityAfterProposal:decimal(sent-after),outstandingValueMinorAfterProposal:remaining.toString()};
 });
 if(total>max||total!==acceptedTotal+resolvedTotal+proposedTotal+outstandingTotal)throw new Error("Discrepancy valuation does not reconcile");
 return {items,reviewedBy:actor.id,dispatchedValueMinor:total.toString(),acceptedValueMinor:acceptedTotal.toString(),
  previouslyResolvedValueMinor:resolvedTotal.toString(),proposedResolutionValueMinor:proposedTotal.toString(),
  outstandingValueMinorAfterProposal:outstandingTotal.toString(),
  destinationQuarantineValueMinor:allocations.destination_quarantine.toString(),
  returnToSourceValueMinor:allocations.return_to_source.toString(),
  confirmedLossValueMinor:allocations.confirmed_loss.toString(),
  proposedCoverageComplete:items.every(l=>l.outstandingQuantityAfterProposal==="0"),
  inventoryPosted:false,financialPostingCreated:false,canClose:false};
}
