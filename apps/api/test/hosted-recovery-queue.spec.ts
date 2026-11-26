import {after,before,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {Database} from "../src/database/database";
import {seedCommerceFixtures} from "./commerce-fixtures";
import {claimHostedRecovery,hostedRecoveryIntervalMs,selectHostedRecoveryBatch} from "../src/payments/hosted-recovery-queue";

let app:INestApplication,db:Database;
before(async()=>{app=await createApplication();await app.init();db=app.get(Database);});
beforeEach(async()=>{await seedCommerceFixtures(db);});
after(async()=>{await app.close();});

async function attempt(i:number,now:Date,extra:Record<string,unknown>={}){
 const id="recovery-"+String(i).padStart(3,"0"),orderId="order-"+id;
 const updatedAt=new Date(now.getTime()-3600000+i*1000);
 await db.order.create({data:{id:orderId,reference:"VG-RECOVERY"+String(i).padStart(4,"0"),customerUserId:"customer-a",customerName:"Fixture",customerPhone:"+233241111111",fulfilment:"collection",paymentMethod:"electronic",paymentStatus:"pending",fulfilmentStatus:"awaiting_confirmation",deliveryStatus:"unassigned",subtotalMinor:100,totalMinor:100,verificationKeyVersion:1,verificationCodeHash:"a".repeat(64)}});
 await db.paymentAttempt.create({data:{id,orderId,provider:"hubtel",method:"hosted_checkout",currency:"GHS",amountMinor:100,merchantReference:"fixture-"+id,status:"pending",initiationState:"accepted",settlementState:"unsettled",createdAt:updatedAt,updatedAt,...extra}});
 return {id,orderId};
}

test("worker uses bounded least-recently-checked selection and durable claims",async()=>{
 const now=new Date(),interval=hostedRecoveryIntervalMs(60,1000),cutoff=new Date(now.getTime()-interval);
 assert.equal(interval,60000);
 assert.equal(hostedRecoveryIntervalMs(1,90000),92000);
 const rows=[];
 for(let i=0;i<12;i++)rows.push(await attempt(i,now));
 await attempt(20,now,{status:"succeeded"});
 await attempt(21,now,{initiationState:"uncertain"});
 await attempt(22,now,{provider:"other"});
 const first=await selectHostedRecoveryBatch(db,cutoff);
 assert.deepEqual(first,rows.slice(0,10));
 // The oldest attempt has a recent customer claim; the worker must not repeat it.
 await db.auditEvent.create({data:{actorId:"fixture",action:"payment.customer_lookup_started",entityId:rows[0].id,requestId:"customer-fixture",details:{},createdAt:now}});
 assert.equal(await claimHostedRecovery(db,rows[0],interval,"skip-customer",now),false);
 const simultaneous=await Promise.all([claimHostedRecovery(db,rows[1],interval,"worker-one",now),claimHostedRecovery(db,rows[1],interval,"worker-two",now)]);
 assert.equal(simultaneous.filter(Boolean).length,1);
 // Even if the worker died after claiming, the next batch skips that attempt.
 const next=await selectHostedRecoveryBatch(db,cutoff);
 assert.deepEqual(next,rows.slice(2));
 // After cooldown, never-checked older timestamps outrank previously checked rows.
 const later=new Date(now.getTime()+120000);
 assert.deepEqual(await selectHostedRecoveryBatch(db,new Date(later.getTime()-interval)),rows.slice(2));
 assert.equal(await db.paymentAttempt.count({where:{status:"pending",provider:"hubtel",initiationState:"accepted"}}),12);
 assert.equal(await db.paymentReconciliation.count(),0);
});
