import {test} from "node:test";
import assert from "node:assert/strict";
import type {PrismaClient} from "@prisma/client";
import {stageOrderSmsBatch} from "../src/notifications/order-sms-stage-batch";
test("disabled staging is inert without database or key access",async()=>{
 const db=new Proxy({}, {get(){throw Error("Database must not be accessed");}}) as PrismaClient;
 assert.deepEqual(await stageOrderSmsBatch(db,{enabled:false,keyHex:""}),{disabled:true,scanned:0,queued:0,busy:false});
});
test("enabled batch rejects invalid keys and bounds before database access",async()=>{
 const db=new Proxy({}, {get(){throw Error("Database must not be accessed");}}) as PrismaClient;
 await assert.rejects(()=>stageOrderSmsBatch(db,{enabled:true,keyHex:""}),/key not configured/);
 await assert.rejects(()=>stageOrderSmsBatch(db,{enabled:true,keyHex:"1".repeat(64),take:101}),/Invalid staging batch/);
});
