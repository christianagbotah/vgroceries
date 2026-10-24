import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("real storefront payment initiation", () => {
  test("production API main constructs and injects configured payment/refund adapters", () => {
    const main = read("apps/api/src/main.ts");
    expect(main).toContain("createConfiguredProviderAdapters");
    expect(main).toContain("configured.paymentAdapters");
    expect(main).toContain("configured.refundAdapters");
  });

  test("browser contract exposes the real payment-attempt endpoint with request validation", () => {
    const endpoints = read("packages/contracts/src/endpoints.ts");
    const validation = read("packages/contracts/src/validation.ts");
    const operations = read("src/services/operation-registry.ts");
    const client = read("src/services/client.ts");
    expect(endpoints).toContain('"payments.initiate": {"method": "POST", "path": "/orders/{orderId}/payment-attempts"}');
    expect(validation).toContain('"payments.initiate": paymentInitiationRequestSchema');
    expect(operations).toContain('"payments.initiate": { invalidates: [...ORD, ...PAY] }');
    expect(client).toContain("paymentInitiate:");
    expect(client).toContain('api<PaymentInitiationResult>("payments.initiate"');
  });

  test("payment launcher persists one replay key, remembers navigation, and handles server actions", () => {
    expect(existsSync("src/features/checkout/payment-provider-launcher.tsx")).toBe(true);
    const launcher = read("src/features/checkout/payment-provider-launcher.tsx");
    expect(launcher).toContain("localStorage");
    expect(launcher).toContain("crypto.randomUUID");
    expect(launcher).toContain("launched");
    expect(launcher).toContain("apiOps.paymentInitiate");
    expect(launcher).toContain("window.location.assign");
    expect(launcher).toContain("ProviderActionForm");
  });

  test("checkout status uses the real launcher and contains no customer-authored payment outcome controls", () => {
    const status = read("src/app/(storefront)/checkout/status/[id]/page.tsx");
    expect(status).toContain('from "@/features/checkout/payment-provider-launcher"');
    expect(status).toContain("<PaymentProviderLauncher");
    expect(status).not.toContain("apiOps.paymentOutcome");
    expect(status).not.toContain("I've approved the payment");
    expect(status).not.toContain("Payment was declined");
    expect(status).not.toContain("demo — no real money moves");
  });
});
