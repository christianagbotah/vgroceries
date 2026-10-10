import { after,before,test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync,readFileSync } from "node:fs";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/bootstrap";
let app:INestApplication,base:string;
before(async()=>{app=await createApplication();await app.listen(0,"127.0.0.1");base=await app.getUrl();});after(async()=>{await app.close();});
const expected=["/api/v1/account/orders","/api/v1/account/orders/{orderId}/cancel","/api/v1/auth/logout","/api/v1/auth/me","/api/v1/auth/refresh","/api/v1/auth/sessions","/api/v1/catalog/categories","/api/v1/catalog/home","/api/v1/catalog/products","/api/v1/catalog/products/{slug}","/api/v1/catalog/products:by-variants","/api/v1/checkout/complete","/api/v1/checkout/quote","/api/v1/checkout/zones","/api/v1/checkout/zones/{zoneId}/slots","/api/v1/health/live","/api/v1/health/ready","/api/v1/inventory/overview","/api/v1/inventory/receive","/api/v1/orders/{orderId}","/api/v1/orders/{orderId}/payment-attempts","/api/v1/orders/track","/api/v1/payments","/api/v1/payments/providers/{provider}/events","/api/v1/payments/{attemptId}/reconcile"].sort();
test("production OpenAPI documents exactly the implemented commerce and payments authority",async()=>{const d=await (await fetch(base+"/api/v1/openapi.json")).json();assert.equal(d.info.title,"Variety Groceries production API");assert.deepEqual(Object.keys(d.paths).sort(),expected);assert.equal(d.paths["/api/v1/orders/{orderId}/payment-outcome"],undefined);assert.equal(d.paths["/api/v1/checkout/quote"].post.responses["200"]!==undefined,true);assert.equal(d.paths["/api/v1/checkout/complete"].post.responses["201"]!==undefined,true);assert.equal(d.paths["/api/v1/orders/track"].post.responses["200"]!==undefined,true);assert.equal(d.paths["/api/v1/account/orders/{orderId}/cancel"].post.responses["200"]!==undefined,true);const complete=d.paths["/api/v1/checkout/complete"].post;assert.ok(complete.parameters.some((p:any)=>p.name==="Idempotency-Key"&&p.required));assert.deepEqual(complete.security,[{cookieAuth:[]},{bearerAuth:[]},{guestAuth:[]}]);assert.deepEqual(d.paths["/api/v1/orders/{orderId}"].get.security,[{cookieAuth:[]},{bearerAuth:[]},{guestAuth:[]}]);assert.deepEqual(d.paths["/api/v1/account/orders"].get.security,[{cookieAuth:[]},{bearerAuth:[]}]);assert.deepEqual(d.paths["/api/v1/account/orders/{orderId}/cancel"].post.security,[{cookieAuth:[]},{bearerAuth:[]}]);assert.equal(d.components.securitySchemes.guestAuth.in,"cookie");assert.equal(d.components.securitySchemes.guestAuth.name,"vg_guest");assert.ok(!JSON.stringify(d.components.schemas.PublicOrder).includes("lotId"));});

test("orders source cannot mutate Reservation or create payment authority directly",()=>{const dir=join(process.cwd(),"src/orders");const source=readdirSync(dir).filter(x=>x.endsWith(".ts")).map(x=>readFileSync(join(dir,x),"utf8")).join("\n");assert.doesNotMatch(source,/\.reservation\.(?:create|update|updateMany|updateManyAndReturn|delete|deleteMany)\s*\(/);assert.doesNotMatch(source,/\.paymentAttempt\.(?:create|update|upsert|delete)\s*\(/);assert.doesNotMatch(source,/payment-outcome/);});

test("payments and orders preserve stock and verified money source authority",()=>{
  const paymentsDir=join(process.cwd(),"src/payments");
  const paymentFiles=Object.fromEntries(readdirSync(paymentsDir).filter(x=>x.endsWith(".ts")).map(x=>[x,readFileSync(join(paymentsDir,x),"utf8")]));
  const allPayments=Object.values(paymentFiles).join("\n");
  assert.doesNotMatch(allPayments,/\.reservation\.(?:create|update|updateMany|updateManyAndReturn|delete|deleteMany)\s*\(/);

  const verifiedIngress=(paymentFiles["payment-event.service.ts"]??"")+"\n"+(paymentFiles["payment-reconciliation.service.ts"]??"");
  assert.doesNotMatch(verifiedIngress,/paymentStatus\s*:\s*["'](?:succeeded|failed|expired)["']/);
  assert.match(paymentFiles["payment-event.service.ts"]??"",/\.outcomes\.apply\s*\(/);
  assert.match(paymentFiles["payment-reconciliation.service.ts"]??"",/\.outcomes\.apply\s*\(/);
  assert.match(paymentFiles["payment-outcome.service.ts"]??"",/paymentStatus\s*:\s*["']succeeded["']/);

  const ordersDir=join(process.cwd(),"src/orders");
  const allOrders=readdirSync(ordersDir).filter(x=>x.endsWith(".ts")).map(x=>readFileSync(join(ordersDir,x),"utf8")).join("\n");
  assert.doesNotMatch(allOrders,/\.paymentAttempt\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/);
});
