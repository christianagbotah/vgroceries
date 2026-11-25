import {test} from "node:test";
import assert from "node:assert/strict";
import {buildTransferJournals,matchesTransferJournal,type SettlementJournalEvent} from "../src/transfers/transfer-journal";
const input={transferId:"transfer-1",dispatchId:"dispatch-1",sourceId:"branch-b",destinationId:"branch-a",currency:"GHS" as const,lots:[{id:"lot-1",quantity:"100",valueMinor:"250000",unitCostMinor:2500,unit:"piece"}]};
const received: SettlementJournalEvent={id:"receipt-1",sequence:1,lotId:"lot-1",kind:"accepted",quantity:"94",valueMinor:"235000",physicalEvidenceId:"receipt-line-1"};
const quarantine: SettlementJournalEvent={id:"resolve-1",sequence:2,lotId:"lot-1",kind:"destination_quarantine",quantity:"3",valueMinor:"7500",physicalEvidenceId:"quarantine-1",resolutionId:"decision-1"};
const returned: SettlementJournalEvent={...quarantine,id:"resolve-2",sequence:3,kind:"return_to_source",quantity:"2",valueMinor:"5000",physicalEvidenceId:"return-1",resolutionId:"decision-2"};
const loss: SettlementJournalEvent={...quarantine,id:"resolve-3",sequence:4,kind:"confirmed_loss",quantity:"1",valueMinor:"2500",physicalEvidenceId:"loss-report-1",resolutionId:"decision-3"};
test("dispatch debits in-transit inventory and credits source inventory at original cost",()=>{
 const p=buildTransferJournals({...input,settlements:[]});
 assert.deepEqual(p.journals[0].lines,[{accountPurpose:"inventory_in_transit",locationId:null,debitMinor:"250000",creditMinor:"0"},{accountPurpose:"inventory",locationId:"branch-b",debitMinor:"0",creditMinor:"250000"}]);
 assert.equal(p.outstandingValueMinor,"250000");
});
test("receipt, quarantine, return and loss each balance and clear transit exactly",()=>{
 const p=buildTransferJournals({...input,settlements:[received,quarantine,returned,loss]});
 assert.equal(p.quantityAndValueReconciled,true);
 assert.equal(p.outstandingValueMinor,"0");
 assert.equal(p.settledValueMinor,"250000");
 assert.deepEqual(p.journals.slice(1).map(j=>[j.lines[0].accountPurpose,j.lines[0].locationId,j.totalMinor]),[["inventory","branch-a","235000"],["quarantine_inventory","branch-a","7500"],["inventory","branch-b","5000"],["inventory_loss",null,"2500"]]);
 assert.equal(p.financialPostingCreated,false);
 assert.equal(p.canClose,false);
 for(const j of p.journals)assert.equal(matchesTransferJournal(j,j),true);
});
test("partial receipt preserves outstanding transit and cannot close",()=>{
 const p=buildTransferJournals({...input,settlements:[received]});
 assert.equal(p.outstandingValueMinor,"15000");
 assert.equal(p.outstandingLots[0].quantity,"6");
 assert.equal(p.quantityAndValueReconciled,false);
});
test("invalid, duplicated, or incorrect settlement evidence fails closed",()=>{
 for(const events of [[{...received,valueMinor:"234999"}],[{...received,quantity:"101"}],[{...received,sequence:2}],[received,{...quarantine,physicalEvidenceId:received.physicalEvidenceId}],[received,{...quarantine,resolutionId:undefined}],[{...received,quantity:"0.5"}]]){
  assert.throws(()=>buildTransferJournals({...input,settlements:events}));
 }
});
test("zero-cost goods still require quantity coverage without zero-value posting lines",()=>{
 const p=buildTransferJournals({...input,lots:[{...input.lots[0],unitCostMinor:0,valueMinor:"0"}],settlements:[{...received,valueMinor:"0"}]});
 assert.equal(p.outstandingValueMinor,"0");
 assert.equal(p.quantityAndValueReconciled,false);
 assert.deepEqual(p.journals[0].lines,[]);
 assert.equal(matchesTransferJournal(p.journals[0],p.journals[0]),true);
});
test("journal agreement detects wrong account, branch, amount, or extra line",()=>{
 const j=buildTransferJournals({...input,settlements:[]}).journals[0];
 assert.equal(matchesTransferJournal(j,{...j,lines:[...j.lines].reverse()}),true);
 assert.equal(matchesTransferJournal(j,{...j,lines:[{...j.lines[0],locationId:"branch-a"},j.lines[1]]}),false);
 assert.equal(matchesTransferJournal(j,{...j,lines:[{...j.lines[0],debitMinor:"1"},j.lines[1]]}),false);
 assert.equal(matchesTransferJournal(j,{...j,lines:[...j.lines,j.lines[0]]}),false);
});
test("fractional receipts and resolutions share a single cumulative carrying-value allocation",()=>{
 const p=buildTransferJournals({...input,lots:[{id:"lot-1",quantity:"0.005",valueMinor:"2",unitCostMinor:333,unit:"kg"}],settlements:[
 {...received,quantity:"0.002",valueMinor:"1"},
 {...quarantine,quantity:"0.001",valueMinor:"0"},
 {...returned,quantity:"0.002",valueMinor:"1"}]});
 assert.equal(p.quantityAndValueReconciled,true);
 assert.equal(p.outstandingValueMinor,"0");
 assert.equal(p.settledValueMinor,"2");
});
