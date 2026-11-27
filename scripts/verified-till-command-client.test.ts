import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {createTillIntent,assertTillActor} from "../src/features/staff/verified-till-command-client";
import {restEndpoints} from "../src/services/contracts/endpoints";
import {validateRequest} from "../src/services/contracts/validation";
const id="00000000-0000-4000-8000-000000000001",key="till:test-001";
test("verified till actions use strict REST contracts and replay headers",()=>{
 const intent=createTillIntent("move",id,{kind:"drop",amountMinor:1200,note:"Counted safe deposit"},key);
 expect(intent.key).toBe(key);
 expect(intent.sessionId).toBe(id);
 expect(restEndpoints["pos.verified.till.move"]).toEqual({method:"POST",path:"/admin/pos/tills/{sessionId}/movements",replayTransport:"headerOnly"});
 expect(validateRequest("pos.verified.till.move",intent.body).ok).toBe(true);
 expect(validateRequest("pos.verified.till.move",{...intent.body,idempotencyKey:key}).ok).toBe(false);
 expect(()=>createTillIntent("move",id,{...intent.body,amountMinor:0},key)).toThrow();
 expect(()=>createTillIntent("close",id,{countedCashMinor:-1,note:"Counted drawer"},key)).toThrow();
 expect(()=>createTillIntent("open",undefined,{locationId:"main",tillCode:"A",openingFloatMinor:1000},key)).not.toThrow();
 const page=readFileSync("src/app/admin/cashier-sessions/page.tsx","utf8");
 expect(page).toContain("if (process.env.NEXT_PUBLIC_API_BASE_URL?.trim()) return <VerifiedTillCommands />");
 const ui=readFileSync("src/features/staff/verified-till-commands.tsx","utf8");
 expect(ui).toContain("intentRef.current=intent");
 expect(ui).toContain("Retry identical action");
 expect(ui).toContain("verifiedTillCommandsEnabled");
});

test("drawer action replay requires the original administrator and valid session identity",()=>{
 expect(()=>assertTillActor("admin-a",{id:"admin-a",role:"admin"})).not.toThrow();
 expect(()=>assertTillActor("admin-a",{id:"admin-b",role:"admin"})).toThrow();
 expect(()=>assertTillActor("admin-a",{id:"admin-a",role:"cashier"})).toThrow();
 expect(()=>createTillIntent("move","------------------------------------",{kind:"drop",amountMinor:100,note:"Physical cash drop"},key)).toThrow();
 const ui=readFileSync("src/features/staff/verified-till-commands.tsx","utf8");
 expect(ui).toContain("apiOps.transferOptions()");
 expect(ui).toContain("options.locationsCapped");
 expect(ui).toContain("intentActor.current=actorId");
 expect(ui).toContain("executeTillIntent(intent,intentActor.current)");
 expect(ui).toContain("Choose an active branch");
});
