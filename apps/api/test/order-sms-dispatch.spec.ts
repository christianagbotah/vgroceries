import {test} from "node:test";
import assert from "node:assert/strict";
import type {PrismaClient} from "@prisma/client";
import {currentOrderSmsState,dispatchOneOrderSms} from "../src/notifications/order-sms-dispatch";

const config={endpoint:"https://sms.hubtel.com/v1/messages/send",clientId:"fixture",clientSecret:"fixture",senderId:"VARIETY"};
test("disabled dispatch has no database or network side effects",async()=>{
 const db=new Proxy({}, {get(){throw Error("unexpected database call");}}) as PrismaClient;
 assert.deepEqual(await dispatchOneOrderSms(db,{enabled:false,keyHex:"",config,fetcher:(async()=>{throw Error("unexpected provider call");}) as typeof fetch}),{outcome:"disabled"});
});
test("invalid dispatch configuration is rejected before accessing queue",async()=>{
 const db=new Proxy({}, {get(){throw Error("unexpected database call");}}) as PrismaClient;
 await assert.rejects(()=>dispatchOneOrderSms(db,{enabled:true,keyHex:"",config}),/key not configured/);
});
test("stale or cancelled order updates cannot be sent as current milestones",()=>{
 assert.equal(currentOrderSmsState("order.created","awaiting_confirmation",null),true);
 assert.equal(currentOrderSmsState("order.created","confirmed",null),true);
 assert.equal(currentOrderSmsState("fulfilment.packed","ready_for_collection",null),true);
 assert.equal(currentOrderSmsState("fulfilment.packed","delivered",null),false);
 assert.equal(currentOrderSmsState("order.cancelled","cancelled",new Date()),true);
 assert.equal(currentOrderSmsState("order.cancelled","cancelled",null),false);
 assert.equal(currentOrderSmsState("fulfilment.confirmed","confirmed",new Date()),false);
});
