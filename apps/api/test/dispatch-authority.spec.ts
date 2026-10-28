import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
let app:INestApplication,base="",document:any;
before(async()=>{app=await createApplication();await app.listen(0,"127.0.0.1");base=await app.getUrl();document=await(await fetch(base+"/api/v1/openapi.json")).json();});after(async()=>app.close());
const security=[{cookieAuth:[]},{bearerAuth:[]}];
const adminDispatch=["/api/v1/admin/dispatch","/api/v1/admin/dispatch/jobs/{jobId}","/api/v1/admin/dispatch/orders/{orderId}/assign","/api/v1/admin/dispatch/jobs/{jobId}/unassign","/api/v1/admin/dispatch/jobs/{jobId}/reassign","/api/v1/admin/dispatch/jobs/{jobId}/reschedule","/api/v1/admin/dispatch/jobs/{jobId}/return-to-store","/api/v1/admin/dispatch/jobs/{jobId}/returned-to-store","/api/v1/admin/dispatch/jobs/{jobId}/provider-transition"];
const adminRiders=["/api/v1/admin/riders","/api/v1/admin/riders/{riderProfileId}","/api/v1/admin/riders/{riderProfileId}/availability"];
const riderPaths=["/api/v1/rider/me","/api/v1/rider/me/availability","/api/v1/rider/jobs","/api/v1/rider/jobs/{jobId}","/api/v1/rider/jobs/{jobId}/accept","/api/v1/rider/jobs/{jobId}/pickup","/api/v1/rider/jobs/{jobId}/out-for-delivery","/api/v1/rider/jobs/{jobId}/deliver","/api/v1/rider/jobs/{jobId}/fail","/api/v1/rider/jobs/{jobId}/notes"];
function parameter(op:any,name:string){return(op.parameters??[]).find((p:any)=>p.name===name);} function requestRef(op:any){return op.requestBody?.content?.["application/json"]?.schema?.$ref;} function responseRef(op:any){return op.responses?.["200"]?.content?.["application/json"]?.schema?.$ref;}

test("production OpenAPI publishes exactly 105 paths with 22 Dispatch Rider additions",()=>{assert.equal(Object.keys(document.paths).length,105);for(const path of [...adminDispatch,...adminRiders,...riderPaths])assert.ok(document.paths[path],`missing ${path}`);assert.equal(new Set([...adminDispatch,...adminRiders,...riderPaths]).size,22);assert.equal(document.paths["/api/v1/rider/history"],undefined);for(const absent of ["/api/v1/cod/remittances","/api/v1/returns","/api/v1/pos","/api/v1/providers/webhooks"])assert.equal(document.paths[absent],undefined);});

test("admin dispatch and rider fleet operations document authentication replay and strict contracts",()=>{for(const path of adminDispatch){const item=document.paths[path];const op=item.get??item.post;assert.deepEqual(op.security,security);assert.ok(String(op.description).toLowerCase().includes("admin"));}for(const path of adminRiders){const item=document.paths[path];const op=item.get??item.put;assert.deepEqual(op.security,security);assert.ok(String(op.description).toLowerCase().includes("admin"));}for(const path of [...adminDispatch.slice(2),...adminRiders.slice(2)]){const item=document.paths[path];const op=item.post??item.put;assert.ok(parameter(op,"Idempotency-Key")?.required,`missing replay ${path}`);assert.ok(parameter(op,"X-CSRF-Token"),`missing csrf ${path}`);}assert.equal(requestRef(document.paths[adminDispatch[2]].post),"#/components/schemas/DispatchAssignRequest");assert.equal(requestRef(document.paths[adminDispatch[8]].post),"#/components/schemas/DispatchProviderTransitionRequest");assert.equal(responseRef(document.paths[adminDispatch[0]].get),"#/components/schemas/DispatchQueueResponseEnvelope");assert.equal(responseRef(document.paths[adminRiders[0]].get),"#/components/schemas/DispatchRiderFleetResponseEnvelope");});

test("rider operations are session-owned and document proof failure and history scope without browser rider identity",()=>{for(const path of riderPaths){const item=document.paths[path];const op=item.get??item.put??item.post;assert.deepEqual(op.security,security);assert.ok(String(op.description).toLowerCase().includes("rider"));}for(const path of [riderPaths[1],...riderPaths.slice(4)]){const item=document.paths[path];const op=item.put??item.post;assert.ok(parameter(op,"Idempotency-Key")?.required,`missing replay ${path}`);assert.ok(parameter(op,"X-CSRF-Token"));}const jobs=document.paths["/api/v1/rider/jobs"].get;assert.deepEqual(parameter(jobs,"scope")?.schema?.enum,["active","history"]);assert.equal(responseRef(jobs),"#/components/schemas/RiderJobsResponseEnvelope");assert.equal(requestRef(document.paths["/api/v1/rider/jobs/{jobId}/deliver"].post),"#/components/schemas/RiderDeliverRequest");assert.equal(requestRef(document.paths["/api/v1/rider/jobs/{jobId}/fail"].post),"#/components/schemas/RiderFailRequest");const subset=JSON.stringify({paths:Object.fromEntries(Object.entries(document.paths).filter(([p])=>p.includes("/rider")||p.includes("/dispatch"))),schemas:Object.fromEntries(Object.entries(document.components.schemas).filter(([n])=>/Dispatch|Rider/.test(n)))}).toLowerCase();for(const forbidden of ["cashcollected","remittedat","pendingremittance","riderid\"","providerwebhook","gpslatitude","\"eta\""] )assert.equal(subset.includes(forbidden),false,`forbidden dispatch authority ${forbidden}`);});

test("Dispatch Rider source has no second stock depletion or payment settlement authority",()=>{const dir=join(process.cwd(),"src/dispatch");const source=readdirSync(dir).filter(n=>n.endsWith(".ts")).map(n=>readFileSync(join(dir,n),"utf8")).join("\n");for(const forbidden of ["StockDepletionService","consumeClaim","PaymentCaptureService","cashCollectedAt","remittedAt"])assert.equal(source.includes(forbidden),false,`forbidden source dependency ${forbidden}`);for(const model of ["stockLot","reservation","stockDepletion","paymentAttempt","refund"])assert.doesNotMatch(source,new RegExp(`\\.${model}\\.(?:create|update|updateMany|upsert|delete|deleteMany)\\s*\\(`));});


test("production OpenAPI preserves cross-field dispatch request constraints",()=>{
  const schemas=document.components.schemas;
  for(const name of ["DispatchAssignRequest","DispatchReassignRequest"]){
    const branches=schemas[name].oneOf??[];
    assert.equal(branches.length,2,`${name} must document exactly one assignment target`);
    assert.deepEqual(branches.map((x:any)=>x.required).sort((a:any,b:any)=>String(a).localeCompare(String(b))),[["manualProvider"],["riderProfileId"]]);
  }
  const providerBranches=schemas.DispatchProviderTransitionRequest.oneOf??[];
  assert.ok(providerBranches.some((x:any)=>x.properties?.action?.enum?.includes("delivered")&&x.required?.includes("proof")),"provider delivered must require proof");
  assert.ok(providerBranches.some((x:any)=>x.properties?.failureReason?.enum?.length===1&&x.properties.failureReason.enum[0]==="other"&&x.required?.includes("note")),"provider other failure must require note");
  const riderFailBranches=schemas.RiderFailRequest.oneOf??[];
  assert.ok(riderFailBranches.some((x:any)=>x.properties?.reason?.enum?.length===1&&x.properties.reason.enum[0]==="other"&&x.required?.includes("note")),"rider other failure must require note");
});
