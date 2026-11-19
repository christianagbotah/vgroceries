/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { PublicOrder } from "../packages/contracts/src/checkout";
import { electronicPaymentPhase, shouldPollPaymentStatus } from "../src/features/checkout/electronic-payment-state";

type Order = Pick<PublicOrder,"paymentMethod"|"paymentStatus"|"fulfilmentStatus"|"paymentAttempts">;
const order = (rest:Partial<Order> = {}): Order => ({
  paymentMethod:"electronic", paymentStatus:"pending",
  fulfilmentStatus:"awaiting_confirmation",paymentAttempts:[],...rest,
});
function attempt(gatewayInitiated?:boolean): PublicOrder["paymentAttempts"][number] {
  return {id:"attempt-1",method:"hosted_checkout",status:"initiated",
    amountMinor:3500,amountLabel:"₵35.00",callbackCount:0,settlementState:"unsettled",
    createdAt:"2026-11-19T09:00:00Z",
    ...(gatewayInitiated===undefined?{}:{gatewayInitiated})};
}
describe("safe customer-facing payment state",()=>{
  test("new electronic order pending before any provider request shows first action",()=>{
    expect(electronicPaymentPhase(order())).toBe("start");
    expect(shouldPollPaymentStatus(order())).toBe(true);
    expect(electronicPaymentPhase(order({paymentStatus:"unpaid"}))).toBe("start");
  });
  test("demo prepared attempt is not a real gateway request",()=>{
    expect(electronicPaymentPhase(order({paymentAttempts:[attempt(false)]}))).toBe("start");
  });
  test("real or demo submitted attempt forbids second prompt",()=>{
    for(const mark of [true,undefined]){
      const o=order({paymentAttempts:[attempt(mark)]});
      expect(electronicPaymentPhase(o)).toBe("verifying");
      expect(shouldPollPaymentStatus(o)).toBe(true);
    }
  });
  test("no second charge when earlier attempt exists even if status says unpaid",()=>{
    const o=order({paymentStatus:"unpaid",paymentAttempts:[attempt()]});
    expect(electronicPaymentPhase(o)).toBe("verifying");
  });
  test("terminal, staff review and cash orders never offer electronic charge",()=>{
    for(const status of ["failed","succeeded","expired","refunded","partially_refunded","requires_review"] as const)
      expect(electronicPaymentPhase(order({paymentStatus:status}))).toBe("finished");
    expect(electronicPaymentPhase(order({fulfilmentStatus:"cancelled"}))).toBe("cancelled");
    expect(electronicPaymentPhase(order({paymentMethod:"cash_on_delivery"}))).toBe("not_electronic");
    expect(shouldPollPaymentStatus(order({paymentMethod:"cash_on_delivery",paymentStatus:"unpaid"}))).toBe(false);
    expect(shouldPollPaymentStatus(order({paymentStatus:"requires_review"}))).toBe(true);
  });
  test("page does not claim pending or review equals money received; errors stay visible",()=>{
    const source=readFileSync("src/app/(storefront)/checkout/status/[id]/page.tsx","utf8");
    expect(source).toContain('const needsAction = electronic && paymentPhase === "start"');
    expect(source).toContain('const awaitingVerification = electronic && paymentPhase === "verifying"');
    expect(source).toContain('electronicPaymentPhase(order) !== "start"');
    expect(source).toContain("Do not start another payment or approve a second prompt");
    expect(source).toContain("Waiting for payment verification");
    expect(source).toContain("Payment needs manual verification");
    expect(source).not.toContain("Payment received — order under review");
    expect(source).toContain('role="alert"');
    expect(source).toContain("setInitiationError(e instanceof ApiError");
    expect(source).toContain("shouldPollPaymentStatus(order)");
    expect(source).not.toContain("apiOps.paymentOutcome");
  });
  test("mock attempt is truly provisional, and exactly one initiation reuses its ID",()=>{
    const engine=readFileSync("src/services/mock/engine/orders.ts","utf8");
    const router=readFileSync("src/services/mock/router.ts","utf8");
    expect(engine).toContain("gatewayInitiated: false");
    expect(router).toContain("attempt.gatewayInitiated = true");
    expect(router).toContain('attempt.status = "pending"');
    expect(router).toContain("attemptId: attempt.id");
    expect(router).toContain("gatewayInitiated: a.gatewayInitiated");
    expect(router).toContain("A payment attempt is already pending verification.");
  });
});
