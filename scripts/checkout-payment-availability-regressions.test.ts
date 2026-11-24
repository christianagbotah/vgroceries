/// <reference types="bun-types" />
import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {restEndpoints} from "../packages/contracts/src/endpoints";
const read=(file:string)=>readFileSync(file,"utf8");

describe("server-owned checkout electronic payment readiness",()=>{
 test("public status endpoint is read-only, cache-disabled and sanitized",()=>{
  expect(restEndpoints["checkout.payment-availability"]).toEqual({method:"GET",path:"/checkout/payment-availability"});
  const controller=read("apps/api/src/orders/checkout.controller.ts");
  expect(controller).toContain('@Get("payment-availability") @Header("Cache-Control","no-store")');
  expect(controller).toContain("this.payments.assertReadyIfConfigured()");
  expect(controller).toContain("this.payments.resolveElectronicMethod()");
  expect(controller).toContain('electronicAvailable:false,mode:"production"');
  expect(controller).not.toContain("HUBTEL_CLIENT_SECRET");
 });
 test("browser blocks unavailable electronic orders before creating an order",()=>{
  const source=read("src/app/(storefront)/checkout/page.tsx");
  expect(source).toContain('useState<"checking"|"available"|"unavailable">("checking")');
  expect(source).toContain("apiOps.checkoutPaymentAvailability()");
  expect(source).toContain('electronicAvailability!=="available"');
  expect(source).toContain("No money has been requested");
  expect(source).toContain('paymentMethod==="electronic"&&electronicAvailability!=="available"');
  expect(source).toContain("setPaymentAvailabilityRefresh(n=>n+1)");
  expect(source).toContain("You may choose cash at collection or delivery only if offered above.");
 });
 test("mock readiness remains demo and production collection policy stays provider-gated",()=>{
  const mock=read("src/services/mock/router.ts");
  const client=read("src/services/client.ts");
  expect(mock).toContain('case "checkout.payment-availability":');
  expect(mock).toContain('electronicAvailable:true,mode:"demo"');
  expect(client).toContain('"checkout.payment-availability"');
  const policy=read("apps/api/src/payments/payment-policy.service.ts");
  expect(policy).toContain("this.registry.requireConfigured()");
  expect(policy).toContain("adapter.capabilities().methods.includes(method)");
  expect(policy).not.toContain("this.refundRegistry.require(adapter.id, method)");
  expect(read("apps/api/src/http/production-openapi.ts")).toContain('doc.paths["/api/v1/checkout/payment-availability"]');
 });
});
