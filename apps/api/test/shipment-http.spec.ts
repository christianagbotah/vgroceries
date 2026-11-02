import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { readConfig } from "../src/config";
import { Database } from "../src/database/database";
import { commerceTestPassword, seedCommerceFixtures } from "./commerce-fixtures";

let app:INestApplication; let db:Database; let base=""; let shipmentId="";
const config=()=>readConfig({DATABASE_URL:process.env.DATABASE_URL!,WEB_ORIGINS:"http://localhost:3000",API_STOCK_LOCATION_ID:"loc_accra",API_INSECURE_COOKIES:"true",COMMERCE_LOCATION_ID:"loc_accra",CHECKOUT_PAYMENT_HOLD_MINUTES:"15",CHECKOUT_OFFLINE_HOLD_MINUTES:"1440",GUEST_CHECKOUT_TTL_MINUTES:"1440",ORDER_VERIFICATION_ACTIVE_VERSION:"1",ORDER_VERIFICATION_KEYS:JSON.stringify({1:"11".repeat(32)}),LOGISTICS_SHIPMENT_EXECUTION_ENABLED:"true"});
async function request(method:string,path:string,input?:{token?:string;key?:string;body?:unknown}){const headers:Record<string,string>={};if(input?.token)headers.authorization=`Bearer ${input.token}`;if(input?.key)headers["idempotency-key"]=input.key;if(input&&Object.hasOwn(input,"body"))headers["content-type"]="application/json";const response=await fetch(`${base}/api/v1${path}`,{method,headers,body:input&&Object.hasOwn(input,"body")?JSON.stringify(input.body):undefined});return{response,body:await response.json()};}
async function native(email:string){const response=await fetch(`${base}/api/v1/auth/sessions`,{method:"POST",headers:{"content-type":"application/json",origin:"http://localhost:3000"},body:JSON.stringify({email,password:commerceTestPassword,client:"native"})});assert.equal(response.status,201);return(await response.json()).data.accessToken as string;}

async function seedShipment(){
  const now=new Date();
  const order=await db.order.create({data:{reference:"VG-SHIP-HTTP",customerUserId:"customer-a",customerName:"Ama Customer",customerPhone:"+233241111111",fulfilment:"delivery",zoneId:"zone-required",paymentMethod:"cash_on_delivery",paymentStatus:"unpaid",fulfilmentStatus:"dispatched",deliveryStatus:"unassigned",subtotalMinor:1000,deliveryFeeMinor:100,totalMinor:1100,verificationKeyVersion:1,verificationCodeHash:"e".repeat(64),stockConsumedAt:now}});
  const node=await db.logisticsNode.create({data:{code:"SHIP_HTTP_SOURCE",name:"Shipment HTTP source",publicName:"Shipment HTTP source",kind:"fulfilment_center",active:true}});
  const template=await db.deliveryWorkflowTemplate.create({data:{name:"Shipment HTTP workflow",description:"",active:true}});
  const version=await db.deliveryWorkflowVersion.create({data:{templateId:template.id,versionNumber:1,status:"published",revision:1,createdBy:"admin-commerce",publishedBy:"admin-commerce",publishedAt:now}});
  const rule=await db.deliveryRouteRule.create({data:{name:"Shipment HTTP route",originNodeId:node.id,deliveryZoneId:"zone-required",fulfilment:"delivery",destinationKind:"doorstep",workflowVersionId:version.id,priority:1,active:true,createdBy:"admin-commerce"}});
  const shipment=await db.shipment.create({data:{orderId:order.id,sequence:1,workflowVersionId:version.id,routeRuleId:rule.id,routeRevision:1,status:"final_mile_ready",originNodeId:node.id,destinationKind:"doorstep",destinationAddress:{recipientName:"Ama Customer",locality:"Labone",street:"A Street"},currentNodeId:node.id,custody:"source_staff",activatedAt:now,version:2}});
  await db.shipmentStop.create({data:{shipmentId:shipment.id,routeRevision:1,position:1,nodeId:node.id,nodeCode:node.code,nodePublicName:node.publicName,nodeKind:node.kind,nodeKindLabel:node.kindLabel,terminalRole:"final_mile_dispatch"}});
  await db.shipmentEvent.create({data:{shipmentId:shipment.id,routeRevision:1,nodeId:node.id,eventKind:"fulfilment_handed_over",actorKind:"staff",actorId:"admin-commerce",toCustody:"source_staff",safeMetadata:{status:"final_mile_ready"},requestId:"req-ship-http-seed",occurredAt:now}});
  shipmentId=shipment.id;
}

before(async()=>{if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("variety_foundation_test"))throw Error("isolated database required");app=await createApplication(config());await app.listen(0,"127.0.0.1");base=await app.getUrl();db=app.get(Database);});
beforeEach(async()=>{await seedCommerceFixtures(db);await seedShipment();});
after(async()=>{await app.close();});

test("admin shipment reads are authenticated role-restricted bounded and customer-safe",async()=>{
  const admin=await native("admin-commerce@example.test"),customer=await native("customer-a@example.test");
  assert.equal((await request("GET","/admin/logistics/shipments")).response.status,401);
  assert.equal((await request("GET","/admin/logistics/shipments",{token:customer})).response.status,403);
  const list=await request("GET","/admin/logistics/shipments?page=1&perPage=1&status=final_mile_ready",{token:admin});assert.equal(list.response.status,200);assert.equal(list.body.data.items.length,1);assert.equal(list.body.data.items[0].id,shipmentId);assert.equal(list.body.data.items[0].paymentStatus,undefined);
  assert.equal((await request("GET","/admin/logistics/shipments?perPage=101",{token:admin})).response.status,400);
  const detail=await request("GET",`/admin/logistics/shipments/${shipmentId}`,{token:admin});assert.equal(detail.response.status,200);assert.equal(detail.body.data.id,shipmentId);assert.equal(detail.body.data.stops.length,1);assert.equal(detail.body.data.events.length,1);assert.equal(detail.body.data.paymentStatus,undefined);assert.equal(detail.body.data.destinationAddress.recipientName,"Ama Customer");
  assert.equal((await request("GET","/admin/logistics/shipments/missing-shipment",{token:admin})).response.status,404);
});

test("non-admin cannot mutate shipment execution while admin checkpoint remains replay-protected",async()=>{
  const admin=await native("admin-commerce@example.test"),customer=await native("customer-a@example.test");
  const path=`/admin/logistics/shipments/${shipmentId}/checkpoints`;
  assert.equal((await request("POST",path,{token:customer,key:"ship-http-customer",body:{title:"Reached desk"}})).response.status,403);
  const first=await request("POST",path,{token:admin,key:"ship-http-admin-key",body:{title:"Reached desk",detail:"Safe informational note"}});assert.equal(first.response.status,200);
  const replay=await request("POST",path,{token:admin,key:"ship-http-admin-key",body:{title:"Reached desk",detail:"Safe informational note"}});assert.equal(replay.response.status,200);assert.deepEqual(replay.body,first.body);
  assert.equal(await db.shipmentEvent.count({where:{shipmentId,eventKind:"custom_checkpoint"}}),1);
});
