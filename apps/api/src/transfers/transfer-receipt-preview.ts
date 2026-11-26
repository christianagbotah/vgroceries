import {quantityMilli,receiptCarryingValue} from "./transfer-valuation";

/** Read-only reconciliation preview. All lot and prior-receipt facts must
 * come from persisted dispatch/receipt evidence, not from browser prices.
 * This module makes no inventory or financial writes. */
export type ReceiptPreviewLot={
 id:string; variantId:string; unit:string; lotNumber:string; expiryDate:string|null;
 dispatchedQuantity:string; dispatchedValueMinor:string; unitCostMinor:number;
 previouslyAcceptedQuantity:string; previouslyAcceptedValueMinor:string;
};
export type ReceiptPreviewInput={dispatchLotId:string;quantity:string};
const limit=9223372036854775807n;
function minor(value:string){
 if(!/^\d{1,19}$/.test(value)||BigInt(value)>limit)throw new Error("Invalid carrying value");
 return BigInt(value);
}
function decimal(q:bigint){
 return (q/1000n).toString()+(q%1000n?"."+(q%1000n).toString().padStart(3,"0").replace(/0+$/,""):"");
}
function dateOnly(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("Invalid date");
 const d=new Date(value+"T00:00:00.000Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error("Invalid date");
 return value;
}
export function previewTransferReceipt(lots:readonly ReceiptPreviewLot[],lines:readonly ReceiptPreviewInput[],today:string){
 dateOnly(today);
 if(!lots.length||!lines.length||lines.length>100)throw new Error("At least one receipt line required; maximum 100");
 const indexed=new Map<string,ReceiptPreviewLot>();
 for(const lot of lots){
  if(!lot.id||!lot.variantId||!lot.lotNumber||!lot.unit||indexed.has(lot.id))throw new Error("Invalid dispatch lot evidence");
  indexed.set(lot.id,lot);
 }
 const requested=new Map<string,string>();
 for(const line of lines){
  if(!indexed.has(line.dispatchLotId)||requested.has(line.dispatchLotId))throw new Error("Unknown or repeated dispatch lot");
  if(quantityMilli(line.quantity)<=0n)throw new Error("Positive quantity required");
  requested.set(line.dispatchLotId,line.quantity);
 }
 let dispatchedValue=0n,priorValue=0n,receivedValue=0n,rounding=0n,outstandingValue=0n;
 const items=lots.map(lot=>{
  const dispatched=quantityMilli(lot.dispatchedQuantity),prior=quantityMilli(lot.previouslyAcceptedQuantity);
  const incoming=requested.get(lot.id)??"0";
  const delta=quantityMilli(incoming),after=prior+delta;
  const total=minor(lot.dispatchedValueMinor),accepted=minor(lot.previouslyAcceptedValueMinor);
  if(dispatched<=0n||prior>dispatched||after>dispatched)throw new Error("Receipt exceeds dispatched quantity");
  if(!["kg","litre"].includes(lot.unit)&&[dispatched,prior,delta].some(q=>q%1000n!==0n))throw new Error("Whole base units required");
  if(!Number.isInteger(lot.unitCostMinor)||lot.unitCostMinor<0||lot.unitCostMinor>2147483647)throw new Error("Known source cost required");
  const expiry=lot.expiryDate===null?null:dateOnly(lot.expiryDate);
  const cumulative=(q:bigint)=>(2n*q*total+dispatched)/(2n*dispatched);
  if(accepted!==cumulative(prior))throw new Error("Prior receipt valuation does not reconcile");
  const value=delta?receiptCarryingValue(lot.dispatchedQuantity,lot.previouslyAcceptedQuantity,incoming,total,lot.unitCostMinor):{valueMinor:0n,roundingMinor:0n,outstandingValueMinor:total-accepted};
  dispatchedValue+=total;priorValue+=accepted;receivedValue+=value.valueMinor;rounding+=value.roundingMinor;outstandingValue+=value.outstandingValueMinor;
  return {dispatchLotId:lot.id,variantId:lot.variantId,unit:lot.unit,lotNumber:lot.lotNumber,expiryDate:expiry,unitCostMinor:lot.unitCostMinor,
   dispatchedQuantity:decimal(dispatched),previouslyAcceptedQuantity:decimal(prior),receiptQuantity:decimal(delta),
   acceptedQuantity:decimal(after),outstandingQuantity:decimal(dispatched-after),receiptValueMinor:value.valueMinor.toString(),
   outstandingValueMinor:value.outstandingValueMinor.toString(),roundingMinor:value.roundingMinor.toString(),
   requiresExpiryQuarantine:delta>0n&&expiry!==null&&expiry<=today};
 });
 if(dispatchedValue!==priorValue+receivedValue+outstandingValue)throw new Error("Receipt value does not reconcile");
 if(dispatchedValue>limit)throw new Error("Dispatch value exceeds ledger capacity");
 return {items,dispatchedValueMinor:dispatchedValue.toString(),previouslyAcceptedValueMinor:priorValue.toString(),
  receiptValueMinor:receivedValue.toString(),outstandingValueMinor:outstandingValue.toString(),roundingMinor:rounding.toString(),
  proposedStatus:items.every(i=>i.outstandingQuantity==="0")?"reconciliation" as const:"partially_received" as const};
}
