import {test,expect} from "bun:test";
import {PickReplayLedger} from "../src/features/staff/pick-replay-ledger";
import {readFileSync} from "node:fs";
test("ambiguous pick retry keeps exact identity across refreshed rows and changed input",()=>{
 let next=0;const ledger=new PickReplayLedger(()=> "pick:"+(++next));
 const a={pickedQuantity:"1",note:"counted"};
 const first=ledger.keyFor("order-1","reservation-1",a);
 expect(ledger.keyFor("order-1","reservation-1",{...a})).toBe(first);
 expect(ledger.keyFor("order-1","reservation-1",{pickedQuantity:"0",note:"short"})).not.toBe(first);
 expect(ledger.keyFor("order-1","reservation-1",a)).toBe(first);
 expect(ledger.keyFor("order-2","reservation-1",a)).not.toBe(first);
 const second=ledger.keyFor("order-1","reservation-2",a);
 ledger.confirmed("order-1","reservation-1");
 expect(ledger.keyFor("order-1","reservation-1",a)).not.toBe(first);
 expect(ledger.keyFor("order-1","reservation-2",a)).toBe(second);
});
test("parent owns replay ledger and clears only after awaited server response",()=>{
 const c=readFileSync("src/features/staff/verified-fulfilment-workspace.tsx","utf8");
 expect(c).toContain("const [replayLedger]=useState(()=>new PickReplayLedger())");
 expect(c).toContain("await apiOps.verifiedFulfilmentPick(orderId,row.reservationId,raw,replay);replayLedger.confirmed");
 expect(c).toContain("save={save} replayLedger={replayLedger}");
});
