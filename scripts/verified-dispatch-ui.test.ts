import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {restEndpoints} from "../src/services/contracts/endpoints";
const screen=readFileSync("src/features/staff/configuration/verified-dispatch.tsx","utf8");
test("verified dispatch commands use real authority paths and header-only replay",()=>{
 const paths={
  "admin.directory.dispatch.assign":"/admin/dispatch/orders/{orderId}/assign",
  "admin.directory.dispatch.reassign":"/admin/dispatch/jobs/{jobId}/reassign",
  "admin.verified.dispatch.unassign":"/admin/dispatch/jobs/{jobId}/unassign",
  "admin.verified.dispatch.reschedule":"/admin/dispatch/jobs/{jobId}/reschedule",
  "admin.verified.dispatch.return":"/admin/dispatch/jobs/{jobId}/return-to-store",
  "admin.verified.dispatch.receive":"/admin/dispatch/jobs/{jobId}/returned-to-store",
  "admin.verified.dispatch.transition":"/admin/dispatch/jobs/{jobId}/provider-transition",
 };
 for(const [op,path] of Object.entries(paths)){
  expect(restEndpoints[op]).toMatchObject({method:"POST",path,replayTransport:"headerOnly"});
  expect(screen).toContain(op);
 }
 expect(screen).toContain("row.allowedActions.includes(action)");
 expect(screen).toContain("dispatchProviderTransitionRequestSchema.safeParse(body)");
 expect(screen).toContain("idempotencyKey:intent.current.key");
 expect(screen).toContain("does not confirm payment or cash collection");
 expect(screen).toContain("physically received at the store");
});
test("demo dispatch remains separate from live workspace",()=>{
 const entry=readFileSync("src/app/admin/dispatch/page.tsx","utf8");
 expect(entry).toContain("isDemoStaffSessionActive()");
 expect(entry).toContain("demo ? <DemoDispatchPage /> : <VerifiedDispatch />");
 expect(screen).toContain("requireRealAdminTransport()");
});
