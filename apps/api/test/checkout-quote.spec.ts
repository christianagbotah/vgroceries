import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
import { Database } from "../src/database/database";
import { seedCommerceFixtures } from "./commerce-fixtures";

let app: INestApplication; let db: Database; let base: string;
async function post(body: unknown) {
  const r = await fetch(base + "/api/v1/checkout/quote", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
  return { r, body: await r.json() };
}
before(async()=>{ app=await createApplication(); await app.listen(0,"127.0.0.1"); base=await app.getUrl(); db=app.get(Database); });
beforeEach(async()=>{ await seedCommerceFixtures(db); });
after(async()=>{ await app.close(); });

test("quote uses current authoritative price exact weighted rounding and safety-stock-aware availability", async()=>{
  await db.reservation.create({ data:{ positionId:"pos-rice", lotId:"lot-rice", claimType:"order", claimId:"old", claimLineId:"old-line", quantity:"999", state:"active", expiresAt:new Date(0) } });
  const x=await post({lines:[{variantId:"var-rice",quantity:"1.005"}]});
  assert.equal(x.r.status,200); assert.equal(x.body.data.lines[0].unitPriceMinor,199); assert.equal(x.body.data.lines[0].lineTotalMinor,200); assert.equal(x.body.data.lines[0].available,"18"); assert.equal(x.body.data.deliveryFeeMinor,0); assert.equal(x.body.data.meetsMinimum,true);
  await db.variant.update({where:{id:"var-rice"},data:{priceMinor:250}});
  const y=await post({lines:[{variantId:"var-rice",quantity:"1"}]});
  assert.equal(y.body.data.lines[0].unitPriceMinor,250);
});

test("delivery quote applies zone fee and merchandise minimum while collection has no fee", async()=>{
  const d=await post({lines:[{variantId:"var-rice",quantity:"5.1"}],zoneId:"zone-required"});
  assert.equal(d.r.status,200); assert.equal(d.body.data.subtotalMinor,1015); assert.equal(d.body.data.deliveryFeeMinor,1200); assert.equal(d.body.data.totalMinor,2215); assert.equal(d.body.data.minOrderMinor,1000); assert.equal(d.body.data.meetsMinimum,true);
  const c=await post({lines:[{variantId:"var-rice",quantity:"1"}]}); assert.equal(c.body.data.deliveryFeeMinor,0); assert.equal(c.body.data.minOrderMinor,0);
});

test("quote reports stock conflicts without creating commerce state", async()=>{
  const before=await Promise.all([db.order.count(),db.reservation.count(),db.deliverySlotBooking.count()]);
  const x=await post({lines:[{variantId:"var-rice",quantity:"19"}]});
  assert.equal(x.r.status,200); assert.equal(x.body.data.ok,false); assert.equal(x.body.data.conflicts[0].variantId,"var-rice"); assert.equal(x.body.data.conflicts[0].available,"18");
  assert.deepEqual(await Promise.all([db.order.count(),db.reservation.count(),db.deliverySlotBooking.count()]),before);
});

test("quote rejects invalid zone variants duplicate lines and fractional count units", async()=>{
  for (const body of [
    {lines:[{variantId:"var-rice",quantity:"1"}],zoneId:"zone-inactive"},
    {lines:[{variantId:"missing",quantity:"1"}]},
    {lines:[{variantId:"var-rice",quantity:"1"},{variantId:"var-rice",quantity:"1"}]},
    {lines:[{variantId:"var-salt",quantity:"1.5"}]},
  ]) assert.ok([400,404].includes((await post(body)).r.status));
  await db.variant.update({where:{id:"var-rice"},data:{active:false}}); assert.equal((await post({lines:[{variantId:"var-rice",quantity:"1"}]})).r.status,404);
});

test("public quote bootstraps guest cookies but creates no order reservation or booking", async()=>{
  const x=await post({lines:[{variantId:"var-rice",quantity:"1"}]}); assert.equal(x.r.status,200); assert.match(x.r.headers.get("set-cookie")??"",/vg_guest=/); assert.equal(await db.order.count(),0); assert.equal(await db.deliverySlotBooking.count(),0);
});

test("quote fails closed when the configured commerce stock location becomes inactive", async()=>{
  await db.location.update({where:{id:"loc_accra"},data:{active:false}});
  const x=await post({lines:[{variantId:"var-rice",quantity:"1"}]});
  assert.equal(x.r.status,503); assert.equal(x.body.error.code,"UNAVAILABLE");
  assert.equal(await db.order.count(),0); assert.equal(await db.reservation.count(),0);
});
