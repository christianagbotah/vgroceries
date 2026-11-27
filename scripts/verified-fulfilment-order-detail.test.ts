import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
test("live online order detail shares the verified fulfilment workspace instead of legacy packing shortcuts",()=>{
 const page=readFileSync("src/app/admin/orders/[id]/page.tsx","utf8");
 expect(page).toContain('const verifiedOnline = liveSession && order.channel==="online"');
 expect(page).toContain('<VerifiedFulfilmentDetail key={id} orderId={id} embedded');
 for(const action of ["canConfirm","canPick","canPack","canReady","canCollect","canDispatch"])expect(page).toContain("const "+action+" = legacyActions && can(");
 const detail=readFileSync("src/features/staff/verified-fulfilment-workspace.tsx","utf8");
 expect(detail).toContain('data.allowedActions.includes(a.name)');
 expect(detail).toContain('data.paymentStatus==="succeeded"&&data.blockingReasons.includes("reservation_lost")');
 expect(detail).toContain('apiOps.verifiedFulfilmentAction(orderId,"confirm")');
 expect(detail).toContain('data.allowedActions.includes("record_pick")');
});
