import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { electronicPaymentPhase, shouldPollPaymentStatus } from "../src/features/checkout/electronic-payment-state";
import type { PublicOrder } from "../packages/contracts/src/checkout";

type PaymentOrder = Pick<PublicOrder, "paymentMethod" | "paymentStatus" | "fulfilmentStatus" | "paymentAttempts">;
const make = (values: Partial<PaymentOrder> = {}): PaymentOrder => ({
  paymentMethod: "electronic",
  paymentStatus: "pending",
  fulfilmentStatus: "awaiting_confirmation",
  paymentAttempts: [],
  ...values,
});
const attempt = (gatewayInitiated?: boolean): PublicOrder["paymentAttempts"][number] => ({
  id: "test-attempt-1",
  method: "hosted_checkout",
  status: "initiated",
  amountMinor: 12000,
  amountLabel: "₵120.00",
  callbackCount: 0,
  settlementState: "unsettled",
  createdAt: "2026-11-17T00:00:00Z",
  ...(gatewayInitiated !== undefined ? { gatewayInitiated } : {}),
});

describe("customer-safe electronic payment phases", () => {
  test("pending electronic order with no gateway request still offers first secure payment", () => {
    expect(electronicPaymentPhase(make())).toBe("start");
    expect(shouldPollPaymentStatus(make())).toBe(true);
    expect(electronicPaymentPhase(make({paymentStatus:"unpaid"}))).toBe("start");
    expect(shouldPollPaymentStatus(make({paymentStatus:"unpaid"}))).toBe(true);
  });
  test("prepared mock attempt does not count as a gateway request until initiated", () => {
    expect(electronicPaymentPhase(make({paymentAttempts:[attempt(false)]}))).toBe("start");
  });
  test("started provider request is a verification wait, not another Pay now action", () => {
    expect(electronicPaymentPhase(make({paymentAttempts:[attempt(true)]}))).toBe("verifying");
    expect(shouldPollPaymentStatus(make({paymentAttempts:[attempt(true)]}))).toBe(true);
  });
  test("legacy live API attempts lacking optional marker fail closed", () => {
    expect(electronicPaymentPhase(make({paymentAttempts:[attempt()]}))).toBe("verifying");
  });
  test("terminal, cancelled and cash orders never show the electronic charge action", () => {
    for (const status of ["failed", "succeeded", "expired", "refunded", "partially_refunded"] as const) {
      expect(electronicPaymentPhase(make({paymentStatus:status}))).toBe("finished");
      expect(shouldPollPaymentStatus(make({paymentStatus:status}))).toBe(false);
    }
    expect(electronicPaymentPhase(make({fulfilmentStatus:"cancelled"}))).toBe("cancelled");
    expect(electronicPaymentPhase(make({paymentMethod:"cash_on_delivery"}))).toBe("not_electronic");
    expect(shouldPollPaymentStatus(make({paymentMethod:"cash_on_delivery",paymentStatus:"unpaid"}))).toBe(false);
  });
  test("staff review and refund pending still poll for server-authoritative updates", () => {
    expect(shouldPollPaymentStatus(make({paymentStatus:"requires_review"}))).toBe(true);
    expect(shouldPollPaymentStatus(make({paymentStatus:"refund_pending"}))).toBe(true);
  });
  test("UI shows gateway errors, blocks a second charge and offers refresh/support", () => {
    const ui = readFileSync("src/app/(storefront)/checkout/status/[id]/page.tsx", "utf8");
    expect(ui).toContain('electronicPaymentPhase(order) !== "start"');
    expect(ui).toContain('const needsAction = paymentPhase === "start"');
    expect(ui).toContain('const awaitingVerification = paymentPhase === "verifying"');
    expect(ui).toContain("Do not start another payment or approve a second prompt");
    expect(ui).toContain("Refresh payment status");
    expect(ui).toContain('role="alert"');
    expect(ui).toContain("setInitiationError(e instanceof ApiError");
    expect(ui).toContain("const [initiationError, setInitiationError]");
    expect(ui).toContain("shouldPollPaymentStatus(order)");
    expect(ui).not.toContain("apiOps.paymentOutcome");
  });
  test("mock gateway prepares an attempt before handoff and marks it only on initiation", () => {
    const mockOrders = readFileSync("src/services/mock/engine/orders.ts", "utf8");
    const mockRouter = readFileSync("src/services/mock/router.ts", "utf8");
    expect(mockOrders).toContain("gatewayInitiated: false");
    expect(mockRouter).toContain("attempt.gatewayInitiated = true");
    expect(mockRouter).toContain("attempt.status = \"pending\"");
    expect(mockRouter).toContain("attemptId: attempt.id");
    expect(mockRouter).toContain("gatewayInitiated: a.gatewayInitiated");
  });
});
