import {quantityMilli,receiptCarryingValue} from "./transfer-valuation";

/** Domain journal builder. Inputs are evidence to be loaded from immutable
 * persisted records by a future posting service. This never posts a journal.
 * Account purposes require configured GL account mappings before posting. */
export type TransferAccountPurpose="inventory"|"inventory_in_transit"|"quarantine_inventory"|"inventory_loss";
export type SettlementKind="accepted"|"destination_quarantine"|"return_to_source"|"confirmed_loss";
export type DispatchJournalLot={
 id:string;quantity:string;valueMinor:string;unitCostMinor:number;unit:string;
};
export type SettlementJournalEvent={
 id:string;sequence:number;lotId:string;kind:SettlementKind;quantity:string;
 valueMinor:string;physicalEvidenceId:string;
 // For a resolution, the evidence must be a persisted head-office decision.
 resolutionId?:string;
};
export type JournalLine={
 accountPurpose:TransferAccountPurpose;locationId:string|null;
 debitMinor:string;creditMinor:string;
};
export type ExpectedJournal={
 eventKey:string;currency:"GHS";lines:JournalLine[];totalMinor:string;
};
const max=9223372036854775807n;
function money(raw:string){
 if(!/^\d{1,19}$/.test(raw)||BigInt(raw)>max)throw new Error("Invalid minor-unit amount");
 return BigInt(raw);
}
function validId(s:string){
 return typeof s==="string"&&s.trim()===s&&s.length>0&&s.length<=128&&!/[\u0000-\u001f\u007f]/.test(s);
}
function decimal(q:bigint){
 return (q/1000n).toString()+(q%1000n?"."+(q%1000n).toString().padStart(3,"0").replace(/0+$/,""):"");
}
function journal(eventKey:string,value:bigint,debit:TransferAccountPurpose,debitLocation:string|null,credit:TransferAccountPurpose,creditLocation:string|null):ExpectedJournal{
 if(value<0n||value>max)throw new Error("Journal amount exceeds capacity");
 return {eventKey,currency:"GHS",totalMinor:value.toString(),lines:value===0n?[]:[
  {accountPurpose:debit,locationId:debitLocation,debitMinor:value.toString(),creditMinor:"0"},
  {accountPurpose:credit,locationId:creditLocation,debitMinor:"0",creditMinor:value.toString()},
 ]};
}
export function buildTransferJournals(input:{
 transferId:string;dispatchId:string;sourceId:string;destinationId:string;
 currency:"GHS";lots:readonly DispatchJournalLot[];settlements:readonly SettlementJournalEvent[];
}){
 const {transferId,dispatchId,sourceId,destinationId,currency,lots,settlements}=input;
 if(![transferId,dispatchId,sourceId,destinationId].every(validId)||sourceId===destinationId||currency!=="GHS"||!lots.length)throw new Error("Invalid dispatch journal identity");
 const balances=new Map<string,{lot:DispatchJournalLot;sent:bigint;value:bigint;settled:bigint;settledValue:bigint}>();
 let total=0n;
 for(const lot of lots){
  const sent=quantityMilli(lot.quantity),value=money(lot.valueMinor);
  if(!validId(lot.id)||balances.has(lot.id)||sent===0n||!lot.unit||(!["kg","litre"].includes(lot.unit)&&sent%1000n!==0n)||!Number.isInteger(lot.unitCostMinor)||lot.unitCostMinor<0||lot.unitCostMinor>2147483647)throw new Error("Invalid dispatched lot");
  balances.set(lot.id,{lot,sent,value,settled:0n,settledValue:0n});total+=value;
 }
 if(total>max)throw new Error("Dispatch total exceeds capacity");
 const journals=[journal(JSON.stringify([transferId,"dispatch",dispatchId]),total,"inventory_in_transit",null,"inventory",sourceId)];
 const events=new Set<string>();
 const evidence=new Set<string>();
 for(const [i,event] of settlements.entries()){
  if(event.sequence!==i+1||!validId(event.id)||events.has(event.id)||!validId(event.physicalEvidenceId)||evidence.has(event.physicalEvidenceId))throw new Error("Invalid, duplicate or out-of-sequence settlement");
  if(!["accepted","destination_quarantine","return_to_source","confirmed_loss"].includes(event.kind))throw new Error("Invalid settlement kind");
  if(event.kind!=="accepted"&&!validId(event.resolutionId??""))throw new Error("Independent resolution evidence required");
  if(event.kind==="accepted"&&event.resolutionId!==undefined)throw new Error("Unexpected resolution on ordinary receipt");
  const b=balances.get(event.lotId),quantity=quantityMilli(event.quantity),value=money(event.valueMinor);
  if(!b||quantity<=0n||b.settled+quantity>b.sent||(!["kg","litre"].includes(b.lot.unit)&&quantity%1000n!==0n))throw new Error("Settlement exceeds outstanding lot");
  const expected=receiptCarryingValue(b.lot.quantity,decimal(b.settled),event.quantity,b.value,b.lot.unitCostMinor).valueMinor;
  if(value!==expected)throw new Error("Settlement carrying value differs from original dispatch allocation");
  b.settled+=quantity;b.settledValue+=value;
  const debit:TransferAccountPurpose=event.kind==="confirmed_loss"?"inventory_loss":event.kind==="destination_quarantine"?"quarantine_inventory":"inventory";
  // Confirmed in-transit loss is not attributed to a branch without a separate responsibility decision.
  const location=event.kind==="confirmed_loss"?null:event.kind==="return_to_source"?sourceId:destinationId;
  journals.push(journal(JSON.stringify([transferId,"settlement",event.id]),value,debit,location,"inventory_in_transit",null));
  events.add(event.id);evidence.add(event.physicalEvidenceId);
 }
 const outstandingLots=[...balances.values()].map(b=>({lotId:b.lot.id,quantity:decimal(b.sent-b.settled),valueMinor:(b.value-b.settledValue).toString()}));
 const outstanding=outstandingLots.reduce((sum,b)=>sum+money(b.valueMinor),0n);
 const settled=total-outstanding;
 return {transferId,journals,outstandingLots,dispatchedValueMinor:total.toString(),settledValueMinor:settled.toString(),outstandingValueMinor:outstanding.toString(),
  quantityAndValueReconciled:outstandingLots.every(b=>b.quantity==="0"&&b.valueMinor==="0"),financialPostingCreated:false,canClose:false};
}

/** Strict comparison against independently read durable posting evidence.
 * This validates journal agreement only; it cannot attest database persistence,
 * approval validity, inventory custody or authorize transfer closure. */
export function matchesTransferJournal(expected:ExpectedJournal,actual:ExpectedJournal){
 if(expected.eventKey!==actual.eventKey||expected.currency!==actual.currency||expected.totalMinor!==actual.totalMinor||expected.lines.length!==actual.lines.length)return false;
 try{
  const normalize=(lines:JournalLine[])=>lines.map(l=>{
   const d=money(l.debitMinor),c=money(l.creditMinor);
   if((d===0n)===(c===0n))throw new Error("Invalid posting line");
   return JSON.stringify([l.accountPurpose,l.locationId,d.toString(),c.toString()]);
  }).sort();
  const sum=(key:"debitMinor"|"creditMinor")=>actual.lines.reduce((a,l)=>a+money(l[key]),0n);
  return sum("debitMinor")===money(expected.totalMinor)&&sum("creditMinor")===money(expected.totalMinor)&&JSON.stringify(normalize(expected.lines))===JSON.stringify(normalize(actual.lines));
 }catch{return false;}
}
