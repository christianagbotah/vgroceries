import "reflect-metadata";
import assert from "node:assert/strict";
import {test} from "node:test";
import {OrderQueryService} from "../src/orders/order-query.service";
import {ApiProblem} from "../src/http/errors";
import {tokenHash} from "../src/identity/crypto";

for(const blockedAt of ["lookup","existing-lock","failure","none"] as const){
 test(`tracking audit records ${blockedAt} without leaking verification data`,async()=>{
  const rows:unknown[]=[];let reads=0;
  const blocked=()=>{throw new ApiProblem(429,"RATE_LIMITED","Wait",{retryAfterSeconds:123});};
  const db={auditEvent:{create:async({data}:{data:unknown})=>{rows.push(data);}},order:{findUnique:async()=>{reads++;return null;}}};
  const throttle={registerLookup:async()=>{if(blockedAt==="lookup")blocked();},ensureNotBlocked:async()=>{if(blockedAt==="existing-lock")blocked();},registerFailure:async()=>{if(blockedAt==="failure")blocked();}};
  const service=new OrderQueryService(db as never,{} as never,throttle as never,{} as never);
  await assert.rejects(service.track(" vg-test123456 ","0000000000","198.51.100.1","req-1"),(e:unknown)=>{
   assert.ok(e instanceof ApiProblem);assert.equal(e.getStatus(),blockedAt==="none"?403:429);return true;
  });
  assert.equal(reads,blockedAt==="lookup"||blockedAt==="existing-lock"?0:1);
  const referenceHash=tokenHash("VG-TEST123456"),clientHash=tokenHash("198.51.100.1");
  assert.deepEqual(rows,[{actorId:"public-tracking",action:"security.order_track_failed",entityId:referenceHash,requestId:"req-1",details:{referenceHash,clientHash,outcome:blockedAt==="none"?"denied":"rate_limited"}}]);
  for(const secret of ["VG-TEST123456","0000000000","198.51.100.1"])assert.ok(!JSON.stringify(rows).includes(secret));
 });
}
