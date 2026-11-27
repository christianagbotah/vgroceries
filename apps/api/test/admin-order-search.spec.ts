import {after,before,test} from "node:test";
import assert from "node:assert/strict";
import type {INestApplication} from "@nestjs/common";
import {createApplication} from "../src/bootstrap";
import {Database} from "../src/database/database";
import {AdminOrderQueryService} from "../src/orders/admin-order-query.service";
import {seedCommerceFixtures} from "./commerce-fixtures";
let app:INestApplication,db:Database,orders:AdminOrderQueryService;
before(async()=>{
 app=await createApplication();await app.init();db=app.get(Database);orders=app.get(AdminOrderQueryService);
 await seedCommerceFixtures(db);
 for(const [id,reference,customerName,productName,variantName,paymentStatus] of [
 ["search-one","VG-SEARCH000001","Fixture Shopper","Golden Rice","Family Pack","succeeded"],
 ["search-two","VG-SEARCH000002","Other Shopper","Salt","Small Pack","pending"],
 ]){
 await db.order.create({data:{id,reference,customerUserId:"customer-a",customerName,customerPhone:"+233241111111",fulfilment:"collection",paymentMethod:"electronic",paymentStatus,fulfilmentStatus:"awaiting_confirmation",deliveryStatus:"unassigned",subtotalMinor:100,totalMinor:100,verificationKeyVersion:1,verificationCodeHash:"a".repeat(64),lines:{create:{variantId:"var-rice",productId:"product-rice",productName,variantName,unit:"piece",quantity:1,unitPriceMinor:100,lineTotalMinor:100}}}});
 }
});
after(async()=>{await app?.close();});
test("admin search matches order reference, customer, phone and historical item names, retaining payment filters",async()=>{
 for(const q of ["search000001","fixture shopper","golden","FAMILY PACK"]){
  const rows=await orders.list({q});assert.deepEqual(rows.map(r=>r.id),["search-one"]);
 }
 assert.equal((await orders.list({q:"241111111"})).length,2);
 assert.deepEqual((await orders.list({q:"pack",payment:"succeeded"})).map(r=>r.id),["search-one"]);
 assert.equal((await orders.list({q:"golden",payment:"pending"})).length,0);
 assert.equal((await orders.list({q:"not-a-match"})).length,0);
});
